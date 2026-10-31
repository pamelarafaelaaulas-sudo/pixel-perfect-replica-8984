import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";
import {
  BANNER_AXES,
  bannerTotal,
  clampAxis,
  criticalReasons,
  type BannerAxisScore,
  type BannerFeedback,
} from "./banner-review";

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

const axis = z.object({ score: z.number(), comment: z.string() });

const schema = z.object({
  results: axis,
  abnt: axis,
  methodology: axis,
  design: axis,
  summary: z.string(),
  references_found: z.number(),
  sections_missing: z.array(z.string()),
  template_ok: z.boolean(),
  third_person_ok: z.boolean(),
  coherence_aligned: z.boolean(),
  coherence_divergences: z.array(z.string()),
  orphan_citations: z.array(z.string()),
  annotations: z.array(
    z.object({ severity: z.enum(["critico", "atencao", "destaque"]), section: z.string(), note: z.string() }),
  ),
  rewrite_suggestions: z.array(z.string()),
  visual_ideas: z.array(z.string()),
  canva_prompts: z.array(z.string()),
  flowchart_steps: z.array(z.string()),
  banca_questions: z.array(z.object({ question: z.string(), tip: z.string() })),
  title_suggestions: z.array(z.string()),
  resubmission: z
    .object({ change_percent: z.number(), summary: z.string(), fixed: z.array(z.string()), pending: z.array(z.string()) })
    .nullable(),
});

const INSTRUCTIONS = `Você é uma professora, pesquisadora e orientadora de trabalhos científicos do Ensino Fundamental II e Ensino Médio, atuando como avaliadora preliminar por IA para as feiras de ciências regionais FETEC/MS e FECITMS. Escreva tudo em português do Brasil, com linguagem clara, educativa e alinhada às normas ABNT e aos regulamentos dessas feiras.

Você recebe o arquivo do banner enviado pelo grupo e o projeto escrito que o grupo já entregou no PamLab (tema, pergunta norteadora, objetivos, metodologia, resultados, conclusão, referências, resumo). Faça a primeira revisão do banner.

MATRIZ DE AVALIAÇÃO (nota sugerida de 0 a 10; use uma casa decimal; cada eixo tem sua nota máxima):
- results (máx. 3,5): Resultados, discussão e coerência — profundidade da análise, interpretação dos dados comparada com a literatura, tom impessoal (3ª pessoa) e alinhamento com o projeto escrito.
- abnt (máx. 2,5): Normas ABNT e citações — OBRIGATÓRIO no mínimo 3 referências (NBR 6023), formatação correta (sobrenome em caixa alta, ano), nenhuma citação “órfã” (autor citado no texto sem estar nas referências, ou referência que nunca é citada).
- methodology (máx. 2,0): Metodologia e estrutura — passo a passo claro e presença das 6 seções: Introdução, Objetivos, Metodologia, Resultados e Discussão, Conclusão, Referências.
- design (máx. 2,0): Design, modelo e estética — modelo oficial mantido (logo da escola, nome da feira, título, código do projeto, cores, delimitadores) e equilíbrio visual sem “muro de texto”; fontes sem serifa, corpo ≥ 24 pt, títulos ≥ 40 pt; imagens e gráficos legíveis com legendas.
Para cada eixo, dê "score" e "comment" (1 a 2 frases, sem números de nota).

VERIFICAÇÕES:
- references_found: quantas referências bibliográficas aparecem no banner.
- sections_missing: seções obrigatórias que faltam (lista vazia se todas estão presentes).
- template_ok: false se o cabeçalho oficial parece alterado, removido ou sem o código do projeto.
- third_person_ok: false se há trechos em 1ª pessoa ("nós", "fizemos", "eu").
- coherence_aligned / coherence_divergences: compare o banner com o projeto escrito; aponte objetivos, hipóteses, materiais, métodos ou dados que divergem ou que aparecem só no banner.
- orphan_citations: citações sem referência correspondente, ou referências nunca citadas.

ANOTAÇÕES (como a professora revisando à caneta): 4 a 10 itens em "annotations", cada um com:
- severity "critico" (precisa corrigir antes da impressão: faltam as 3 referências, falta o código, modelo violado, seção ausente, dado incoerente), "atencao" (dicas de tipografia, contraste, excesso de texto, redação) ou "destaque" (o que ficou ótimo);
- section: a seção do banner (ex.: "Cabeçalho", "Resultados e discussão");
- note: a observação, curta e concreta.

MENTORIA:
- summary: 2 a 3 frases encorajadoras com a visão geral.
- rewrite_suggestions: exatamente 3 sugestões de reescrita acadêmica em 3ª pessoa para a discussão dos resultados.
- visual_ideas: 2 a 4 ideias de recursos visuais (infográfico, mapa mental, gráfico) adequadas à área do trabalho.
- canva_prompts: exatamente 2 prompts detalhados em português para o grupo gerar elementos visuais no Canva.
- flowchart_steps: 4 a 8 passos curtos (até 8 palavras cada) da metodologia, em ordem, para um fluxograma.
- banca_questions: exatamente 5 perguntas prováveis dos avaliadores da FETEC/FECITMS sobre ESTE trabalho, cada uma com "tip" dizendo como a equipe deve responder no dia da feira.
- title_suggestions: exatamente 3 opções de título acadêmico que mantêm a essência do trabalho.

REENVIO: se for informada uma versão anterior com a devolutiva da professora, preencha "resubmission" com change_percent (estimativa de 0 a 100 de quanto o banner mudou), summary (o que mudou), fixed (pontos da devolutiva que foram corrigidos) e pending (o que ainda falta corrigir). Se for a primeira versão, use null.

Os alunos lerão tudo, exceto as notas: nunca escreva notas, pontos ou números de avaliação nos textos. Oriente sem reescrever o banner inteiro pelos alunos. Se o arquivo estiver ilegível, diga isso no summary e dê notas baixas.`;

function friendlyError(failure: unknown): Error {
  console.error("Banner diagnosis error", failure);
  const status = (failure as { statusCode?: number } | undefined)?.statusCode;
  if (status === 429) return new Error("Muitos pedidos agora. Tente de novo em alguns minutos.");
  if (status === 402 || status === 403) return new Error("Os créditos de IA acabaram. Avise a professora.");
  if (status === 400 || status === 413) return new Error("A IA não conseguiu ler este arquivo. Exporte o banner em PDF ou PNG menor e tente de novo.");
  return new Error("Não foi possível gerar o diagnóstico agora.");
}

const clean = (xs: string[], max: number) => xs.map((x) => x.trim()).filter(Boolean).slice(0, max);

export type BannerDiagnosis = { total: number; axes: BannerAxisScore[]; feedback: BannerFeedback; critical: boolean };

export async function generateBannerDiagnosis(args: {
  file: Uint8Array;
  mediaType: string;
  fileName: string;
  projectText: string;
  previous: string | null;
}): Promise<BannerDiagnosis> {
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
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `PROJETO ESCRITO DO GRUPO (entregue no PamLab):\n${args.projectText}\n\n` +
              (args.previous
                ? `VERSÃO ANTERIOR E DEVOLUTIVA DA PROFESSORA (este arquivo é um reenvio):\n${args.previous}\n\n`
                : "Esta é a primeira versão do banner.\n\n") +
              "Segue o arquivo do banner.",
          },
          { type: "file", data: args.file, mediaType: args.mediaType, filename: args.fileName },
        ],
      },
    ],
    output: Output.object({ schema }),
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

  let out: z.infer<typeof schema>;
  try {
    out = await result.output;
  } catch (e) {
    throw friendlyError(failure ?? e);
  }
  if (failure) throw friendlyError(failure);

  const axes: BannerAxisScore[] = BANNER_AXES.map((a) => ({
    key: a.key,
    label: a.label,
    max: a.max,
    score: clampAxis(a.key, out[a.key].score),
    comment: out[a.key].comment.trim(),
  }));
  const feedback: BannerFeedback = {
    summary: out.summary.trim(),
    axisComments: axes.map((a) => ({ key: a.key, comment: a.comment })),
    referencesFound: Math.max(0, Math.round(out.references_found)),
    sectionsMissing: clean(out.sections_missing, 6),
    templateOk: out.template_ok,
    thirdPersonOk: out.third_person_ok,
    coherence: { aligned: out.coherence_aligned, divergences: clean(out.coherence_divergences, 6) },
    orphanCitations: clean(out.orphan_citations, 8),
    annotations: out.annotations
      .map((a) => ({ severity: a.severity, section: a.section.trim(), note: a.note.trim() }))
      .filter((a) => a.note)
      .slice(0, 12),
    rewriteSuggestions: clean(out.rewrite_suggestions, 3),
    visualIdeas: clean(out.visual_ideas, 4),
    canvaPrompts: clean(out.canva_prompts, 2),
    flowchartSteps: clean(out.flowchart_steps, 8),
    bancaQuestions: out.banca_questions
      .map((q) => ({ question: q.question.trim(), tip: q.tip.trim() }))
      .filter((q) => q.question)
      .slice(0, 5),
    titleSuggestions: clean(out.title_suggestions, 3),
    resubmission:
      args.previous && out.resubmission
        ? {
            changePercent: Math.min(100, Math.max(0, Math.round(out.resubmission.change_percent))),
            summary: out.resubmission.summary.trim(),
            fixed: clean(out.resubmission.fixed, 8),
            pending: clean(out.resubmission.pending, 8),
          }
        : null,
  };
  return { total: bannerTotal(axes), axes, feedback, critical: criticalReasons(feedback).length > 0 };
}
