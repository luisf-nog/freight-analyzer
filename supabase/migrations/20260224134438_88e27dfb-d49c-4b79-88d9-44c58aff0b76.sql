
-- =============================================
-- FreteLab Phase 1 Schema
-- =============================================

-- 1) studies
CREATE TABLE public.studies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  name TEXT NOT NULL,
  carrier_name TEXT NOT NULL DEFAULT '',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','imported','calculated','archived')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for now" ON public.studies FOR ALL USING (true) WITH CHECK (true);

-- 2) carrier_rates
CREATE TABLE public.carrier_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  cidade_corrigida TEXT NOT NULL,
  uf TEXT NOT NULL,
  adv_min NUMERIC DEFAULT 0,
  adv_pct_nf NUMERIC DEFAULT 0,
  sec_cat NUMERIC DEFAULT 0,
  pedagio_fr_100kg NUMERIC DEFAULT 0,
  gris_min NUMERIC DEFAULT 0,
  gris_pct_nf NUMERIC DEFAULT 0,
  tas NUMERIC DEFAULT 0,
  sefaz NUMERIC DEFAULT 0,
  emex_min NUMERIC DEFAULT 0,
  emex_pct_nf NUMERIC DEFAULT 0,
  trt_min NUMERIC DEFAULT 0,
  trt_pct_fr NUMERIC DEFAULT 0,
  tde_min NUMERIC DEFAULT 0,
  tde_pct_fr NUMERIC DEFAULT 0,
  tde_por_kg NUMERIC DEFAULT 0,
  tce_min NUMERIC DEFAULT 0,
  tda_min NUMERIC DEFAULT 0,
  tda_pct_fr NUMERIC DEFAULT 0,
  tso_pct NUMERIC DEFAULT 0,
  tso_min NUMERIC DEFAULT 0,
  faixa_10 NUMERIC DEFAULT 0,
  faixa_20 NUMERIC DEFAULT 0,
  faixa_30 NUMERIC DEFAULT 0,
  faixa_50 NUMERIC DEFAULT 0,
  faixa_70 NUMERIC DEFAULT 0,
  faixa_100 NUMERIC,
  faixa_150 NUMERIC,
  faixa_200 NUMERIC,
  frete_kg_ex_200 NUMERIC DEFAULT 0,
  UNIQUE (study_id, uf, cidade_corrigida)
);

ALTER TABLE public.carrier_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for now" ON public.carrier_rates FOR ALL USING (true) WITH CHECK (true);

-- 3) shipments_paid
CREATE TABLE public.shipments_paid (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL,
  cidade_corrigida TEXT NOT NULL,
  uf TEXT NOT NULL,
  peso NUMERIC NOT NULL,
  valor_nf NUMERIC NOT NULL,
  valor_cobrado NUMERIC NOT NULL,
  data DATE,
  transportadora_atual TEXT,
  servico TEXT
);

ALTER TABLE public.shipments_paid ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for now" ON public.shipments_paid FOR ALL USING (true) WITH CHECK (true);

-- 4) icms_uf
CREATE TABLE public.icms_uf (
  uf TEXT PRIMARY KEY,
  aliquota NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.icms_uf ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for now" ON public.icms_uf FOR ALL USING (true) WITH CHECK (true);

-- Pre-populate with 27 Brazilian UFs
INSERT INTO public.icms_uf (uf, aliquota) VALUES
  ('AC', 0.17), ('AL', 0.17), ('AM', 0.18), ('AP', 0.18),
  ('BA', 0.18), ('CE', 0.18), ('DF', 0.18), ('ES', 0.17),
  ('GO', 0.17), ('MA', 0.18), ('MG', 0.18), ('MS', 0.17),
  ('MT', 0.17), ('PA', 0.17), ('PB', 0.18), ('PE', 0.18),
  ('PI', 0.18), ('PR', 0.185), ('RJ', 0.20), ('RN', 0.18),
  ('RO', 0.175), ('RR', 0.17), ('RS', 0.17), ('SC', 0.17),
  ('SE', 0.18), ('SP', 0.18), ('TO', 0.18);

-- 5) simulations
CREATE TABLE public.simulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  shipment_row_id UUID NOT NULL REFERENCES public.shipments_paid(id) ON DELETE CASCADE,
  rate_row_id UUID REFERENCES public.carrier_rates(id) ON DELETE SET NULL,
  match_status TEXT NOT NULL DEFAULT 'OK',
  errors TEXT,
  frete_base_peso NUMERIC,
  adv NUMERIC,
  sec_tas NUMERIC,
  pedagio NUMERIC,
  gris NUMERIC,
  sefaz NUMERIC,
  emex NUMERIC,
  tda NUMERIC,
  tso NUMERIC,
  frete_peso NUMERIC,
  adm_rodo_tax NUMERIC,
  frete_c_icms NUMERIC,
  trt_calc NUMERIC,
  tx_redespacho NUMERIC,
  frete_final NUMERIC,
  valor_cobrado NUMERIC,
  diferenca_valor NUMERIC,
  pct_dif NUMERIC,
  reais_kg_hj NUMERIC,
  reais_kg_proposta NUMERIC,
  UNIQUE (study_id, shipment_row_id)
);

ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for now" ON public.simulations FOR ALL USING (true) WITH CHECK (true);

-- Performance indexes
CREATE INDEX idx_simulations_study_status ON public.simulations (study_id, match_status);
CREATE INDEX idx_simulations_study_shipment ON public.simulations (study_id, shipment_row_id);
CREATE INDEX idx_carrier_rates_study_lookup ON public.carrier_rates (study_id, uf, cidade_corrigida);
CREATE INDEX idx_shipments_study ON public.shipments_paid (study_id);
