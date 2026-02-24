
-- Prazo realizado (histórico) - média por cidade
CREATE TABLE public.deadlines_realized (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  uf text NOT NULL,
  cidade_corrigida text NOT NULL,
  prazo_dias numeric NOT NULL,
  UNIQUE(study_id, uf, cidade_corrigida)
);

ALTER TABLE public.deadlines_realized ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for now" ON public.deadlines_realized FOR ALL USING (true) WITH CHECK (true);

-- Prazo proposto (transportadora nova)
CREATE TABLE public.deadlines_proposed (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  uf text NOT NULL,
  cidade_corrigida text NOT NULL,
  prazo_dias numeric NOT NULL,
  UNIQUE(study_id, uf, cidade_corrigida)
);

ALTER TABLE public.deadlines_proposed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for now" ON public.deadlines_proposed FOR ALL USING (true) WITH CHECK (true);
