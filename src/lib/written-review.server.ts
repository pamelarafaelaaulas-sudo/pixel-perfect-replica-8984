import { Output, streamText } from "ai";
import { z } from "zod";
import { GEMINI_OPTIONS, geminiErrorMessage, geminiModel } from "./gemini.server";
import { clampImprovement } from "./written-review";

const schema = z.object({
  change_percent: z.number(),
  improvement_score: z.number(),
  summary: z.string(),
  changed: z.array(z.string()),
  addressed: z.array(z.string()),
  pending: z.array(z.string()),
  response_matches: z.boolean(),
  response_note: z.string(),
});

const INSTRUCTIONS = `Você é a assistente de uma professora de educação científica que corrige projetos científicos do ensino médio no Brasil. Escreva em português do Brasil, frases curtas e objetivas.

Você recebe, de uma parte do projeto escrito: (1) a VERSÃO ANTERIOR do texto, (2) a DEVOLUTIVA da professora sobre essa versão, (3) a RESPOSTA do grupo dizendo o que mudou e (4) a NOVA VERSÃO do texto.
Compare as duas versões e responda para a professora:
- change_percent: estimativa de 0 a 100 de quanto o texto mudou (0 = praticamente igual).
- improvement_score: nota de melhoria de 0 a 10 (uma casa decimal) — quanto a nova versão melhorou em relação à anterior e atendeu à devolutiva. 0 = nada melhorou ou piorou; 5 = atendeu parte; 10 = atendeu tudo e o texto ficou claramente melhor. Mudanças só de pontuação ou de palavras soltas valem pouco.
- summary: 1 a 2 frases com a visão geral da mudança.
- changed: lista do que mudou de fato (cite o trecho ou a ideia). Lista vazia se nada mudou.
- addressed: pontos da devolutiva que foram atendidos.
- pending: pontos da devolutiva que NÃO foram atendidos ou ficaram incompletos, e problemas novos que surgiram.
- response_matches: true se o que o grupo escreveu na resposta realmente aparece no novo texto; false se o grupo disse que mudou algo que não mudou.
- response_note: 1 frase explicando o response_matches.
Seja concreta e justa; considere as normas da ABNT (citações autor-data NBR 10520:2023, referências NBR 6023) quando a devolutiva tratar disso.`;

export type WrittenComparison = {
  change_percent: number;
  improvement_score: number;
  summary: string;
  changed: string[];
  addressed: string[];
  pending: string[];
  response_matches: boolean;
  response_note: string;
};

const clean = (xs: string[], max: number) => xs.map((x) => x.trim()).filter(Boolean).slice(0, max);

function friendlyError(failure: unknown): Error {
  console.error("Written comparison error", failure);
  const fallback = "Não foi possível comparar as versões agora.";
  return new Error(geminiErrorMessage(failure, fallback) ?? fallback);
}

const DRAFT_INSTRUCTIONS = (teacher: string) => `Você é ${teacher}, professora pesquisadora de educação científica que orienta projetos científicos de alunos do ensino médio no Brasil (feiras FECITI/MS, FETEC/MS, FECINTEC).
Escreva, em primeira pessoa e falando diretamente com o grupo ("vocês"), a DEVOLUTIVA de uma parte do projeto escrito. Tom: acolhedor, firme e de orientadora de pesquisa — valorize o que está bom e mostre com clareza o que precisa mudar, como uma pesquisadora que quer ver o grupo crescer.
Regras:
- Português do Brasil, frases curtas, sem jargão desnecessário.
- Estrutura: 1 frase reconhecendo o que está bom; depois "O que precisa melhorar:" com 2 a 5 itens numerados, cada um concreto (cite o trecho ou a ideia e diga o que fazer); termine com 1 frase de incentivo e o próximo passo.
- Considere o que a professora pede nesta parte (limites de palavras, estrutura) e as normas da ABNT (citações autor-data NBR 10520:2023, referências NBR 6023) quando fizer sentido.
- Nunca dê nota, pontuação ou conceito. Não invente dados nem autores. Não reescreva o texto pelos alunos: oriente.
- No máximo 220 palavras. Texto simples, sem markdown (sem asteriscos ou #).
- Se a professora já começou um rascunho, mantenha as ideias dela e melhore a redação.`;

/** Draft of the teacher's feedback on a written stage, in her voice as a teacher-researcher. She edits it before sending. */
export async function generateWrittenFeedbackDraft(args: {
  teacherName: string;
  stageName: string;
  stageGuide: string;
  text: string;
  teacherDraft: string;
  previousNotes: string[];
}): Promise<string> {
  let failure: unknown;
  const result = streamText({
    model: geminiModel(),
    system: DRAFT_INSTRUCTIONS(args.teacherName),
    messages: [
      {
        role: "user",
        content:
          `Parte do projeto: ${args.stageName}\nO que a professora pede nesta parte: ${args.stageGuide}\n\n` +
          (args.previousNotes.length ? `Devolutivas anteriores desta parte (não repita o que já foi atendido):\n${args.previousNotes.join("\n---\n")}\n\n` : "") +
          (args.teacherDraft.trim() ? `Rascunho que a professora já começou:\n${args.teacherDraft.trim()}\n\n` : "") +
          `Texto entregue pelo grupo:\n${args.text.slice(0, 15000) || "(vazio)"}`,
      },
    ],
    maxRetries: 1,
    providerOptions: GEMINI_OPTIONS,
    onError: ({ error }) => {
      failure = error;
    },
  });
  let text: string;
  try {
    text = await result.text;
  } catch (e) {
    failure ??= e;
    text = "";
  }
  if (failure || !text.trim()) {
    console.error("Written feedback draft error", failure);
    const fallback = "Não foi possível escrever o rascunho agora. Tente de novo.";
    throw new Error(geminiErrorMessage(failure, fallback) ?? fallback);
  }
  return text.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim();
}

export async function generateWrittenComparison(args: {
  stageName: string;
  stageGuide: string;
  before: string;
  after: string;
  teacherNotes: string;
  studentResponse: string;
  round: number;
}): Promise<WrittenComparison> {
  let failure: unknown;
  const result = streamText({
    model: geminiModel(),
    system: INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content:
          `Parte do projeto: ${args.stageName}\nO que a professora pede nesta parte: ${args.stageGuide}\n\n` +
          `(1) VERSÃO ${args.round} (anterior):\n${args.before.slice(0, 15000) || "(vazio)"}\n\n` +
          `(2) DEVOLUTIVA DA PROFESSORA:\n${args.teacherNotes.trim() || "(sem texto)"}\n\n` +
          `(3) RESPOSTA DO GRUPO:\n${args.studentResponse.trim() || "(o grupo não escreveu resposta)"}\n\n` +
          `(4) VERSÃO ${args.round + 1} (nova):\n${args.after.slice(0, 15000) || "(vazio)"}`,
      },
    ],
    output: Output.object({ schema }),
    maxRetries: 1,
    providerOptions: GEMINI_OPTIONS,
    onError: ({ error }) => {
      failure = error;
    },
  });
  let out: z.infer<typeof schema>;
  try {
    out = await result.output;
  } catch (e) {
    throw friendlyError(failure ?? e);
  }
  if (failure) throw friendlyError(failure);
  return {
    change_percent: Math.min(100, Math.max(0, Math.round(out.change_percent))),
    improvement_score: clampImprovement(out.improvement_score),
    summary: out.summary.trim(),
    changed: clean(out.changed, 10),
    addressed: clean(out.addressed, 10),
    pending: clean(out.pending, 10),
    response_matches: out.response_matches,
    response_note: out.response_note.trim(),
  };
}
