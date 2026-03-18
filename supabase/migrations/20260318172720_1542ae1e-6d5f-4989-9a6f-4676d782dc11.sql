CREATE OR REPLACE FUNCTION public.study_summaries()
RETURNS TABLE(
  study_id uuid,
  total_notas bigint,
  total_pago numeric,
  total_proposto numeric,
  economia numeric,
  pct_economia numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    s.study_id,
    count(*)::bigint AS total_notas,
    coalesce(sum(s.valor_cobrado), 0) AS total_pago,
    coalesce(sum(s.frete_final), 0) AS total_proposto,
    coalesce(sum(s.valor_cobrado), 0) - coalesce(sum(s.frete_final), 0) AS economia,
    CASE WHEN coalesce(sum(s.frete_final), 0) = 0 THEN 0
         ELSE round((coalesce(sum(s.valor_cobrado), 0) - coalesce(sum(s.frete_final), 0)) / sum(s.frete_final) * 100, 1)
    END AS pct_economia
  FROM simulations s
  WHERE s.match_status <> 'NOT_FOUND'
  GROUP BY s.study_id;
$$;