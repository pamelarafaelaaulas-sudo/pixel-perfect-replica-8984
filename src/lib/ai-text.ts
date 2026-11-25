/**
 * Free, rule-based guard against pasted chatbot text (pure, tested). Mirrored by SQL
 * `ai_text_marker` inside the `phase_rule_problem` wrapper for written stages 4–12 except Referências (11).
 * Only blocks unmistakable chatbot leftovers, so honest student writing is never refused.
 */
const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");

/** Keep in sync with SQL `ai_text_marker`. */
export const AI_MARKERS: { pattern: RegExp; label: string }[] = [
  { pattern: /como (um|uma) (modelo de linguagem|ia|inteligencia artificial|assistente)/, label: "“como um modelo de linguagem / IA”" },
  { pattern: /\bas an ai\b|\blanguage model\b/, label: "frase em inglês de assistente de IA" },
  { pattern: /\bchat ?gpt\b|\bgemini\b|\bcopilot\b|\bopenai\b/, label: "nome de ferramenta de IA" },
  { pattern: /(claro|certamente|com certeza)[!,.] ?(aqui (esta|estao|vai)|segue)/, label: "“Claro! Aqui está…”" },
  { pattern: /\baqui (esta|estao|vai) (um|uma|o|a|os|as) (texto|versao|sugestao|exemplo|resumo|introducao|metodologia|conclusao|objetivo)/, label: "“Aqui está o texto…”" },
  { pattern: /espero (que isso|ter) ajud/, label: "“Espero que isso ajude”" },
  { pattern: /(se precisar|caso precise|posso ajudar) (de )?(mais|algo|ajustar|em mais)/, label: "oferta de ajuda de assistente" },
  { pattern: /\[(inserir|insira|seu nome|nome|autor|ano|cidade|escola)[^\]]*\]/, label: "espaço para preencher entre colchetes" },
  { pattern: /\*\*[^*]+\*\*|^#{1,3} /m, label: "formatação de chat (** ou #)" },
];

/** First chatbot leftover found, or null. */
export function aiTextMarker(text: string): string | null {
  const t = norm(text ?? "");
  if (!t.trim()) return null;
  return AI_MARKERS.find((m) => m.pattern.test(t))?.label ?? null;
}

export function aiTextProblem(label: string, text: string): string | null {
  const m = aiTextMarker(text);
  return m
    ? `${label}: o texto tem sinal de ter sido copiado de uma IA (${m}). Reescreva com as palavras do grupo.`
    : null;
}
