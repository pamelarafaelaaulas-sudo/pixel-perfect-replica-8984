import type { ReactNode } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, ExternalLink, FileText, Search, Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function TutorialStep({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-lg border border-border bg-background p-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {number}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-foreground">{title}</p>
        <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

export function ResearchTutorial({ theme }: { theme: string }) {
  const firstYear = new Date().getFullYear() - 5;
  const scholarUrl = theme.trim()
    ? `https://scholar.google.com.br/scholar?q=${encodeURIComponent(theme.trim())}`
    : "https://scholar.google.com.br/";

  return (
    <section className="overflow-hidden rounded-xl border border-secondary bg-card shadow-paper" aria-label="Tutorial de pesquisa de artigos">
      <Accordion type="single" collapsible>
        <AccordionItem value="tutorial" className="border-b-0">
          <AccordionTrigger className="px-4 py-4 hover:no-underline sm:px-5">
            <span className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-highlight text-highlight-foreground">
                <BookOpen className="size-5" />
              </span>
              <span>
                <span className="block text-base font-semibold">Precisa de ajuda para pesquisar?</span>
                <span className="mt-0.5 block text-sm font-normal text-muted-foreground">Veja o tutorial da IA e do Google Acadêmico</span>
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4 sm:px-5">
            <Tabs defaultValue="ia" className="w-full">
              <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-2">
                <TabsTrigger value="ia" className="gap-2 py-2"><Sparkles /> Como usar a IA</TabsTrigger>
                <TabsTrigger value="scholar" className="gap-2 py-2"><Search /> Google Acadêmico</TabsTrigger>
              </TabsList>

              <TabsContent value="ia" className="mt-4 space-y-4">
                <ol className="space-y-3">
                  <TutorialStep number={1} title="Copie o Prompt Dica">
                    Clique no botão <strong className="text-foreground">“Copiar prompt”</strong> no card abaixo. O tema do grupo já entra no texto automaticamente.
                  </TutorialStep>
                  <TutorialStep number={2} title="Cole no Gemini ou ChatGPT">
                    Abra a IA de sua preferência, cole o prompt e envie. Peça que ela mantenha os links, os anos e os dados de cada artigo.
                  </TutorialStep>
                  <TutorialStep number={3} title="Confira se cada artigo existe">
                    Abra o link informado ou pesquise o título exato no Google Acadêmico. Confira autores, ano, revista e se a publicação está dentro dos últimos 5 anos. Não cadastre um artigo que você não conseguiu localizar.
                  </TutorialStep>
                  <TutorialStep number={4} title="Leia e preencha as fichas">
                    Para cada fonte, registre título, link e referência. Depois escreva com suas palavras o objetivo, a metodologia, os resultados e a contribuição para o projeto. São necessárias pelo menos 5 fontes para entregar a etapa.
                  </TutorialStep>
                </ol>
                <div className="flex gap-3 rounded-lg border border-warning bg-warning/15 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-foreground" />
                  <p><strong>Regra de ouro:</strong> a IA pode inventar referências, links e resultados. Ela ajuda na busca, mas a conferência e a leitura dos artigos são responsabilidade do grupo.</p>
                </div>
              </TabsContent>

              <TabsContent value="scholar" className="mt-4 space-y-4">
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <a href={scholarUrl} target="_blank" rel="noreferrer">
                    <Search /> Abrir Google Acadêmico{theme.trim() ? " com o tema do grupo" : ""} <ExternalLink />
                  </a>
                </Button>
                <ol className="space-y-3">
                  <TutorialStep number={1} title="Pesquise pelo tema">
                    Digite palavras-chave do projeto. Use <strong className="text-foreground">aspas</strong> para buscar uma expressão exata, como <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">“degradação de plástico”</code>.
                  </TutorialStep>
                  <TutorialStep number={2} title={`Filtre os últimos 5 anos`}>
                    Na barra lateral, clique em <strong className="text-foreground">“Desde {firstYear}”</strong>. Ainda assim, confira o ano na página do artigo antes de usar a fonte.
                  </TutorialStep>
                  <TutorialStep number={3} title="Faça buscas mais precisas">
                    <div className="mt-2 grid gap-2">
                      <code className="block overflow-x-auto rounded-md bg-muted p-2 text-xs text-foreground">“seu tema” site:scielo.br</code>
                      <code className="block overflow-x-auto rounded-md bg-muted p-2 text-xs text-foreground">“seu tema” filetype:pdf</code>
                      <code className="block overflow-x-auto rounded-md bg-muted p-2 text-xs text-foreground">“seu tema” “ensino médio”</code>
                    </div>
                    <p className="mt-2">O primeiro exemplo prioriza a SciELO; o segundo procura arquivos em PDF; o terceiro combina dois termos.</p>
                  </TutorialStep>
                  <TutorialStep number={4} title="Encontre o texto completo">
                    Quando houver um link <strong className="text-foreground">[PDF]</strong> ao lado do resultado, use-o para ler o artigo. Também vale abrir a página da revista ou do repositório da universidade. Não pague por um texto antes de procurar uma versão gratuita e legal.
                  </TutorialStep>
                  <TutorialStep number={5} title="Copie a referência e revise a ABNT">
                    Clique no ícone de aspas (<strong className="text-foreground">Citar</strong>) abaixo do resultado. Copie a referência disponível e confira autores, título, revista, volume, páginas e ano, ajustando ao padrão ABNT antes de colar na ficha.
                  </TutorialStep>
                </ol>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex gap-2 rounded-lg bg-success/10 p-3 text-sm">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                    <p><strong>Boa fonte:</strong> artigo científico com autores, revista, ano e texto completo identificáveis.</p>
                  </div>
                  <div className="flex gap-2 rounded-lg bg-secondary/60 p-3 text-sm">
                    <FileText className="mt-0.5 size-5 shrink-0 text-secondary-foreground" />
                    <p><strong>Antes de fichar:</strong> leia o artigo e relacione as informações com a pergunta do seu projeto.</p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
