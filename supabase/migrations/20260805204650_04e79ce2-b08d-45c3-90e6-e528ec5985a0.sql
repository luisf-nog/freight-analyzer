CREATE OR REPLACE FUNCTION public.study_ufs()
RETURNS TABLE(study_id uuid, ufs text[])
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT cr.study_id, array_agg(DISTINCT cr.uf ORDER BY cr.uf)
  FROM carrier_rates cr
  WHERE cr.uf IS NOT NULL AND cr.uf <> ''
  GROUP BY cr.study_id;
$$;