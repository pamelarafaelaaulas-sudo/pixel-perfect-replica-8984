import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { teacherExportQuery, teacherNumberingQuery } from "@/lib/queries";
import { buildNumberingRows, buildStudentGrades } from "@/lib/export-rows";
import { areaLabel } from "@/lib/project-code";
import { BIMESTERS } from "@/lib/phases";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function useSheetDownload(make: () => Promise<{ blob: Blob; name: string }>) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const { blob, name } = await make();
      const { downloadBlob } = await import("@/lib/export-xlsx");
      downloadBlob(blob, name);
      toast.success("Planilha baixada");
    } catch (e) {
      toast.error(`Não foi possível gerar a planilha. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

/** Downloads every project's number and code (all of the teacher's classes) as a spreadsheet. */
export function NumberingSheetButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const qc = useQueryClient();
  const { busy, run } = useSheetDownload(async () => {
    const classes = await qc.fetchQuery(teacherNumberingQuery);
    const rows = buildNumberingRows(classes, areaLabel);
    const { buildNumberingWorkbook } = await import("@/lib/export-xlsx");
    return { blob: await buildNumberingWorkbook(rows), name: `numeracao-trabalhos-${today()}.xlsx` };
  });
  return (
    <Button variant={variant} onClick={run} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Planilha da numeração
    </Button>
  );
}

/** Downloads one sheet per class with each student's name and final grade per bimestre. */
export function StudentGradesSheetButton() {
  const qc = useQueryClient();
  const { busy, run } = useSheetDownload(async () => {
    const data = await qc.fetchQuery(teacherExportQuery);
    const blocks = buildStudentGrades(data.classes);
    const { buildStudentGradesWorkbook } = await import("@/lib/export-xlsx");
    const titles = BIMESTERS.map((b) => `${b.number}º bimestre`);
    return { blob: await buildStudentGradesWorkbook(blocks, titles), name: `notas-alunos-por-turma-${today()}.xlsx` };
  });
  return (
    <Button variant="outline" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Planilha de notas por turma
    </Button>
  );
}
