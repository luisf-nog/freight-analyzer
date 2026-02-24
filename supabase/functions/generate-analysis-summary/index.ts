import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT_EXECUTIVE = `Você é um especialista em análise estratégica de custos logísticos.
Sua função é gerar um resumo executivo objetivo para tomada de decisão sobre utilização de uma nova transportadora.

CONTEXTO IMPORTANTE:
A decisão NÃO é necessariamente trocar 100% do volume para a nova transportadora.
O cenário mais comum é manter a transportadora atual para os estados/rotas onde ela é mais competitiva e adotar a nova proposta apenas nos estados/rotas onde há vantagem clara.
Sua análise deve refletir isso: identifique ONDE vale a pena migrar e ONDE é melhor manter o contrato atual.
Sempre que possível, sugira uma estratégia híbrida indicando quais UFs/regiões migrar e quais manter.

Regras:
- Baseie-se EXCLUSIVAMENTE nos dados fornecidos.
- Não invente números.
- Seja direto, técnico e profissional.
- Aponte riscos e oportunidades.
- Termine com uma recomendação clara.
- Não use emojis.
- Estruture o texto em seções curtas.
- Gere um resumo executivo com no máximo 12 linhas por seção.
- Se algum dado for insuficiente para conclusão segura, informe explicitamente.
- Não faça suposições.

O resumo DEVE seguir esta estrutura:

1. RESULTADO EXECUTIVO
   - Economia ou aumento total (R$ e %)
   - Impacto médio por NF
   - R$/kg comparação

2. CONFIABILIDADE DO ESTUDO
   - % match
   - Impacto financeiro das pendências
   - Se há risco de distorção

3. ONDE GANHA
   - Estados com maior economia absoluta
   - Faixas de peso vantajosas

4. ONDE PERDE
   - Estados com maior perda
   - Faixas críticas

5. RISCO ESTRATÉGICO
   - Concentração da perda (muitas perdas pequenas ou poucas grandes?)
   - Dependência de poucas rotas

6. ÍNDICE DE RISCO DA TROCA (0 a 100)
   - Calcule com base nas regras:
     Se %match < 95 → -20 pontos (partindo de 100)
     Se impacto negativo concentrado >30% em 1 UF → -20
     Se variação média > +5% → -30
     Se >10% das NFs pioram >10% → -20
   - Comente o score

7. CONCLUSÃO OBJETIVA
   - "Recomendado", "Recomendado com ressalvas" ou "Não recomendado"
   - Justificativa baseada nos dados

Analise os dados abaixo:`;

const SYSTEM_PROMPT_TECHNICAL = `Você é um especialista em análise de custos logísticos com foco técnico em componentes de frete.
Sua função é gerar uma análise técnica detalhada com foco em componentes de custo.

CONTEXTO IMPORTANTE:
A decisão NÃO é necessariamente trocar 100% do volume para a nova transportadora.
O cenário mais comum é manter a transportadora atual para os estados/rotas onde ela é mais competitiva e adotar a nova proposta apenas nos estados/rotas onde há vantagem clara.
Sua análise deve refletir isso: identifique ONDE vale a pena migrar e ONDE é melhor manter o contrato atual.
Sempre que possível, sugira uma estratégia híbrida indicando quais UFs/regiões migrar e quais manter.

Regras:
- Baseie-se EXCLUSIVAMENTE nos dados fornecidos.
- Não invente números.
- Seja técnico e detalhado.
- Analise cada componente de custo separadamente.
- Não use emojis.
- Se algum dado for insuficiente para conclusão segura, informe explicitamente.
- Não faça suposições.

Estrutura da análise:

1. VISÃO GERAL DOS NÚMEROS
   - Totais, médias, volumes

2. CONFIABILIDADE DA BASE
   - Match rate, pendências, impacto

3. ANÁLISE POR REGIÃO
   - Detalhamento por macro região e UF
   - Capital vs Interior quando relevante

4. ANÁLISE POR FAIXA DE PESO
   - Quais faixas são vantajosas/desvantajosas

5. CONCENTRAÇÃO E DISPERSÃO
   - Distribuição do impacto (% NFs que ganham vs perdem)
   - Concentração geográfica

6. ÍNDICE DE RISCO DA TROCA (0 a 100)
   - Calcule com base nas regras:
     Se %match < 95 → -20 pontos (partindo de 100)
     Se impacto negativo concentrado >30% em 1 UF → -20
     Se variação média > +5% → -30
     Se >10% das NFs pioram >10% → -20
   - Comente o score

7. RECOMENDAÇÃO TÉCNICA
   - Conclusão com justificativa

Analise os dados abaixo:`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { data, type } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = type === "technical" ? SYSTEM_PROMPT_TECHNICAL : SYSTEM_PROMPT_EXECUTIVE;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(data, null, 2) },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao gerar análise" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("generate-analysis-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
