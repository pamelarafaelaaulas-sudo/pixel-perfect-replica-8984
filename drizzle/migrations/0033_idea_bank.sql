CREATE TABLE public.idea_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  area text NOT NULL,
  theme text NOT NULL,
  question text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  bncc text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.idea_bank TO authenticated;
GRANT ALL ON public.idea_bank TO service_role;
ALTER TABLE public.idea_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher manages own ideas" ON public.idea_bank FOR ALL TO authenticated
  USING (teacher_id = auth.uid() AND public.has_role(auth.uid(),'teacher'))
  WITH CHECK (teacher_id = auth.uid() AND public.has_role(auth.uid(),'teacher'));
CREATE POLICY "students read their teachers ideas" ON public.idea_bank FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.classes c WHERE c.teacher_id = idea_bank.teacher_id AND public.is_class_student(c.id)));
CREATE INDEX idea_bank_teacher_idx ON public.idea_bank(teacher_id);

CREATE OR REPLACE FUNCTION public.seed_teacher_ideas(_teacher uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.idea_bank (teacher_id, area, theme, question, summary, bncc)
  SELECT _teacher, v.* FROM (VALUES ('BIO','Bioindicadores da qualidade da água em córregos urbanos de Cuiabá','A presença de macroinvertebrados indica a qualidade da água dos córregos próximos à escola?','Coletar amostras em pontos diferentes de um córrego, identificar organismos com chave simplificada e comparar com medições simples de pH e turbidez.',ARRAY['Ciências da Natureza','Sustentabilidade']::text[]),('BIO','Germinação de sementes do Cerrado após exposição ao fogo','O calor simulado de queimadas acelera ou impede a germinação de sementes nativas do Cerrado?','Expor sementes a temperaturas controladas e acompanhar a germinação em comparação com um grupo controle.',ARRAY['Ciências da Natureza','Meio ambiente']::text[]),('BIO','Plantas medicinais do Pantanal e seu efeito antimicrobiano','Extratos de plantas usadas pela comunidade inibem o crescimento de bactérias comuns?','Preparar extratos simples e testar halos de inibição em meio de cultura caseiro, com orientação de biossegurança.',ARRAY['Ciências da Natureza','Saberes tradicionais']::text[]),('SAU','Hidratação e rendimento escolar em dias de calor extremo','Os estudantes que bebem mais água durante o período de aula apresentam melhor atenção em dias acima de 35 °C?','Aplicar questionário e teste rápido de atenção, cruzando com o consumo de água registrado pelos voluntários (com TCLE).',ARRAY['Saúde','Clima']::text[]),('SAU','Consumo de ultraprocessados na cantina escolar','Qual a proporção de alimentos ultraprocessados consumidos pelos estudantes no intervalo e como reduzi-la?','Levantamento de rótulos e entrevistas, propondo um cardápio alternativo de baixo custo.',ARRAY['Saúde','Educação alimentar']::text[]),('SAU','Uso de telas antes de dormir e qualidade do sono','O tempo de tela à noite influencia as horas de sono e o cansaço relatado pelos estudantes?','Diário de sono durante duas semanas e questionário validado, com proposta de campanha na escola.',ARRAY['Saúde mental','Tecnologia']::text[]),('EXA','Telhados verdes e redução da temperatura em salas de aula','Uma cobertura vegetal sobre maquetes reduz a temperatura interna em comparação com telhas comuns?','Construir maquetes com sensores de temperatura e medir durante vários dias ensolarados.',ARRAY['Física','Sustentabilidade']::text[]),('EXA','Filtro de água com materiais de baixo custo','Um filtro feito com carvão, areia e casca de banana reduz a turbidez da água?','Montar filtros com camadas diferentes e comparar a turbidez antes e depois da filtragem.',ARRAY['Química','Saneamento']::text[]),('EXA','Estatística da evasão escolar no bairro','Quais fatores mais se relacionam com a evasão escolar na comunidade?','Análise de dados públicos e da secretaria com gráficos e modelagem matemática simples.',ARRAY['Matemática','Sociedade']::text[]),('ENG','Sensor de umidade com Arduino para hortas escolares','Um sistema automático de irrigação economiza água em relação à rega manual?','Programar um sensor de umidade do solo que aciona irrigação e medir o volume de água gasto.',ARRAY['Tecnologia','Itinerário de Exatas']::text[]),('ENG','Tijolo ecológico com resíduos da construção','Tijolos com resíduos reciclados têm resistência semelhante aos tijolos comuns?','Produzir corpos de prova com diferentes proporções e testar resistência com pesos.',ARRAY['Engenharia','Economia circular']::text[]),('AGR','Compostagem dos resíduos orgânicos da merenda','A compostagem dos restos da merenda gera adubo eficiente para a horta escolar?','Montar composteiras, acompanhar temperatura e usar o composto em canteiros comparativos.',ARRAY['Agricultura','Sustentabilidade']::text[]),('AGR','Biofertilizante para o cultivo de hortaliças','O biofertilizante caseiro aumenta o crescimento de alfaces em comparação com o adubo comum?','Experimento com grupos de plantas e medições semanais de altura e número de folhas.',ARRAY['Agricultura','Ciências da Natureza']::text[]),('HUM','Memória dos bairros históricos de Cuiabá','Como os moradores mais antigos percebem as transformações do centro histórico?','Entrevistas de história oral, mapa afetivo e exposição com fotos antigas e atuais.',ARRAY['História','Patrimônio cultural']::text[]),('SOC','Educação financeira entre estudantes do ensino médio','Os estudantes que controlam gastos pessoais têm menos dívidas e mais metas financeiras?','Questionário, oficina de planejamento e comparação antes/depois.',ARRAY['Educação financeira','Projeto de vida']::text[]),('LIN','Linguagem cuiabana e identidade dos jovens','Os jovens ainda usam expressões do falar cuiabano e como isso se relaciona à identidade local?','Coleta de expressões, questionário e glossário ilustrado produzido pela turma.',ARRAY['Linguagens','Cultura regional']::text[])) AS v(area, theme, question, summary, bncc)
  WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = _teacher);
$$;
REVOKE EXECUTE ON FUNCTION public.seed_teacher_ideas(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.seed_ideas_on_teacher_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'teacher' AND NOT EXISTS (SELECT 1 FROM public.idea_bank WHERE teacher_id = NEW.user_id) THEN
    PERFORM public.seed_teacher_ideas(NEW.user_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER seed_ideas_on_teacher_role AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.seed_ideas_on_teacher_role();

SELECT public.seed_teacher_ideas(user_id) FROM public.user_roles WHERE role = 'teacher';