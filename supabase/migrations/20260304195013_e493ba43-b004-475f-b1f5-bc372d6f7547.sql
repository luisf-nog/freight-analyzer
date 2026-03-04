CREATE INDEX IF NOT EXISTS idx_carrier_rates_study_id ON public.carrier_rates (study_id);
CREATE INDEX IF NOT EXISTS idx_shipments_paid_study_id ON public.shipments_paid (study_id);
CREATE INDEX IF NOT EXISTS idx_simulations_study_id ON public.simulations (study_id);