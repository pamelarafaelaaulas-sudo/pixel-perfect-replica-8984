const DDDS = new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99]);

/** Mirrors SQL is_valid_br_mobile: returns a problem message, or null when the number looks real. */
export function brMobileProblem(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (!d) return "Preencha seu WhatsApp para continuar.";
  if (d.length !== 11) return "O WhatsApp precisa ter DDD + 9 dígitos, ex.: (65) 99999-1234.";
  if (!DDDS.has(Number(d.slice(0, 2)))) return "Esse DDD não existe no Brasil.";
  const n = d.slice(2);
  if (n[0] !== "9" || !"6789".includes(n[1]!)) return "Celular deve começar com 9 (ex.: 9 9xxx-xxxx).";
  const rest = n.slice(1);
  if (/^(\d)\1+$/.test(rest) || ["12345678", "87654321", "23456789", "98765432"].includes(rest))
    return "Esse número parece falso. Digite seu WhatsApp verdadeiro.";
  return null;
}

/** Formats as (DD) 9XXXX-XXXX while typing. */
export function maskBrPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
