import { ethicsProblems, normalizeFairs, type ExternalFair } from "./ethics";
import { projectCode } from "./project-code";

export type EthicsStatus = "pending" | "no_humans" | "ok" | "incomplete";

export const ETHICS_STATUS_LABEL: Record<EthicsStatus, string> = {
  pending: "Ainda não respondeu",
  no_humans: "Sem seres humanos",
  ok: "Com seres humanos — triagem completa",
  incomplete: "Com seres humanos — falta completar",
};

export type FairListInput = {
  id: string;
  name: string;
  code_label: string | null;
  ethics_form_template_url: string | null;
  groups: {
    id: string;
    group_name: string;
    group_members: { profiles: { name: string | null } | null }[] | null;
    projects:
      | {
          title: string | null;
          theme: string | null;
          area_code: string | null;
          code_number: number | null;
          current_phase: number;
          external_fairs_interest: boolean;
          external_fairs: string[];
          ethics_human_research: boolean | null;
          ethics_collection: string[];
          ethics_form_url: string | null;
        }[]
      | null;
  }[] | null;
};

export type FairListRow = {
  groupId: string;
  className: string;
  groupName: string;
  code: string | null;
  title: string;
  members: string;
  fairs: ExternalFair[];
  phase: number;
  ethics: EthicsStatus;
  formUrl: string | null;
  collection: string[];
};

/** Only groups that opted in to an external fair, sorted by project code then class/group. */
export function externalFairRows(classes: FairListInput[]): FairListRow[] {
  const rows: FairListRow[] = [];
  for (const c of classes) {
    for (const g of c.groups ?? []) {
      const p = g.projects?.[0];
      if (!p?.external_fairs_interest) continue;
      const ethics: EthicsStatus =
        p.ethics_human_research == null
          ? "pending"
          : !p.ethics_human_research
            ? "no_humans"
            : ethicsProblems({ ...p, ethics_form_template_url: c.ethics_form_template_url }).length
              ? "incomplete"
              : "ok";
      rows.push({
        groupId: g.id,
        className: c.name,
        groupName: g.group_name,
        code: projectCode(p.area_code, c.code_label, p.code_number),
        title: p.title?.trim() || p.theme?.trim() || "",
        members: (g.group_members ?? []).map((m) => m.profiles?.name).filter(Boolean).join(", "),
        fairs: normalizeFairs(true, p.external_fairs ?? []),
        phase: p.current_phase,
        ethics,
        formUrl: p.ethics_form_url,
        collection: p.ethics_collection ?? [],
      });
    }
  }
  return rows.sort(
    (a, b) =>
      (a.code ?? "~").localeCompare(b.code ?? "~") ||
      a.className.localeCompare(b.className) ||
      a.groupName.localeCompare(b.groupName),
  );
}
