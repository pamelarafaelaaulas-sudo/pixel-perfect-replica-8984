import { createOpenAI } from "@ai-sdk/openai";
import { NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";
import { AI_CRITERIA, clampScore, overallScore, type AiEvaluation } from "./ai-score";

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

const criterion = z.object({ score: z.number(), comment: z.string() });

const evaluationSchema = z.object({
  clarity: criterion,
  organization: criterion,
  citations: criterion,
  phase_fit: criterion,
  summary: z.string(),
  clarity_tips: z.array(z.string()),
  organization_tips: z.array(z.string()),
  citation_tips: z.array(z.string()),
});

const INSTRUCTIONS = `Você é uma professora orientadora de projetos científicos do ensino médio no Brasil.
Avalie o texto da etapa enviada por um grupo de alunos, em português do Brasil.

Dê uma nota de 0 a 10 (pode usar uma casa decimal) para cada critério, com um comentário curto (1 a 2 frases) justificando:
- clarity (Clareza): o texto é fácil de entender, com frases objetivas e vocabulário adequado?
- organization (Organização): as ideias seguem uma ordem lógica, com começo, desenvolvimento e ligação entre as partes?
- citations (Citações e fontes): as fontes estão citadas e seguem as normas ABNT? Se a etapa normalmente não exige citações (por exemplo, o Tema ou a Pergunta norteadora), avalie se o texto mostra base em fontes confiáveis e não penalize com rigor excessivo.
- phase_fit (Adequação à etapa): o texto cumpre o objetivo desta etapa do projeto?

Seja justa e coerente: notas altas só para textos realmente bons; textos muito curtos ou vagos recebem notas baixas.
Em "summary", escreva 1 a 2 frases encorajadoras com a visão geral.
Em clarity_tips, organization_tips e citation_tips, escreva de 2 a 4 dicas curtas e concretas cada, citando trechos do texto quando útil.
Não reescreva o trabalho pelos alunos: oriente para que eles mesmos melhorem.`;

function friendlyError(failure: unknown): Error {
  console.error("AI evaluation error", failure);
  const status = (failure as { statusCode?: number } | undefined)?.statusCode;
  if (status === 429) return new Error("Muitos pedidos agora. Tente de novo em alguns minutos.");
  if (status === 402 || status === 403) return new Error("Os créditos de IA acabaram. Avise a professora.");
  return new Error("Não foi possível gerar a avaliação agora.");
}

const cleanTips = (tips: string[]) => tips.map((t) => t.trim()).filter(Boolean).slice(0, 4);

export async function generateEvaluation(phaseName: string, text: string): Promise<AiEvaluation> {
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
    output: Output.object({ schema: evaluationSchema }),
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

  let out: z.infer<typeof evaluationSchema>;
  try {
    out = await result.output;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) throw friendlyError(failure ?? e);
    throw friendlyError(failure ?? e);
  }
  if (failure) throw friendlyError(failure);

  const criteria = AI_CRITERIA.map((c) => ({
    key: c.key,
    label: c.label,
    score: clampScore(out[c.key].score),
    comment: out[c.key].comment.trim(),
  }));
  return {
    overall: overallScore(criteria.map((c) => c.score)),
    criteria,
    summary: out.summary.trim(),
    tips: {
      clarity: cleanTips(out.clarity_tips),
      organization: cleanTips(out.organization_tips),
      citations: cleanTips(out.citation_tips),
    },
  };
}
