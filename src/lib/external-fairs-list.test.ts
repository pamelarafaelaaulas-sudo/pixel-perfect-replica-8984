import { describe, expect, it } from "vitest";
import { externalFairRows, type FairListInput } from "./external-fairs-list";

const project = (over: Record<string, unknown> = {}) => ({
  title: "Título",
  theme: null,
  area_code: "BIO",
  code_number: 1,
  current_phase: 7,
  external_fairs_interest: true,
  external_fairs: ["FETEC/MS"],
  ethics_human_research: null,
  ethics_collection: [],
  ethics_form_url: null,
  ...over,
});

const cls = (projects: ReturnType<typeof project>[]): FairListInput => ({
  id: "c",
  name: "9º A",
  code_label: "9A",
  ethics_form_template_url: "https://forms.gle/modelo",
  groups: projects.map((p, i) => ({ id: `g${i}`, group_name: `G${i}`, group_members: [], projects: p as never })),
});

describe("external fair list", () => {
  it("lists only groups that want an external fair", () => {
    const rows = externalFairRows([cls([project(), project({ external_fairs_interest: false })])]);
    expect(rows.map((r) => r.groupId)).toEqual(["g0"]);
  });

  it("marks ethics screening status", () => {
    const rows = externalFairRows([
      cls([
        project({ code_number: 1 }),
        project({ code_number: 2, ethics_human_research: false }),
        project({ code_number: 3, ethics_human_research: true, ethics_collection: ["online"], ethics_form_url: "https://forms.gle/modelo" }),
        project({ code_number: 4, ethics_human_research: true, ethics_collection: ["online"], ethics_form_url: "https://forms.gle/grupo" }),
      ]),
    ]);
    expect(rows.map((r) => r.ethics)).toEqual(["pending", "no_humans", "incomplete", "ok"]);
  });
});
