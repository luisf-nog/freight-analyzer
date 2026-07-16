import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getPublicSupabase } from "../supabase";

export default defineTool({
  name: "list_studies",
  title: "Listar estudos",
  description:
    "Lista os estudos de frete cadastrados (id, nome, transportadora, status, data de criação).",
  inputSchema: {
    limit: z.number().int().min(1).max(200).default(50).describe("Máximo de estudos a retornar."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }) => {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("studies")
      .select("id, name, carrier_name, status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { studies: data ?? [] },
    };
  },
});
