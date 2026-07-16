import { defineMcp } from "@lovable.dev/mcp-js";
import listStudies from "./tools/list-studies";
import getStudySummary from "./tools/get-study-summary";
import analyzeByUf from "./tools/analyze-by-uf";
import topCitiesToAdjust from "./tools/top-cities-to-adjust";

export default defineMcp({
  name: "frete-analise-mcp",
  title: "Análise de Fretes MCP",
  version: "0.1.0",
  instructions:
    "Ferramentas de leitura para explorar estudos de simulação de fretes: listar estudos, obter resumo de um estudo, agrupar resultados por UF e listar cidades onde a proposta da transportadora está mais cara que o valor pago hoje.",
  tools: [listStudies, getStudySummary, analyzeByUf, topCitiesToAdjust],
});
