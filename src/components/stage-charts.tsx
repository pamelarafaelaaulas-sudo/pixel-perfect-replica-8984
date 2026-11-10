import { useEffect, useRef, useState } from "react";
import { ChartColumnIncreasing, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { chartProblems, emptyChart, figureCaption, type StageChart } from "@/lib/stage-charts";
import { tableSource } from "@/lib/result-tables";

export function StageChartView({ chart, index }: { chart: StageChart; index: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setError(false);
    import("@/lib/chart-render").then(async ({ renderStageChart }) => {
      if (cancelled) return;
      const instance = await renderStageChart(target, chart);
      if (cancelled) instance.destroy(); else destroy = () => instance.destroy();
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; destroy?.(); };
  }, [chart]);
  return <figure className="my-4 min-w-0">
    <figcaption className="mb-2 text-sm font-medium">{figureCaption(index, chart.title)}</figcaption>
    <canvas ref={canvas} width={800} height={450} className="h-auto w-full max-w-full" role="img" aria-label={figureCaption(index, chart.title)} />
    {error && <p className="text-sm text-destructive">Não foi possível desenhar o gráfico.</p>}
    <p className="mt-2 text-xs text-muted-foreground">{tableSource(chart.source)}</p>
    <table className="sr-only"><caption>{chart.title}</caption><thead><tr><th>Categoria</th><th>Valor</th></tr></thead><tbody>{chart.points.map((p, i) => <tr key={i}><td>{p.label}</td><td>{p.value}</td></tr>)}</tbody></table>
  </figure>;
}

export function StageChartsEditor({ value, onChange, editable }: { value: StageChart[]; onChange: (v: StageChart[]) => void; editable: boolean }) {
  const update = (index: number, chart: StageChart) => onChange(value.map((c, i) => i === index ? chart : c));
  return <div className="mt-4 min-w-0 space-y-4 border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-2 font-medium"><ChartColumnIncreasing className="size-4 text-primary" /> Gráficos</p>
      {editable && <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, emptyChart()])}><Plus className="size-4" /> Adicionar gráfico</Button>}
    </div>
    {value.map((chart, i) => <div key={i} className="min-w-0 space-y-3 border-b pb-4">
      <div className="flex items-end gap-2">
        <Label className="min-w-0 flex-1 space-y-1">Título da figura<Input value={chart.title} disabled={!editable} onChange={(e) => update(i, { ...chart, title: e.target.value })} /></Label>
        {editable && <Button type="button" variant="ghost" size="icon" aria-label={`Remover gráfico ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))}><Trash2 /></Button>}
      </div>
      <Select value={chart.type} disabled={!editable} onValueChange={(type) => update(i, { ...chart, type: type as StageChart["type"] })}>
        <SelectTrigger aria-label="Tipo de gráfico"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="bar">Barras</SelectItem><SelectItem value="line">Linhas</SelectItem><SelectItem value="pie">Setores (pizza)</SelectItem></SelectContent>
      </Select>
      {chart.type !== "pie" && <div className="grid gap-3 sm:grid-cols-2">
        <Label className="space-y-1">Eixo horizontal<Input value={chart.xLabel} disabled={!editable} onChange={(e) => update(i, { ...chart, xLabel: e.target.value })} /></Label>
        <Label className="space-y-1">Eixo vertical / unidade<Input value={chart.yLabel} disabled={!editable} onChange={(e) => update(i, { ...chart, yLabel: e.target.value })} /></Label>
      </div>}
      <div className="space-y-2">
        {chart.points.map((point, j) => <div key={j} className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)_auto] items-center gap-2">
          <Input aria-label={`Categoria ${j + 1} do gráfico ${i + 1}`} placeholder="Categoria" value={point.label} disabled={!editable} onChange={(e) => update(i, { ...chart, points: chart.points.map((p, k) => k === j ? { ...p, label: e.target.value } : p) })} />
          <Input aria-label={`Valor ${j + 1} do gráfico ${i + 1}`} placeholder="Valor" inputMode="decimal" value={point.value} disabled={!editable} onChange={(e) => update(i, { ...chart, points: chart.points.map((p, k) => k === j ? { ...p, value: e.target.value } : p) })} />
          {editable && <Button type="button" variant="ghost" size="icon" aria-label={`Remover categoria ${j + 1}`} onClick={() => update(i, { ...chart, points: chart.points.filter((_, k) => k !== j) })}><Trash2 className="size-4" /></Button>}
        </div>)}
      </div>
      {editable && <Button type="button" variant="secondary" size="sm" onClick={() => update(i, { ...chart, points: [...chart.points, { label: "", value: "" }] })}><Plus /> Categoria</Button>}
      <Label className="block space-y-1">Fonte<Input value={chart.source} placeholder="Elaborado pelos autores" disabled={!editable} onChange={(e) => update(i, { ...chart, source: e.target.value })} /></Label>
      {chartProblems(chart).length > 0 ? <ul className="list-inside list-disc text-sm text-muted-foreground">{chartProblems(chart).map((p) => <li key={p}>{p}</li>)}</ul> : <StageChartView chart={chart} index={i} />}
    </div>)}
  </div>;
}