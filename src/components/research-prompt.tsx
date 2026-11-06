import { Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function researchPrompt(theme: string) {
  const t = theme.trim() || "[INSERIR TEMA AQUI]";
  return `Atue como pesquisador acadêmico. Faça uma busca na Web e selecione EXATAMENTE 6 artigos científicos relevantes (5 principais + 1 complementar) para o tema abaixo. Não peça arquivos ao usuário.

TEMA: ${t}

REGRAS DE SELEÇÃO:
1. Fontes: Apenas periódicos revisados por pares e bases reconhecidas (PubMed, SciELO, Scopus, Web of Science, CAPES).
2. Período: Apenas artigos publicados nos ÚLTIMOS 5 ANOS (a partir de ${new Date().getFullYear() - 5}). Informe o ano de publicação de cada um.
3. Evite: Blogs, Wikipédia, sites comerciais, notícias ou materiais sem autoria/procedência.
4. Hierarquia: Priorize revisões sistemáticas, meta-análises, estudos longitudinais/empíricos e diretrizes oficiais.
5. Distribuição:
   - ⭐ 5 Textos Principais (ordenados por relevância e complementaridade).
   - 🔹 1 Texto Complementar (visão alternativa, outro método/população ou resultado divergente).

REGRAS DE RIGOR:
- Proibido inventar referências, DOIs ou links. Se não achar, marque como "Não localizado".
- Se não encontrar 6 artigos de alta qualidade dos últimos 5 anos, apresente apenas os válidos e avise.
- Não faça síntese, conclusões ou a revisão ainda. Apenas selecione e apresente.
- Selecione apenas fontes científicas em Português (BR).

FORMATO DE SAÍDA (Apenas para os 6 selecionados):

⭐ PRINCIPAL [1 a 5] (ou 🔹 TEXTO COMPLEMENTAR 6)
- Referência completa: [ABNT ou APA]
- Ano de publicação: [AAAA]
- Link: [URL ou DOI direto]
- Tipo de estudo: [Metodologia]
- Justificativa de escolha: [Objetiva]
- Principal contribuição: [Resumo em 1-2 frases]`;
}

export function ResearchPromptCard({ theme }: { theme: string }) {
  const text = researchPrompt(theme);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Prompt copiado! Cole no Gemini ou ChatGPT.");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto e copie manualmente.");
    }
  };
  return (
    <div className="space-y-3 rounded-lg border-2 border-accent bg-accent/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold"><Sparkles className="size-4" /> Prompt Dica: busca de artigos com IA</p>
        <Button type="button" size="sm" onClick={copy}><Copy /> Copiar prompt</Button>
      </div>
      <p className="text-sm text-muted-foreground">Copie, cole numa IA e depois confira cada artigo antes de fichar abaixo. {theme.trim() ? "O tema do grupo já foi incluído." : "Preencha o tema na etapa 1 ou troque [INSERIR TEMA AQUI]."}</p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs">{text}</pre>
    </div>
  );
}
