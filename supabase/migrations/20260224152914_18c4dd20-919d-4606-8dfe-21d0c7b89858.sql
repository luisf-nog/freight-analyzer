-- Add valor_nf and peso to simulations for audit/drill-down
ALTER TABLE public.simulations ADD COLUMN IF NOT EXISTS valor_nf numeric;
ALTER TABLE public.simulations ADD COLUMN IF NOT EXISTS peso numeric;