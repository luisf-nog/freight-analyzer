CREATE OR REPLACE FUNCTION public.study_summaries()
 RETURNS TABLE(study_id uuid, total_notas bigint, total_pago numeric, total_proposto numeric, economia numeric, pct_economia numeric, prazo_medio_realizado numeric, prazo_medio_proposto numeric)
 LANGUAGE sql
 STABLE
 SET search_path = public
AS $function$
  SELECT
    s.study_id,
    count(*)::bigint AS total_notas,
    coalesce(sum(s.valor_cobrado), 0) AS total_pago,
    coalesce(sum(s.frete_final), 0) AS total_proposto,
    coalesce(sum(s.valor_cobrado), 0) - coalesce(sum(s.frete_final), 0) AS economia,
    CASE WHEN coalesce(sum(s.frete_final), 0) = 0 THEN 0
         ELSE round((coalesce(sum(s.valor_cobrado), 0) - coalesce(sum(s.frete_final), 0)) / sum(s.frete_final) * 100, 1)
    END AS pct_economia,
    (SELECT round(avg(dr.prazo_dias), 1) FROM deadlines_realized dr WHERE dr.study_id = s.study_id) AS prazo_medio_realizado,
    (SELECT round(avg(dp.prazo_dias), 1) FROM deadlines_proposed dp WHERE dp.study_id = s.study_id) AS prazo_medio_proposto
  FROM simulations s
  WHERE s.match_status <> 'NOT_FOUND'
  GROUP BY s.study_id;
$function$;