import type { EthicsDoc } from "./ethics";

/** Documents an approved group must send for the fair accreditation (4º bimestre). */
export const FAIR_DOCS: { key: string; label: string; template: EthicsDoc }[] = [
  {
    key: "ficha",
    label: "Autorização do Uso de Imagem",
    template: {
      fileName: "ficha-credenciamento.docx",
      title: "FICHA DE INSCRIÇÃO E CREDENCIAMENTO",
      subtitle: "Feira de Ciências",
      paragraphs: [
        "Título do projeto: ____________________________________________",
        "Código do projeto: __________  Área: __________  Turma: __________",
        "Estudante 1 (nome completo, data de nascimento, CPF): ________________________________",
        "Estudante 2 (nome completo, data de nascimento, CPF): ________________________________",
        "Estudante 3 (nome completo, data de nascimento, CPF): ________________________________",
        "Professora orientadora: ____________________________  Escola: ____________________",
        "Telefone e e-mail de contato: ____________________________________________",
      ],
      signatures: ["Assinatura da professora orientadora"],
    },
  },
  {
    key: "autoria",
    label: "Declaração de autoria",
    template: {
      fileName: "declaracao-autoria.docx",
      title: "DECLARAÇÃO DE AUTORIA",
      subtitle: "Feira de Ciências",
      paragraphs: [
        "Declaramos, para os devidos fins, que somos autores do projeto intitulado ________________________________, desenvolvido sob orientação da professora indicada, e que todas as fontes consultadas foram citadas conforme as normas da ABNT.",
        "Declaramos ainda que o trabalho não constitui plágio e que estamos cientes das regras da feira.",
        "Local e data: ____________________, ____/____/______.",
      ],
      signatures: ["Estudante 1", "Estudante 2", "Estudante 3"],
    },
  },
  {
    key: "responsaveis",
    label: "Autorização dos responsáveis",
    template: {
      fileName: "autorizacao-responsaveis.docx",
      title: "AUTORIZAÇÃO DOS RESPONSÁVEIS",
      subtitle: "Participação de estudante menor de idade em feira de ciências",
      paragraphs: [
        "Eu, ________________________________, CPF ____________________, responsável legal pelo(a) estudante ________________________________, autorizo sua participação na feira de ciências, incluindo deslocamento, permanência no evento e uso de imagem e voz para fins educacionais e de divulgação.",
        "Telefone para contato: ____________________.",
        "Local e data: ____________________, ____/____/______.",
      ],
      signatures: ["Assinatura do(a) responsável legal"],
    },
  },
];

export const FAIR_STATUS_LABEL: Record<string, string> = {
  aprovado: "Aprovado para a feira",
  ajustes: "Ajustes necessários",
  recusado: "Não selecionado",
};

export const DOC_STATUS_LABEL: Record<string, string> = {
  enviado: "Aguardando conferência",
  conferido: "Conferido",
  refazer: "Refazer",
};

/** Accreditation is complete when every required document is checked by the teacher. */
export function accreditationComplete(docs: { doc_type: string; status: string }[]): boolean {
  return FAIR_DOCS.every((d) => docs.some((x) => x.doc_type === d.key && x.status === "conferido"));
}
