import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getPublicSupabase } from "../supabase";

export default defineTool({
  name: "get_study_summary",
  title: "Resumo do estudo",
  description:
    "Retorna o resumo de um estudo: total de notas, pago, proposto, economia (pago - proposto), % de economia e prazos médios (real vs proposto).",
  inputSchema: {
    study_id: z.string().uuid().describe("UUID do estudo."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ study_id }) => {
    const supabase = getPublicSupabase();
    const [{ data: study, error: sErr }, { data: summaries, error: rErr }] = await Promise.all([
      supabase.from("studies").select("id, name, carrier_name, status, created_at").eq("id", study_id).maybeSingle(),
      supabase.rpc("study_summaries"),
    ]);
    if (sErr) return { content: [{ type: "text", text: sErr.message }], isError: true };
    if (!study) return { content: [{ type: "text", text: "Estudo não encontrado." }], isError: true };
    if (rErr) return { content: [{ type: "text", text: rErr.message }], isError: true };
    const summary = (summaries ?? []).find((s: { study_id: string }) => s.study_id === study_id) ?? null;
    const payload = { study, summary };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
