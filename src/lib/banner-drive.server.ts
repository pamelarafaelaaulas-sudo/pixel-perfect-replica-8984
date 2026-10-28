import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { projectCode } from "./project-code";

/**
 * Copies each group's final banner file into the teacher's Google Drive
 * (PamLab — Banners / <turma> / <código> — <grupo>.pdf), through the connector gateway.
 * Only the teacher whose PamLab e-mail equals the connected Google account gets copies,
 * so another teacher's students never land in this Drive.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const ROOT_NAME = "PamLab — Banners";

type Admin = SupabaseClient<Database>;

export class DriveUnavailable extends Error {}

function authHeaders() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const drive = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovable || !drive) throw new DriveUnavailable("Google Drive não está conectado.");
  return { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": drive };
}

async function drive(path: string, init: RequestInit = {}) {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google Drive request failed [${res.status}] ${path}: ${body}`);
    throw new Error(`Google Drive [${res.status}]: ${body.slice(0, 300)}`);
  }
  return res;
}

async function driveJson<T>(path: string, init: RequestInit = {}) {
  return (await (await drive(path, init)).json()) as T;
}

export async function driveAccountEmail(): Promise<string | null> {
  const r = await driveJson<{ user?: { emailAddress?: string } }>("/drive/v3/about?fields=user(emailAddress)");
  return r.user?.emailAddress?.trim().toLowerCase() ?? null;
}

export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
export const fileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function findFolder(tag: string): Promise<{ id: string; name: string } | null> {
  const query = `mimeType='${FOLDER_MIME}' and trashed=false and appProperties has { key='pamlab' and value='${q(tag)}' }`;
  const r = await driveJson<{ files: { id: string; name: string }[] }>(
    `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`,
  );
  return r.files[0] ?? null;
}

async function ensureFolder(tag: string, name: string, parent?: string) {
  const found = await findFolder(tag);
  if (found) {
    if (found.name !== name)
      await drive(`/drive/v3/files/${found.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    return found.id;
  }
  const created = await driveJson<{ id: string }>("/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, appProperties: { pamlab: tag }, ...(parent ? { parents: [parent] } : {}) }),
  });
  return created.id;
}

/** The class folder inside "PamLab — Banners", created on first use. */
export async function ensureClassFolder(classId: string, className: string) {
  const root = await ensureFolder("banners-root", ROOT_NAME);
  return ensureFolder(`class-${classId}`, className, root);
}

function multipart(metadata: object, bytes: ArrayBuffer, mime: string) {
  const boundary = `pamlab-${crypto.randomUUID()}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const body = new Blob([head, bytes, `\r\n--${boundary}--`]);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

async function fileIsLive(id: string) {
  try {
    const r = await driveJson<{ trashed?: boolean }>(`/drive/v3/files/${id}?fields=trashed`);
    return !r.trashed;
  } catch {
    return false;
  }
}

export type SyncResult =
  | { status: "synced"; syncedAt: string; fileUrl: string }
  | { status: "unchanged"; syncedAt: string; fileUrl: string }
  | { status: "no_file" }
  | { status: "not_owner" };

/** Copies one project's current banner file to the Drive (or replaces the earlier copy). */
export async function syncProjectBanner(admin: Admin, projectId: string, ownerEmail: string | null): Promise<SyncResult> {
  const { data: p, error } = await admin
    .from("projects")
    .select(
      "id, group_id, area_code, project_seq, banner_file_path, banner_file_name, groups!projects_group_id_fkey(group_name, classes!groups_class_id_fkey(id, name, code_label, profiles!classes_teacher_id_fkey(email)))",
    )
    .eq("id", projectId)
    .single();
  if (error || !p) throw new Error("Projeto não encontrado.");
  const group = p.groups;
  const cls = group?.classes;
  const teacherEmail = cls?.profiles?.email?.trim().toLowerCase() ?? null;
  if (!group || !cls || !ownerEmail || teacherEmail !== ownerEmail) return { status: "not_owner" };
  if (!p.banner_file_path) return { status: "no_file" };

  const { data: prev } = await admin
    .from("banner_drive_files")
    .select("drive_file_id, source_path, synced_at")
    .eq("project_id", p.id)
    .maybeSingle();
  const prevLive = prev ? await fileIsLive(prev.drive_file_id) : false;
  if (prev && prevLive && prev.source_path === p.banner_file_path)
    return { status: "unchanged", syncedAt: prev.synced_at, fileUrl: fileUrl(prev.drive_file_id) };

  const { data: blob, error: dlError } = await admin.storage.from("banners").download(p.banner_file_path);
  if (dlError || !blob) throw new Error("Não foi possível ler o arquivo do banner.");
  const mime = blob.type || "application/pdf";
  const ext = (p.banner_file_name ?? p.banner_file_path).split(".").pop()?.toLowerCase() || "pdf";
  const code = projectCode(p.area_code, cls.code_label, p.project_seq);
  const name = `${code ? `${code} — ` : ""}${group.group_name}.${ext}`;
  const bytes = await blob.arrayBuffer();

  let driveId: string;
  if (prev && prevLive) {
    const { body, contentType } = multipart({ name }, bytes, mime);
    await drive(`/upload/drive/v3/files/${prev.drive_file_id}?uploadType=multipart&fields=id`, {
      method: "PATCH",
      headers: { "Content-Type": contentType },
      body,
    });
    driveId = prev.drive_file_id;
  } else {
    const folder = await ensureClassFolder(cls.id, cls.name);
    const { body, contentType } = multipart({ name, parents: [folder] }, bytes, mime);
    const created = await driveJson<{ id: string }>("/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
    driveId = created.id;
  }

  const syncedAt = new Date().toISOString();
  const { error: saveError } = await admin.from("banner_drive_files").upsert({
    project_id: p.id,
    group_id: p.group_id,
    drive_file_id: driveId,
    source_path: p.banner_file_path,
    synced_at: syncedAt,
  });
  if (saveError) console.error("Failed to record banner Drive copy", saveError);
  return { status: "synced", syncedAt, fileUrl: fileUrl(driveId) };
}
