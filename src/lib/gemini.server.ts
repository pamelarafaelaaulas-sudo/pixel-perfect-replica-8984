import { createGoogleGenerativeAI } from "@ai-sdk/google";

/** Google's always-current Flash model: reads text, images and PDFs (banner files). */
export const GEMINI_MODEL = "gemini-flash-latest";

/** The teacher's own Gemini key (billed to her Google account). Call inside a server handler. */
export function geminiModel() {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("A IA não está configurada (falta a chave do Gemini).");
  return createGoogleGenerativeAI({ apiKey })(GEMINI_MODEL);
}

/** Maps a Gemini failure to a message students and the teacher can act on. */
export function geminiErrorMessage(failure: unknown, fallback: string): string | null {
  const status = (failure as { statusCode?: number } | undefined)?.statusCode;
  if (status === 429) return "Muitos pedidos agora ou a cota do Gemini acabou. Tente de novo em alguns minutos.";
  if (status === 401 || status === 403) return "A chave do Gemini foi recusada. Avise a professora.";
  if (status === 400) return null; // caller decides (e.g. unreadable file)
  return fallback;
}
