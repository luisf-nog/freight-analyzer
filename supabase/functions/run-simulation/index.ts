import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Brazilian state capitals for Capital/Interior classification
const STATE_CAPITALS: Record<string, string> = {
  AC: "RIO BRANCO", AL: "MACEIO", AM: "MANAUS", AP: "MACAPA",
  BA: "SALVADOR", CE: "FORTALEZA", DF: "BRASILIA", ES: "VITORIA",
  GO: "GOIANIA", MA: "SAO LUIS", MG: "BELO HORIZONTE", MS: "CAMPO GRANDE",
  MT: "CUIABA", PA: "BELEM", PB: "JOAO PESSOA", PE: "RECIFE",
  PI: "TERESINA", PR: "CURITIBA", RJ: "RIO DE JANEIRO", RN: "NATAL",
  RO: "PORTO VELHO", RR: "BOA VISTA", RS: "PORTO ALEGRE",
  SC: "FLORIANOPOLIS", SE: "ARACAJU", SP: "SAO PAULO", TO: "PALMAS",
};

interface CarrierRate {
  id: string;
  uf: string;
  cidade_corrigida: string;
  faixa_10: number | null;
  faixa_20: number | null;
  faixa_30: number | null;
  faixa_50: number | null;
  faixa_70: number | null;
  faixa_100: number | null;
  faixa_150: number | null;
  faixa_200: number | null;
  frete_kg_ex_200: number | null;
  adv_min: number | null;
  adv_pct_nf: number | null;
  sec_cat: number | null;
  pedagio_fr_100kg: number | null;
  gris_min: number | null;
  gris_pct_nf: number | null;
  tas: number | null;
  sefaz: number | null;
  emex_min: number | null;
  emex_pct_nf: number | null;
  trt_min: number | null;
  trt_pct_fr: number | null;
  tde_min: number | null;
  tde_pct_fr: number | null;
  tde_por_kg: number | null;
  tce_min: number | null;
  tda_min: number | null;
  tda_pct_fr: number | null;
  tso_pct: number | null;
  tso_min: number | null;
}

interface Shipment {
  id: string;
  uf: string;
  cidade_corrigida: string;
  peso: number;
  valor_nf: number;
  valor_cobrado: number;
}

function getFreteBasePeso(rate: CarrierRate, peso: number): number {
  if (peso <= 10) return rate.faixa_10 ?? 0;
  if (peso <= 20) return rate.faixa_20 ?? 0;
  if (peso <= 30) return rate.faixa_30 ?? 0;
  if (peso <= 50) return rate.faixa_50 ?? 0;
  if (peso <= 70) return rate.faixa_70 ?? 0;
  if (peso <= 100) return rate.faixa_100 ?? rate.faixa_70 ?? 0;
  if (peso <= 150) return rate.faixa_150 ?? rate.faixa_100 ?? rate.faixa_70 ?? 0;
  if (peso <= 200) return rate.faixa_200 ?? rate.faixa_150 ?? rate.faixa_100 ?? rate.faixa_70 ?? 0;
  // Excedente: faixa_200 + (peso - 200) * frete_kg_ex_200
  const base200 = rate.faixa_200 ?? rate.faixa_150 ?? rate.faixa_100 ?? rate.faixa_70 ?? 0;
  const exRate = rate.frete_kg_ex_200 ?? 0;
  return base200 + (peso - 200) * exRate;
}

function simulate(shipment: Shipment, rate: CarrierRate, icmsAliquota: number | null) {
  const peso = shipment.peso;
  const valorNf = shipment.valor_nf;

  const frete_base_peso = getFreteBasePeso(rate, peso);

  // ADV: max(adv_min, valor_nf * adv_pct_nf)
  const adv = Math.max(rate.adv_min ?? 0, valorNf * (rate.adv_pct_nf ?? 0));

  // SEC + TAS
  const sec_tas = (rate.sec_cat ?? 0) + (rate.tas ?? 0);

  // Pedágio: ceil(peso / 100) * pedagio_fr_100kg
  const pedagio = Math.ceil(peso / 100) * (rate.pedagio_fr_100kg ?? 0);

  // GRIS: max(gris_min, valor_nf * gris_pct_nf)
  const gris = Math.max(rate.gris_min ?? 0, valorNf * (rate.gris_pct_nf ?? 0));

  // SEFAZ
  const sefaz = rate.sefaz ?? 0;

  // EMEX: max(emex_min, valor_nf * emex_pct_nf)
  const emex = Math.max(rate.emex_min ?? 0, valorNf * (rate.emex_pct_nf ?? 0));

  // TDA: max(tda_min, frete_base_peso * tda_pct_fr)
  const tda = Math.max(rate.tda_min ?? 0, frete_base_peso * (rate.tda_pct_fr ?? 0));

  // TSO: max(tso_min, frete_base_peso * tso_pct)
  const tso = Math.max(rate.tso_min ?? 0, frete_base_peso * (rate.tso_pct ?? 0));

  // TDE: max(tde_min, frete_base_peso * tde_pct_fr, peso * tde_por_kg)
  const tx_redespacho = Math.max(
    rate.tde_min ?? 0,
    frete_base_peso * (rate.tde_pct_fr ?? 0),
    peso * (rate.tde_por_kg ?? 0)
  );

  // Frete peso (subtotal before ICMS/TRT)
  const frete_peso = frete_base_peso + adv + sec_tas + pedagio + gris + sefaz + emex + tda + tso;

  // ADM/Rodo tax (same as frete_peso for the ICMS base)
  const adm_rodo_tax = frete_peso + tx_redespacho;

  // ICMS: frete_c_icms = adm_rodo_tax / (1 - aliquota)
  let frete_c_icms = adm_rodo_tax;
  if (icmsAliquota && icmsAliquota > 0) {
    frete_c_icms = adm_rodo_tax / (1 - icmsAliquota);
  }

  // TRT: max(trt_min, frete_c_icms * trt_pct_fr)
  const trt_calc = Math.max(rate.trt_min ?? 0, frete_c_icms * (rate.trt_pct_fr ?? 0));

  // Final freight
  const frete_final = frete_c_icms + trt_calc;

  const diferenca_valor = shipment.valor_cobrado - frete_final;
  const pct_dif = frete_final > 0 ? diferenca_valor / frete_final : 0;
  const reais_kg_hj = peso > 0 ? shipment.valor_cobrado / peso : 0;
  const reais_kg_proposta = peso > 0 ? frete_final / peso : 0;

  return {
    study_id: "", // filled later
    shipment_row_id: shipment.id,
    rate_row_id: rate.id,
    match_status: "OK",
    frete_base_peso: round2(frete_base_peso),
    adv: round2(adv),
    sec_tas: round2(sec_tas),
    pedagio: round2(pedagio),
    gris: round2(gris),
    sefaz: round2(sefaz),
    emex: round2(emex),
    tda: round2(tda),
    tso: round2(tso),
    tx_redespacho: round2(tx_redespacho),
    frete_peso: round2(frete_peso),
    adm_rodo_tax: round2(adm_rodo_tax),
    frete_c_icms: round2(frete_c_icms),
    trt_calc: round2(trt_calc),
    frete_final: round2(frete_final),
    valor_cobrado: round2(shipment.valor_cobrado),
    diferenca_valor: round2(diferenca_valor),
    pct_dif: round4(pct_dif),
    reais_kg_hj: round2(reais_kg_hj),
    reais_kg_proposta: round2(reais_kg_proposta),
    errors: null,
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function round4(n: number) { return Math.round(n * 10000) / 10000; }

async function fetchAll(supabase: any, table: string, select: string, filters: Record<string, string>) {
  const all: any[] = [];
  let offset = 0;
  const batchSize = 1000;
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + batchSize - 1);
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { study_id } = await req.json();
    if (!study_id) throw new Error("study_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load all data in parallel
    const [rates, shipments, icmsRows] = await Promise.all([
      fetchAll(supabase, "carrier_rates", "*", { study_id }),
      fetchAll(supabase, "shipments_paid", "id, uf, cidade_corrigida, peso, valor_nf, valor_cobrado", { study_id }),
      fetchAll(supabase, "icms_uf", "uf, aliquota", {}),
    ]);

    // Build lookup maps
    const rateMap = new Map<string, CarrierRate>();
    const rateUFs = new Set<string>();
    for (const r of rates) {
      rateMap.set(`${r.uf}|${r.cidade_corrigida}`, r);
      rateUFs.add(r.uf);
    }
    const icmsMap = new Map<string, number>();
    for (const i of icmsRows) icmsMap.set(i.uf, i.aliquota);

    // Delete previous simulations
    await supabase.from("simulations").delete().eq("study_id", study_id);

    // Process shipments in batches
    const BATCH = 2000;
    let processed = 0;
    let matched = 0;
    let notFound = 0;

    // Filter to relevant UFs only
    const relevantShipments = shipments.filter((s: Shipment) => rateUFs.has(s.uf));

    for (let i = 0; i < relevantShipments.length; i += BATCH) {
      const batch = relevantShipments.slice(i, i + BATCH);
      const rows: any[] = [];

      for (const s of batch) {
        const key = `${s.uf}|${s.cidade_corrigida}`;
        const rate = rateMap.get(key);

        if (!rate) {
          rows.push({
            study_id,
            shipment_row_id: s.id,
            rate_row_id: null,
            match_status: "NOT_FOUND",
            valor_cobrado: s.valor_cobrado,
            reais_kg_hj: s.peso > 0 ? round2(s.valor_cobrado / s.peso) : 0,
            errors: `Cidade ${s.cidade_corrigida}/${s.uf} não encontrada na tabela`,
          });
          notFound++;
          continue;
        }

        const icms = icmsMap.get(s.uf) ?? null;
        if (icms === null) {
          // Still simulate but flag
          const result = simulate(s, rate, 0);
          result.study_id = study_id;
          result.match_status = "MISSING_ICMS";
          result.errors = `Alíquota ICMS não definida para ${s.uf}`;
          rows.push(result);
          matched++;
          continue;
        }

        const result = simulate(s, rate, icms);
        result.study_id = study_id;
        rows.push(result);
        matched++;
      }

      if (rows.length > 0) {
        const { error } = await supabase.from("simulations").insert(rows);
        if (error) throw error;
      }
      processed += batch.length;
    }

    return new Response(
      JSON.stringify({ success: true, processed, matched, notFound, total: relevantShipments.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
