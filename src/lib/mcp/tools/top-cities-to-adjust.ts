import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getPublicSupabase } from "../supabase";

export default defineTool({
  name: "top_cities_to_adjust",
  title: "Cidades para ajustar",
  description:
    "Retorna as cidades onde a proposta da transportadora está mais cara que o valor pago hoje (candidatas a ajuste na negociação), ordenadas pela maior perda absoluta.",
  inputSchema: {
    study_id: z.string().uuid(),
    limit: z.number().int().min(1).max(100).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ study_id, limit }) => {
    const supabase = getPublicSupabase();
    const pageSize = 1000;
    type Sim = { shipment_row_id: string; valor_cobrado: number | null; frete_final: number | null; match_status: string };
    let sims: Sim[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("simulations")
        .select("shipment_row_id, valor_cobrado, frete_final, match_status")
        .eq("study_id", study_id)
        .order("id")
        .range(from, from + pageSize - 1);
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      if (!data || data.length === 0) break;
      sims = sims.concat(data as Sim[]);
      if (data.length < pageSize) break;
    }
    const ids = Array.from(new Set(sims.map((s) => s.shipment_row_id)));
    const meta = new Map<string, { uf: string; cidade: string }>();
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200);
      const { data, error } = await supabase
        .from("shipments_paid")
        .select("id, uf, cidade_corrigida")
        .in("id", slice);
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      (data ?? []).forEach((r) =>
        meta.set(r.id as string, { uf: r.uf as string, cidade: r.cidade_corrigida as string }),
      );
    }
    const agg = new Map<string, { uf: string; cidade: string; pago: number; proposto: number; n: number }>();
    for (const s of sims) {
      if (s.match_status === "NOT_FOUND") continue;
      const m = meta.get(s.shipment_row_id);
      if (!m) continue;
      const key = `${m.uf}|${m.cidade}`;
      const cur = agg.get(key) ?? { uf: m.uf, cidade: m.cidade, pago: 0, proposto: 0, n: 0 };
      cur.pago += Number(s.valor_cobrado ?? 0);
      cur.proposto += Number(s.frete_final ?? 0);
      cur.n += 1;
      agg.set(key, cur);
    }
    const rows = [...agg.values()]
      .map((v) => {
        const dif = v.pago - v.proposto; // positivo = economia, negativo = proposta mais cara
        const pct = v.proposto ? (dif / v.proposto) * 100 : 0;
        return {
          uf: v.uf,
          cidade: v.cidade,
          notas: v.n,
          total_pago: Math.round(v.pago * 100) / 100,
          total_proposto: Math.round(v.proposto * 100) / 100,
          perda: Math.round(-dif * 100) / 100, // quanto a proposta está mais cara
          pct_dif: Math.round(pct * 10) / 10,
        };
      })
      .filter((r) => r.perda > 0)
      .sort((a, b) => b.perda - a.perda)
      .slice(0, limit);
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { cities: rows },
    };
  },
});
