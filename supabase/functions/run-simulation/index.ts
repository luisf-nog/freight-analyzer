import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

// Treat 0 as null for optional weight tiers (a R$0 rate is invalid)
function nonZero(v: number | null): number | null {
  return (v != null && v !== 0) ? v : null;
}

function getFreteBasePeso(rate: CarrierRate, peso: number): number {
  const f100 = nonZero(rate.faixa_100);
  const f150 = nonZero(rate.faixa_150);
  const f200 = nonZero(rate.faixa_200);
  const exRate = rate.frete_kg_ex_200 ?? 0;

  if (peso <= 10) return rate.faixa_10 ?? 0;
  if (peso <= 20) return rate.faixa_20 ?? rate.faixa_10 ?? 0;
  if (peso <= 30) return rate.faixa_30 ?? rate.faixa_20 ?? 0;
  if (peso <= 50) return rate.faixa_50 ?? rate.faixa_30 ?? 0;
  if (peso <= 70) return rate.faixa_70 ?? rate.faixa_50 ?? 0;

  // Determine highest available tier and use excedente from there
  if (f200 != null) {
    // Full table: 100, 150, 200
    if (f100 != null && peso <= 100) return f100;
    if (f150 != null && peso <= 150) return f150;
    if (peso <= 200) return f200;
    return f200 + (peso - 200) * exRate;
  }
  if (f150 != null) {
    // Table up to 150
    if (f100 != null && peso <= 100) return f100;
    if (peso <= 150) return f150;
    return f150 + (peso - 150) * exRate;
  }
  if (f100 != null) {
    // Table up to 100 — excedente starts at 100
    if (peso <= 100) return f100;
    return f100 + (peso - 100) * exRate;
  }
  // No 100/150/200 tiers — excedente starts at 70
  const base70 = rate.faixa_70 ?? rate.faixa_50 ?? 0;
  return base70 + (peso - 70) * exRate;
}

function simulate(shipment: Shipment, rate: CarrierRate, icmsAliquota: number | null, marginPct: number) {
  const peso = shipment.peso;
  const valorNf = shipment.valor_nf;
  const frete_base_peso = getFreteBasePeso(rate, peso);
  const adv = Math.max(rate.adv_min ?? 0, valorNf * (rate.adv_pct_nf ?? 0));
  const sec_tas = (rate.sec_cat ?? 0) + (rate.tas ?? 0);
  const pedagio = Math.ceil(peso / 100) * (rate.pedagio_fr_100kg ?? 0);
  const gris = Math.max(rate.gris_min ?? 0, valorNf * (rate.gris_pct_nf ?? 0));
  const sefaz = rate.sefaz ?? 0;
  const emex = Math.max(rate.emex_min ?? 0, valorNf * (rate.emex_pct_nf ?? 0));
  const tda = Math.max(rate.tda_min ?? 0, valorNf * (rate.tda_pct_fr ?? 0));
  const tso = Math.max(rate.tso_min ?? 0, valorNf * (rate.tso_pct ?? 0));
  const tx_redespacho = Math.max(
    rate.tde_min ?? 0,
    frete_base_peso * (rate.tde_pct_fr ?? 0),
    peso * (rate.tde_por_kg ?? 0)
  );
  const frete_peso = frete_base_peso + adv + sec_tas + pedagio + gris + sefaz + emex + tda + tso;
  let frete_c_icms = frete_peso;
  if (icmsAliquota && icmsAliquota > 0) {
    frete_c_icms = frete_peso / (1 - icmsAliquota);
  }
  const trt_calc = Math.max(rate.trt_min ?? 0, frete_c_icms * (rate.trt_pct_fr ?? 0));
  const frete_final = frete_c_icms + trt_calc + tx_redespacho;
  const adm_rodo_tax = frete_peso;
  const valor_cobrado_ajustado = shipment.valor_cobrado * (1 - marginPct);
  const diferenca_valor = valor_cobrado_ajustado - frete_final;
  const pct_dif = frete_final > 0 ? diferenca_valor / frete_final : 0;
  const reais_kg_hj = peso > 0 ? shipment.valor_cobrado / peso : 0;
  const reais_kg_proposta = peso > 0 ? frete_final / peso : 0;

  return {
    study_id: "",
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
    valor_nf: round2(valorNf),
    peso: round2(peso),
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
    const { study_id, batch_offset = 0, batch_size = 500, is_first_batch = true, margin_pct = 0 } = await req.json();
    if (!study_id) throw new Error("study_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // On first batch, delete old simulations and load reference data
    if (is_first_batch) {
      await supabase.from("simulations").delete().eq("study_id", study_id);
    }

    // Load rates and ICMS (small tables, always needed)
    const [rates, icmsRows] = await Promise.all([
      fetchAll(supabase, "carrier_rates", "*", { study_id }),
      fetchAll(supabase, "icms_uf", "uf, aliquota", {}),
    ]);

    const rateMap = new Map<string, CarrierRate>();
    const rateUFs = new Set<string>();
    for (const r of rates) {
      rateMap.set(`${r.uf}|${r.cidade_corrigida}`, r);
      rateUFs.add(r.uf);
    }
    const icmsMap = new Map<string, number>();
    for (const i of icmsRows) icmsMap.set(i.uf, i.aliquota);

    // Fetch only this batch of shipments
    let q = supabase
      .from("shipments_paid")
      .select("id, uf, cidade_corrigida, peso, valor_nf, valor_cobrado")
      .eq("study_id", study_id)
      .order("id")
      .range(batch_offset, batch_offset + batch_size - 1);
    
    const { data: shipments, error: shipErr } = await q;
    if (shipErr) throw shipErr;

    const shipmentsBatch = shipments || [];
    const relevantShipments = shipmentsBatch.filter((s: Shipment) => rateUFs.has(s.uf));

    let matched = 0;
    let notFound = 0;
    const rows: any[] = [];
    const usedRateKeys = new Set<string>();

    for (const s of relevantShipments) {
      const key = `${s.uf}|${s.cidade_corrigida}`;
      const rate = rateMap.get(key);

      if (!rate) {
        rows.push({
          study_id,
          shipment_row_id: s.id,
          rate_row_id: null,
          match_status: "NOT_FOUND",
          valor_cobrado: s.valor_cobrado,
          valor_nf: s.valor_nf,
          peso: s.peso,
          reais_kg_hj: s.peso > 0 ? round2(s.valor_cobrado / s.peso) : 0,
          errors: `Cidade ${s.cidade_corrigida}/${s.uf} não encontrada na tabela`,
        });
        notFound++;
        continue;
      }

      usedRateKeys.add(key);
      const icms = icmsMap.get(s.uf) ?? null;
      if (icms === null) {
      const result = simulate(s, rate, 0, margin_pct);
      result.study_id = study_id;
        result.match_status = "MISSING_ICMS";
        result.errors = `Alíquota ICMS não definida para ${s.uf}`;
        rows.push(result);
        matched++;
        continue;
      }

      const result = simulate(s, rate, icms, margin_pct);
      result.study_id = study_id;
      rows.push(result);
      matched++;
    }

    // Identify carrier cities with no matching shipments
    const unusedCarrierCities: Array<{ uf: string; cidade: string }> = [];
    for (const [key] of rateMap) {
      if (!usedRateKeys.has(key)) {
        const [uf, cidade] = key.split("|");
        unusedCarrierCities.push({ uf, cidade });
      }
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("simulations").insert(rows);
      if (error) throw error;
    }

    const hasMore = shipmentsBatch.length === batch_size;

    return new Response(
      JSON.stringify({
        success: true,
        processed: relevantShipments.length,
        matched,
        notFound,
        batchFetched: shipmentsBatch.length,
        hasMore,
        nextOffset: batch_offset + batch_size,
        unusedCarrierCities: hasMore ? [] : unusedCarrierCities,
        totalCarrierCities: rateMap.size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
