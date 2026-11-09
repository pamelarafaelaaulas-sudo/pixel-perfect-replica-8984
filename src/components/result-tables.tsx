import { Plus, Table2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addCol, addRow, emptyTable, MAX_TABLE_COLS, MAX_TABLE_ROWS, parsePastedTable, removeCol, removeRow,
  tableCaption, tableSource, type ResultTable,
} from "@/lib/result-tables";

/** Read-only ABNT table (caption above, source below). */
export function ResultTableView({ table, index }: { table: ResultTable; index: number }) {
  const [head, ...body] = table.rows;
  return (
    <figure className="my-4 overflow-x-auto">
      <figcaption className="mb-1 text-sm font-medium">{tableCaption(index, table.title)}</figcaption>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y-2 border-foreground">
            {(head ?? []).map((c, j) => <th key={j} className="px-2 py-1 text-left font-semibold">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className={i === body.length - 1 ? "border-b-2 border-foreground" : ""}>
              {r.map((c, j) => <td key={j} className="px-2 py-1">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-muted-foreground">{tableSource(table.source)}</p>
    </figure>
  );
}

export function ResultTablesEditor({ value, onChange, editable, label = "Tabelas" }: { value: ResultTable[]; onChange: (v: ResultTable[]) => void; editable: boolean; label?: string }) {
  const update = (i: number, t: ResultTable) => onChange(value.map((x, k) => (k === i ? t : x)));
  return (
    <div className="space-y-4 rounded-lg border border-dashed p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-medium"><Table2 className="h-4 w-4 text-primary" /> {label}</p>
          <p className="text-xs text-muted-foreground">
            Opcional, para organizar dados. A 1ª linha é o cabeçalho. Você pode colar uma tabela do Excel ou Google Planilhas na primeira célula.
            O texto das tabelas não conta nas palavras.
          </p>
        </div>
        {editable && (
          <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, emptyTable()])}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar tabela
          </Button>
        )}
      </div>
      {value.map((t, i) => {
        const cols = t.rows[0]?.length ?? 1;
        return (
          <div key={i} className="space-y-2 rounded-md bg-muted/50 p-3">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm font-medium">Tabela {i + 1} –</span>
              <Input value={t.title} placeholder="Título (ex.: Variação do pH da água por semana)" onChange={(e) => update(i, { ...t, title: e.target.value })} />
              {editable && (
                <Button type="button" size="icon" variant="ghost" aria-label={`Remover tabela ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="border-collapse">
                <tbody>
                  {t.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((c, ci) => (
                        <td key={ci} className="p-0.5">
                          <Input
                            className={`h-8 min-w-24 ${ri === 0 ? "font-semibold" : ""}`}
                            value={c}
                            placeholder={ri === 0 ? `Coluna ${ci + 1}` : ""}
                            onChange={(e) => update(i, { ...t, rows: t.rows.map((rr, a) => (a === ri ? rr.map((cc, b) => (b === ci ? e.target.value : cc)) : rr)) })}
                            onPaste={(e) => {
                              const grid = parsePastedTable(e.clipboardData.getData("text"));
                              if (grid && grid.length > 1) {
                                e.preventDefault();
                                update(i, { ...t, rows: grid });
                              }
                            }}
                          />
                        </td>
                      ))}
                      {editable && ri > 0 && t.rows.length > 2 && (
                        <td><Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Remover linha" onClick={() => update(i, removeRow(t, ri))}><X className="h-3 w-3" /></Button></td>
                      )}
                    </tr>
                  ))}
                  {editable && cols > 1 && (
                    <tr>
                      {Array.from({ length: cols }, (_, ci) => (
                        <td key={ci} className="text-center">
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => update(i, removeCol(t, ci))}>remover coluna</Button>
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {editable && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={t.rows.length >= MAX_TABLE_ROWS} onClick={() => update(i, addRow(t))}><Plus className="mr-1 h-3 w-3" /> Linha</Button>
                <Button type="button" size="sm" variant="secondary" disabled={cols >= MAX_TABLE_COLS} onClick={() => update(i, addCol(t))}><Plus className="mr-1 h-3 w-3" /> Coluna</Button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm">Fonte:</span>
              <Input value={t.source} placeholder="Elaborado pelos autores (deixe vazio) ou cite a fonte" onChange={(e) => update(i, { ...t, source: e.target.value })} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
