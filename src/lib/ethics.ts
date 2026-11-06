/**
 * Bloco 2: external fairs and the ethics screening of the Metodologia stage.
 * Pure rules and document texts; the database (phase_rule_problem_base, stage 7) enforces the same delivery rule.
 */

export const EXTERNAL_FAIRS = ["FETEC/MS", "FECINTEC"] as const;
export type ExternalFair = (typeof EXTERNAL_FAIRS)[number];

export const COLLECTION_FORMATS = [
  { key: "online", label: "Online (Google Forms)" },
  { key: "presencial", label: "Presencial ou entrevista pessoal" },
] as const;
export type CollectionFormat = (typeof COLLECTION_FORMATS)[number]["key"];

export const HUMAN_RESEARCH_QUESTION =
  "A pesquisa envolve seres humanos? Por exemplo: aplicação de formulários, entrevistas, testes de usabilidade ou uso de imagem de pessoas.";

/** docs.google.com/forms/..., forms.gle/... or forms.google.com/... — mirrored by SQL is_google_form_url. */
export function isGoogleFormUrl(url: string | null | undefined): boolean {
  return /^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/|forms\.google\.com\/)/i.test((url ?? "").trim());
}

const sameLink = (a: string | null | undefined, b: string | null | undefined) =>
  !!a?.trim() && !!b?.trim() && a.trim().toLowerCase().replace(/\/+$/, "") === b.trim().toLowerCase().replace(/\/+$/, "");

export type EthicsValues = {
  ethics_human_research: boolean | null | undefined;
  ethics_collection: string[] | null | undefined;
  ethics_form_url: string | null | undefined;
  /** The teacher's Forms model; the group must paste its own copy, not this link. */
  ethics_form_template_url?: string | null | undefined;
};

/** What still blocks delivering the Metodologia because of the ethics screening. Empty = OK. */
export function ethicsProblems(v: EthicsValues): string[] {
  if (v.ethics_human_research === null || v.ethics_human_research === undefined)
    return ["Responda se a pesquisa envolve seres humanos (triagem ética)."];
  if (!v.ethics_human_research) return [];
  const formats = v.ethics_collection ?? [];
  if (formats.length === 0) return ["Escolha como os dados serão coletados: online (Google Forms) ou presencial."];
  if (formats.includes("online")) {
    if (!isGoogleFormUrl(v.ethics_form_url)) return ["Cole o link do Google Forms que o grupo vai aplicar na pesquisa."];
    if (sameLink(v.ethics_form_url, v.ethics_form_template_url))
      return ["Esse é o link do modelo da professora. Faça uma cópia do formulário e cole o link do formulário do grupo."];
  }
  return [];
}

/** Recommended sample (95% confidence, 5% margin, p = 0.5) with finite-population correction. */
export function recommendedSample(population: number, margin = 0.05, z = 1.96): number {
  if (!Number.isFinite(population) || population <= 0) return 0;
  const n0 = (z * z * 0.25) / (margin * margin);
  return Math.ceil(n0 / (1 + (n0 - 1) / population));
}

export const TCLE_MAX_BYTES = 10 * 1024 * 1024;
/** TCLE uploads: strictly PDF or DOCX, at most 10 MB. Returns the problem or null. */
export function tcleFileProblem(name: string, size: number): string | null {
  if (!/\.(pdf|docx)$/i.test(name.trim())) return "O TCLE precisa ser PDF ou DOCX.";
  if (size > TCLE_MAX_BYTES) return "O arquivo passa de 10 MB.";
  return null;
}

export type EthicsExtraValues = {
  ethics_human_research: boolean | null | undefined;
  ethics_collection: string[] | null | undefined;
  ethics_lab: boolean | null | undefined;
  ethics_lab_epis: string | null | undefined;
  ethics_biosafety_declared_at: string | null | undefined;
  ethics_population: number | null | undefined;
  ethics_sample_size: number | null | undefined;
  ethics_review_status?: string | null | undefined;
  tcle_count?: number;
};

/** Needs the mentor's formal ethics validation (people or lab involved). */
export const needsEthicsReview = (v: Pick<EthicsExtraValues, "ethics_human_research" | "ethics_lab">) =>
  v.ethics_human_research === true || v.ethics_lab === true;

/** Mirrors SQL ethics_extra_problem: stage 7 sample/lab/TCLE rules and the gate before stage 8. */
export function ethicsExtraProblems(phase: number, v: EthicsExtraValues): string[] {
  if (phase === 7) {
    if (v.ethics_lab == null) return ["Responda se a pesquisa usa laboratório ou reagentes (biossegurança)."];
    if (v.ethics_human_research) {
      if (!v.ethics_population || !v.ethics_sample_size)
        return ["Preencha a calculadora de amostragem: tamanho da população e da amostra."];
      if (v.ethics_sample_size > v.ethics_population) return ["A amostra não pode ser maior que a população."];
      if ((v.ethics_collection ?? []).includes("presencial") && v.tcle_count !== undefined && v.tcle_count < 1)
        return ["Envie pelo menos um TCLE assinado (PDF ou DOCX) para a coleta presencial."];
    }
    if (v.ethics_lab) {
      if (!v.ethics_lab_epis?.trim()) return ["Liste os EPIs que o grupo vai usar no laboratório."];
      if (!v.ethics_biosafety_declared_at) return ["Marque a declaração de EPIs e biossegurança."];
    }
  }
  if (phase === 8 && needsEthicsReview(v) && v.ethics_review_status !== "aprovado")
    return ["Aguardando validação ética da professora: a próxima etapa só abre depois da aprovação."];
  return [];
}

/** Keeps only valid fairs, in the official order; none when the group said it won't take part. */
export function normalizeFairs(interest: boolean, fairs: string[]): ExternalFair[] {
  if (!interest) return [];
  return EXTERNAL_FAIRS.filter((f) => fairs.includes(f));
}

export function fairsLabel(interest: boolean | null | undefined, fairs: string[] | null | undefined): string {
  if (!interest) return "Não vai participar de feiras externas";
  const list = normalizeFairs(true, fairs ?? []);
  return list.length ? `Quer participar: ${list.join(" e ")}` : "Quer participar (feira ainda não escolhida)";
}

/* ---------------- Documents (TCLE and image authorization) ---------------- */

export type EthicsDocInput = {
  title: string | null;
  projectCode: string | null;
  institution: string | null;
  students: string[];
  teacherName: string | null;
  objective: string | null;
  year: number;
};

export type EthicsDoc = { fileName: string; title: string; subtitle: string; paragraphs: string[]; signatures: string[] };

const blank = "______________________________";
const orBlank = (s: string | null | undefined) => (s?.trim() ? s.trim() : blank);

function header(i: EthicsDocInput): string[] {
  return [
    `Projeto: ${orBlank(i.title)}${i.projectCode ? ` (código ${i.projectCode})` : ""}`,
    `Instituição: ${orBlank(i.institution)}`,
    `Pesquisadores(as) estudantes: ${i.students.length ? i.students.join(", ") : blank}`,
    `Professora orientadora: ${orBlank(i.teacherName)}`,
  ];
}

/** Termo de Consentimento Livre e Esclarecido, signed by the participant or the legal guardian of minors. */
export function tcleDocument(i: EthicsDocInput): EthicsDoc {
  return {
    fileName: "TCLE.docx",
    title: "TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)",
    subtitle: "Pesquisa escolar de iniciação científica",
    paragraphs: [
      ...header(i),
      `Você (ou a pessoa pela qual você é responsável) está sendo convidado(a) a participar, como voluntário(a), da pesquisa acima. O objetivo da pesquisa é: ${orBlank(i.objective)}`,
      "A participação consiste em responder a perguntas de um questionário ou entrevista e/ou participar das atividades descritas pelos pesquisadores, com duração aproximada de ______ minutos.",
      "Riscos e desconfortos: a participação oferece risco mínimo, como cansaço ou constrangimento ao responder alguma pergunta. Você pode deixar de responder qualquer pergunta e interromper a participação a qualquer momento.",
      "Benefícios: contribuir para a produção de conhecimento científico na escola e para a formação dos estudantes pesquisadores.",
      "Sigilo: seu nome e seus dados pessoais não serão divulgados. As informações serão usadas apenas de forma agrupada, para fins da pesquisa escolar e da apresentação em feiras de ciências.",
      "A participação é voluntária e gratuita: não haverá pagamento nem custo. Você pode recusar ou retirar o consentimento a qualquer momento, sem nenhum prejuízo.",
      "Em caso de dúvidas, procure a professora orientadora na escola.",
      "Declaro que li e entendi as informações acima, tive a oportunidade de esclarecer minhas dúvidas e concordo em participar (ou autorizo a participação do menor sob minha responsabilidade).",
      `Nome do(a) participante: ${blank}`,
      `Nome do(a) responsável legal (se menor de 18 anos): ${blank}`,
      `Local e data: ______________________, ____ de ______________ de ${i.year}.`,
    ],
    signatures: ["Assinatura do(a) participante ou responsável legal", "Assinatura do(a) pesquisador(a) estudante", "Assinatura da professora orientadora"],
  };
}

/** Termo de Autorização de Uso de Imagem e Voz. */
export function imageConsentDocument(i: EthicsDocInput): EthicsDoc {
  return {
    fileName: "Termo-de-uso-de-imagem.docx",
    title: "TERMO DE AUTORIZAÇÃO DE USO DE IMAGEM E VOZ",
    subtitle: "Pesquisa escolar de iniciação científica",
    paragraphs: [
      ...header(i),
      `Eu, ${blank}, portador(a) do RG/CPF nº ${blank}, responsável legal por ${blank} (quando menor de 18 anos), AUTORIZO o uso da imagem e da voz em fotos, vídeos e gravações feitos durante a pesquisa acima.`,
      "As imagens e gravações poderão ser usadas, sem fins comerciais, no banner, no relatório, em apresentações e em materiais de divulgação da pesquisa em feiras de ciências (como FETEC/MS, FECINTEC e FECITMS) e nos canais da escola.",
      "Esta autorização é gratuita, não gera qualquer pagamento e pode ser revogada a qualquer momento, por escrito, sem prejuízo para a pessoa autorizada.",
      `Local e data: ______________________, ____ de ______________ de ${i.year}.`,
    ],
    signatures: ["Assinatura do(a) participante ou responsável legal", "Assinatura da professora orientadora"],
  };
}

/** Text to paste in the description of the group's Google Forms (online collection). */
export function formsConsentText(i: EthicsDocInput): string {
  return [
    `${orBlank(i.title)}${i.projectCode ? ` (${i.projectCode})` : ""}`,
    `${orBlank(i.institution)} · Professora orientadora: ${orBlank(i.teacherName)}`,
    "",
    "TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO",
    `Você está sendo convidado(a) a participar de uma pesquisa escolar de iniciação científica. Objetivo: ${orBlank(i.objective)}`,
    "A participação é voluntária e gratuita, oferece risco mínimo e você pode desistir a qualquer momento. Seus dados pessoais não serão divulgados e as respostas serão usadas apenas de forma agrupada, para a pesquisa e a apresentação em feiras de ciências.",
    "Se você tem menos de 18 anos, peça autorização ao seu responsável antes de responder.",
    "",
    "Primeira pergunta obrigatória do formulário: “Li o termo acima e concordo em participar da pesquisa.” (Sim / Não — quem marcar Não encerra o formulário).",
  ].join("\n");
}
