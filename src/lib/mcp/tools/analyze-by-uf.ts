import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getPublicSupabase } from "../supabase";

type Row = {
  uf: string | null;
  valor_cobrado: number | null;
  frete_final: number | null;
  match_status: string;
};

export default defineTool({
  name: "analyze_by_uf",
  title: "Análise por UF",
  description:
    "Agrupa os resultados da simulação de um estudo por UF: total pago, total proposto, diferença (pago - proposto) e % de diferença. Positivo = economia proposta / negativo = proposta mais cara.",
  inputSchema: {
    study_id: z.string().uuid(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ study_id }) => {
    const supabase = getPublicSupabase();
    const pageSize = 1000;
    let all: Row[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("simulations")
        .select("uf:shipment_row_id, valor_cobrado, frete_final, match_status")
        .eq("study_id", study_id)
        .order("id")
        .range(from, from + pageSize - 1);
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      if (!data || data.length === 0) break;
      all = all.concat(data as unknown as Row[]);
      if (data.length < pageSize) break;
    }
    // join UF via shipments_paid since simulations doesn't store UF directly
    const shipmentIds = Array.from(new Set(all.map((r) => (r as unknown as { uf: string }).uf))).filter(Boolean);
    const ufMap = new Map<string, string>();
    for (let i = 0; i < shipmentIds.length; i += 200) {
      const slice = shipmentIds.slice(i, i + 200);
      const { data, error } = await supabase
        .from("shipments_paid")
        .select("id, uf")
        .in("id", slice);
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      (data ?? []).forEach((r) => ufMap.set(r.id as string, r.uf as string));
    }
    const byUf = new Map<string, { pago: number; proposto: number; n: number }>();
    for (const r of all) {
      if (r.match_status === "NOT_FOUND") continue;
      const uf = ufMap.get((r as unknown as { uf: string }).uf) ?? "??";
      const cur = byUf.get(uf) ?? { pago: 0, proposto: 0, n: 0 };
      cur.pago += Number(r.valor_cobrado ?? 0);
      cur.proposto += Number(r.frete_final ?? 0);
      cur.n += 1;
      byUf.set(uf, cur);
    }
    const rows = [...byUf.entries()]
      .map(([uf, v]) => {
        const dif = v.pago - v.proposto;
        const pct = v.proposto ? (dif / v.proposto) * 100 : 0;
        return {
          uf,
          notas: v.n,
          total_pago: Math.round(v.pago * 100) / 100,
          total_proposto: Math.round(v.proposto * 100) / 100,
          diferenca: Math.round(dif * 100) / 100,
          pct_diferenca: Math.round(pct * 10) / 10,
        };
      })
      .sort((a, b) => b.diferenca - a.diferenca);
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { by_uf: rows },
    };
  },
});
