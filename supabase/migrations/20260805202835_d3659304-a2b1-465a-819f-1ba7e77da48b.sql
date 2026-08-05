CREATE INDEX IF NOT EXISTS idx_simulations_study_id_id ON public.simulations (study_id, id);
CREATE INDEX IF NOT EXISTS idx_shipments_paid_study_id_id ON public.shipments_paid (study_id, id);

CREATE OR REPLACE FUNCTION public.study_analysis_payload(p_study_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'match_status', s.match_status,
        'errors', s.errors,
        'valor_cobrado', s.valor_cobrado,
        'frete_final', s.frete_final,
        'diferenca_valor', s.diferenca_valor,
        'pct_dif', s.pct_dif,
        'reais_kg_hj', s.reais_kg_hj,
        'reais_kg_proposta', s.reais_kg_proposta,
        'frete_base_peso', s.frete_base_peso,
        'adv', s.adv,
        'sec_tas', s.sec_tas,
        'pedagio', s.pedagio,
        'gris', s.gris,
        'sefaz', s.sefaz,
        'emex', s.emex,
        'tda', s.tda,
        'tso', s.tso,
        'tx_redespacho', s.tx_redespacho,
        'frete_peso', s.frete_peso,
        'adm_rodo_tax', s.adm_rodo_tax,
        'frete_c_icms', s.frete_c_icms,
        'trt_calc', s.trt_calc,
        'shipment_row_id', s.shipment_row_id,
        'shipment_uf', coalesce(sp.uf, ''),
        'shipment_cidade', coalesce(sp.cidade_corrigida, ''),
        'shipment_peso', coalesce(sp.peso, 0),
        'shipment_valor_nf', coalesce(sp.valor_nf, 0),
        'shipment_data', sp.data
      ))
      FROM simulations s
      LEFT JOIN shipments_paid sp ON sp.id = s.shipment_row_id
      WHERE s.study_id = p_study_id
    ), '[]'::jsonb),
    'realized', coalesce((
      SELECT jsonb_agg(jsonb_build_object('uf', d.uf, 'cidade_corrigida', d.cidade_corrigida, 'prazo_dias', d.prazo_dias))
      FROM deadlines_realized d WHERE d.study_id = p_study_id
    ), '[]'::jsonb),
    'proposed', coalesce((
      SELECT jsonb_agg(jsonb_build_object('uf', d.uf, 'cidade_corrigida', d.cidade_corrigida, 'prazo_dias', d.prazo_dias))
      FROM deadlines_proposed d WHERE d.study_id = p_study_id
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.study_analysis_payload(uuid) TO anon, authenticated, service_role;