import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

function createRunIdFetch() {
  let runId: string | undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (runId && !headers.has(RUN_ID_HEADER)) headers.set(RUN_ID_HEADER, runId);
    const res = await fetch(input, { ...init, headers });
    runId ??= res.headers.get(RUN_ID_HEADER)?.trim() || undefined;
    return res;
  };
}

const INSTRUCTIONS = `Você é uma professora orientadora de projetos científicos do ensino médio no Brasil.
Analise o texto da etapa enviada por um grupo de alunos e dê sugestões de melhoria, em português do Brasil,
organizadas exatamente nestas três seções com títulos em markdown:
## Clareza
## Organização
## Citações
Em cada seção, escreva de 2 a 4 tópicos curtos, concretos e encorajadores, citando trechos do texto quando útil.
Em "Citações", avalie se as fontes estão citadas e se seguem as normas ABNT; se não houver citações, explique como incluí-las.
Não reescreva o trabalho inteiro pelos alunos: oriente para que eles mesmos melhorem.`;

export async function generateFeedback(phaseName: string, text: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("A IA não está configurada.");
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: createRunIdFetch(),
  });
  let failure: unknown;
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    system: INSTRUCTIONS,
    messages: [{ role: "user", content: `Etapa: ${phaseName}\n\nTexto do grupo:\n${text}` }],
    maxRetries: 0,
    onError: ({ error }) => {
      failure = error;
    },
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const out = await result.text;
  if (failure || !out.trim()) {
    console.error("AI feedback error", failure);
    const status = (failure as { statusCode?: number } | undefined)?.statusCode;
    if (status === 429) throw new Error("Muitos pedidos agora. Tente de novo em alguns minutos.");
    if (status === 402 || status === 403) throw new Error("Os créditos de IA acabaram. Avise a professora.");
    throw new Error("Não foi possível gerar sugestões agora.");
  }
  return out;
}
