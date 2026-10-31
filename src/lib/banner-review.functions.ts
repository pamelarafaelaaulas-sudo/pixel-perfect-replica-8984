import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateBannerDiagnosis } from "./banner-review.server";
import { SEVERITY_LABEL, parseBannerFeedback } from "./banner-review";
import { projectCode } from "./project-code";

const MAX_AI_BYTES = 20 * 1024 * 1024;

function mediaTypeOf(name: string, blobType: string): string | null {
  const t = blobType.toLowerCase();
  if (t === "application/pdf" || t === "image/png" || t === "image/jpeg") return t;
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return null;
}

/**
 * AI pre-evaluation of the group's current banner file, compared with the written project.
 * Members and the class teacher may ask; the result (with scores) is saved by the server only.
 */
export const diagnoseBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: isMember }, { data: isTeacher }] = await Promise.all([
      sb.rpc("is_group_member", { _group_id: data.groupId }),
      sb.rpc("teaches_group", { _group_id: data.groupId }),
    ]);
    if (!isMember && !isTeacher) throw new Error("Só o grupo e a professora podem pedir o diagnóstico.");

    const { data: group, error } = await sb
      .from("groups")
      .select("id, group_name, classes!groups_class_id_fkey(code_label), projects(*, banner_reviews(*))")
      .eq("id", data.groupId)
      .maybeSingle();
    const p = group?.projects;
    if (error || !group || !p) throw new Error("Projeto não encontrado.");
    if (!p.banner_file_path) throw new Error("Envie o arquivo do banner antes de pedir o diagnóstico.");

    const file = await sb.storage.from("banners").download(p.banner_file_path);
    if (file.error || !file.data) throw new Error("Não foi possível abrir o arquivo do banner.");
    if (file.data.size > MAX_AI_BYTES) throw new Error("O arquivo passa de 20 MB, grande demais para a IA. Exporte em PDF padrão (não “para impressão”) ou PNG.");
    const fileName = p.banner_file_name ?? "banner";
    const mediaType = mediaTypeOf(fileName, file.data.type);
    if (!mediaType) throw new Error("A IA lê banners em PDF, PNG ou JPG.");

    const reviews = [...(p.banner_reviews ?? [])].sort((a, b) => a.round - b.round);
    const answered = reviews.filter((r) => r.resubmitted_at);
    const version = answered.length + 1;
    const lastAnswered = answered.at(-1);

    let previous: string | null = null;
    if (lastAnswered && lastAnswered.resubmitted_file_path === p.banner_file_path) {
      const { data: prevDiag } = await sb
        .from("banner_diagnoses")
        .select("feedback")
        .eq("group_id", data.groupId)
        .eq("file_path", lastAnswered.reviewed_file_path ?? "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Students cannot read diagnoses directly; the teacher's notes are enough context then.
      const prevNotes = prevDiag
        ? parseBannerFeedback(prevDiag.feedback)
            .annotations.filter((a) => a.severity !== "destaque")
            .map((a) => `- [${SEVERITY_LABEL[a.severity]}] ${a.section}: ${a.note}`)
            .join("\n")
        : "";
      previous =
        `Versão ${version - 1} revisada pela professora. Observações dela:\n${lastAnswered.notes || "(sem texto)"}` +
        (prevNotes ? `\n\nApontamentos do diagnóstico anterior:\n${prevNotes}` : "");
    }

    const code = projectCode(p.area_code, group.classes?.code_label, p.code_number);
    const fields: [string, string | null][] = [
      ["Código do projeto", code],
      ["Tema", p.theme],
      ["Pergunta norteadora", p.guiding_question],
      ["Aplicação social", p.social_application],
      ["Título", p.title],
      ["Objetivo geral", p.general_objective],
      ["Objetivos específicos", p.specific_objectives],
      ["Metodologia", p.methodology],
      ["Introdução", p.introduction],
      ["Resultados e discussão", p.results_discussion],
      ["Conclusão", p.conclusion],
      ["Referências", p.references_list],
      ["Resumo", p.abstract],
      ["Palavras-chave", p.keywords],
    ];
    const projectText = fields
      .filter(([, v]) => v?.trim())
      .map(([k, v]) => `### ${k}\n${v!.trim()}`)
      .join("\n\n")
      .slice(0, 40000);

    const diagnosis = await generateBannerDiagnosis({
      file: new Uint8Array(await file.data.arrayBuffer()),
      mediaType,
      fileName,
      projectText: projectText || "(o grupo ainda não escreveu o projeto)",
      previous,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: saveError } = await supabaseAdmin.from("banner_diagnoses").insert({
      project_id: p.id,
      group_id: group.id,
      version,
      file_path: p.banner_file_path,
      file_name: fileName,
      requested_by: context.userId,
      total: diagnosis.total,
      axes: diagnosis.axes,
      feedback: diagnosis.feedback,
      critical: diagnosis.critical,
    });
    if (saveError) {
      console.error("Failed to save banner diagnosis", saveError);
      throw new Error("O diagnóstico foi gerado, mas não foi salvo. Tente de novo.");
    }
    return { version };
  });
