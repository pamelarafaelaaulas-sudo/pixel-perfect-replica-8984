import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildReminders,
  REMINDER_LANGUAGE,
  REMINDER_TEMPLATE,
  reminderParams,
  type ReminderInputClass,
} from "./reminders";

type Db = SupabaseClient<Database>;

const GATEWAY_URL = "https://connector-gateway.lovable.dev/whatsapp";

/**
 * Only this teacher account may send from the connected WhatsApp number (it is her own number,
 * shown to students as "Professora Pâmela"). Other teachers see the screen but cannot send.
 */
export const WHATSAPP_OWNER_EMAILS = ["pamelarafaelaaulas@gmail.com"];

function keys() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const wa = process.env["WHATSAPP_API_KEY"];
  if (!lovable) throw new Error("LOVABLE_API_KEY is not configured");
  if (!wa) throw new Error("WHATSAPP_API_KEY is not configured");
  return { lovable, wa };
}

async function gateway(path: string, init: RequestInit = {}) {
  const { lovable, wa } = keys();
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": wa,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, text, json };
}

export function isWhatsappOwner(email: string | null | undefined) {
  return !!email && WHATSAPP_OWNER_EMAILS.includes(email.trim().toLowerCase());
}

/** Connected number and the reminder template's review status (APPROVED / PENDING / REJECTED / MISSING). */
export async function whatsappStatus() {
  const [phone, tpl] = await Promise.all([
    gateway("/phone_number?fields=display_phone_number,verified_name"),
    gateway(`/message_templates?fields=name,status,rejected_reason&name=${REMINDER_TEMPLATE}`),
  ]);
  if (!phone.ok) console.error(`WhatsApp phone lookup failed [${phone.status}]: ${phone.text}`);
  if (!tpl.ok) console.error(`WhatsApp template lookup failed [${tpl.status}]: ${tpl.text}`);
  const p = (phone.json ?? {}) as { display_phone_number?: string; verified_name?: string };
  const list = ((tpl.json ?? {}) as { data?: { name: string; status: string; rejected_reason?: string }[] }).data ?? [];
  const t = list.find((x) => x.name === REMINDER_TEMPLATE);
  return {
    connected: phone.ok,
    displayPhone: p.display_phone_number ?? null,
    verifiedName: p.verified_name ?? null,
    templateStatus: tpl.ok ? (t?.status ?? "MISSING") : "UNKNOWN",
    rejectedReason: t?.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
  };
}

/** The teacher's classes with what the reminder logic needs. */
export async function loadReminderClasses(db: Db, teacherId: string): Promise<ReminderInputClass[]> {
  const { data, error } = await db
    .from("classes")
    .select(
      `id, name,
      schedules(phase_number, due_date),
      groups!groups_class_id_fkey(id, group_name,
        projects(current_phase, phase_submissions(phase_number)),
        group_members(student_id, whatsapp, profiles(name))
      )`,
    )
    .eq("teacher_id", teacherId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ReminderInputClass[];
}

export async function previewReminders(db: Db, teacherId: string, senderPhone: string | null, now = new Date()) {
  return buildReminders(await loadReminderClasses(db, teacherId), now, { senderPhone });
}

/**
 * Sends the reminder to everyone due one now and records each attempt (accepted with Meta's id,
 * or failed with the error). Uses the admin client: call only after verifying the teacher.
 */
export async function sendReminders(admin: Db, teacherId: string, trigger: "manual" | "auto", now = new Date()) {
  const status = await whatsappStatus();
  if (status.templateStatus !== "APPROVED") {
    return { sent: 0, failed: 0, total: 0, templateStatus: status.templateStatus };
  }
  const { reminders } = await previewReminders(admin, teacherId, status.displayPhone, now);
  let sent = 0;
  let failed = 0;
  for (const r of reminders) {
    const res = await gateway("/messages", {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: r.phone,
        type: "template",
        template: {
          name: REMINDER_TEMPLATE,
          language: { code: REMINDER_LANGUAGE },
          components: [{ type: "body", parameters: reminderParams(r).map((text) => ({ type: "text", text })) }],
        },
      }),
    });
    const waId = res.ok ? ((res.json as { messages?: { id: string }[] } | null)?.messages?.[0]?.id ?? null) : null;
    if (!res.ok) console.error(`WhatsApp send failed [${res.status}]: ${res.text}`);
    const row = {
      teacher_id: teacherId,
      class_id: r.classId,
      group_id: r.groupId,
      student_id: r.studentId,
      student_name: r.studentName,
      phone: r.phone,
      phase_number: r.phase,
      due_date: r.dueDate,
      days_left: r.daysLeft,
      trigger,
      wa_message_id: waId,
      status: waId ? "accepted" : "failed",
      error: waId ? null : `[${res.status}] ${res.text.slice(0, 500)}`,
      failed_at: waId ? null : new Date().toISOString(),
    };
    const ins = await admin.from("whatsapp_messages").insert(row);
    if (ins.error) console.error(`Could not record WhatsApp message: ${ins.error.message}`);
    if (waId) sent++;
    else failed++;
  }
  // Status callbacks may have arrived before the ids above were saved.
  await processPendingEvents(admin, 25);
  return { sent, failed, total: reminders.length, templateStatus: status.templateStatus };
}

type StatusItem = { id: string; status: string; timestamp?: string; errors?: { code?: number; title?: string; message?: string }[] };

/** Applies one stored webhook delivery. Returns true when it is fully handled. */
async function processEvent(admin: Db, ev: { event: string; payload: unknown; received_at: string }): Promise<boolean> {
  if (ev.event !== "whatsapp.status") return true; // stored as-is; nothing else to do
  const payload = ev.payload as { entry?: { changes?: { value?: { statuses?: StatusItem[] } }[] }[] };
  const statuses = payload.entry?.[0]?.changes?.[0]?.value?.statuses ?? [];
  let allMatched = true;
  for (const s of statuses) {
    const at = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : ev.received_at;
    const err = s.errors?.length
      ? s.errors.map((e) => [e.code, e.title, e.message].filter(Boolean).join(" — ")).join("; ")
      : null;
    const { data, error } = await admin.rpc("apply_whatsapp_status", {
      _wa_id: s.id,
      _status: s.status,
      _at: at,
      _error: err ?? "",
    });
    if (error) throw new Error(error.message);
    if (!data) allMatched = false;
  }
  return allMatched;
}

const GIVE_UP_MS = 7 * 86_400_000;

/** Processes one stored delivery and records the outcome. */
export async function processStoredEvent(
  admin: Db,
  ev: { id: string; event: string; payload: unknown; received_at: string; attempts: number },
) {
  const now = new Date();
  try {
    const done = await processEvent(admin, ev);
    const expired = now.getTime() - new Date(ev.received_at).getTime() > GIVE_UP_MS;
    const { error } = await admin
      .from("whatsapp_webhook_events")
      .update({
        attempts: ev.attempts + 1,
        last_attempt_at: now.toISOString(),
        processed_at: done || expired ? now.toISOString() : null,
        processing_error: done ? null : expired ? "Nenhuma mensagem enviada com esse id" : "Aguardando a mensagem enviada",
      })
      .eq("id", ev.id);
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    await admin
      .from("whatsapp_webhook_events")
      .update({ attempts: ev.attempts + 1, last_attempt_at: now.toISOString(), processing_error: (e as Error).message })
      .eq("id", ev.id);
    return false;
  }
}

/** Retries unfinished deliveries, least recently attempted first so blocked rows cannot starve others. */
export async function processPendingEvents(admin: Db, limit = 20) {
  const { data, error } = await admin
    .from("whatsapp_webhook_events")
    .select("id, event, payload, received_at, attempts")
    .is("processed_at", null)
    .order("last_attempt_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) {
    console.error(`Could not load pending WhatsApp events: ${error.message}`);
    return;
  }
  for (const ev of data ?? []) await processStoredEvent(admin, ev);
}
