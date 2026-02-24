

# FreteLab — Plano de Implementação (Fase 1)

Aplicação full-stack para equipes de logística compararem tabelas de transportadoras com histórico real de frete pago. Interface 100% em Português.

---

## Fase 1: Banco de Dados + Importações + Match Quality

### 1.1 Schema do Banco (Supabase)

Criar todas as tabelas com RLS habilitado:

- **studies** — id, nome, transportadora, notas, status (draft/imported/calculated/archived), settings (JSONB com configurações de TRT, ADM, redespacho, fallback)
- **carrier_rates** — tarifas por cidade/UF com ~30 colunas numéricas. Colunas exatas do arquivo: CIDADE_CORRIGIDA, UF, adv min, adv % nf, SEC-CAT, Pedágio FR 100KG, GRIS MIN, GRIS % NF, TAS, SEFAZ, EMEX MIN, EMEX % NF, TRT MIN, TRT % FR, TDE MIN, TDE % FR, TDE POR KG, TCE MIN, TDA MIN, TDA % FR, TSO %, TSO MIN, faixas 10–200, Frete kg ex 200kg. UNIQUE constraint em (study_id, UF, CIDADE_CORRIGIDA)
- **shipments_paid** — fretes pagos. Mapeamento do arquivo: Faturamento→valor_nf, GrsWeight→peso, city→CIDADE_CORRIGIDA, StateS→UF, CTe Data Lançamento→data, DocTotaCTe→valor_cobrado. shipment_id auto-gerado
- **icms_uf** — 27 UFs pré-populados com alíquotas editáveis
- **simulations** — resultados com todos os componentes intermediários para auditoria

### 1.2 Tela Home — Lista de Estudos
- Lista de estudos em cards com status visual, data de criação, nome da transportadora
- Ações: criar novo estudo, duplicar, arquivar
- Design limpo e profissional

### 1.3 Tela do Estudo — Tab Importações
- Formulário de configuração: nome, transportadora, notas, settings avançados
- **Upload Tabela Transportadora**: aceita CSV, colunas fixas (sem mapeamento), normaliza valores brasileiros (vírgula decimal, "R$", "%"), trim/uppercase/remove acentos em CIDADE_CORRIGIDA, detecta colunas opcionais (100/150/200). Resumo: linhas importadas, duplicatas, erros com número da linha e coluna
- **Upload Fretes Pagos**: valida as 6 colunas obrigatórias (Faturamento, GrsWeight, city, StateS, CTe Data Lançamento, DocTotaCTe), mesma normalização, gera shipment_id automático, preview dos dados
- **Editor ICMS por UF**: tabela editável inline pré-populada com 27 UFs
- Templates de exemplo para download
- Permitir deletar e re-importar

### 1.4 Tab Qualidade do Match
- Cards: total embarques, matched OK, não encontrados, ICMS faltante
- Tabela de cidades NOT_FOUND com contagem e total de valor_cobrado
- Exportar pendências em CSV
- Setting de fallback UF-only (desabilitado por padrão)

---

## Fase 2: Motor de Simulação

### 2.1 Edge Function `run_simulation`
Lógica idêntica ao Excel:
- **Faixa de peso**: determina base pelo peso (10/20/30/50/70/100/150/200/excedente)
- **Componentes**: adv, sec+tas, pedágio (ceil(peso/100)×valor), gris, sefaz, emex, tda, tso
- **Subtotal**: frete_peso = soma de todos componentes
- **ICMS/TRT/Redespacho**: adm_rodo → frete_c_icms (÷ 1-alíquota) → trt → frete_final
- **Comparação**: diferença, %dif, R$/kg hoje vs proposta
- Match status: OK, NOT_FOUND, MISSING_ICMS, INVALID_DATA
- Processamento em lotes de 5k, upsert

### 2.2 Tab Simulação
- Botão "Rodar Simulação" (bloqueado se imports faltando)
- Progresso visual durante processamento
- Resumo ao finalizar

---

## Fase 3: Dashboard + Exportações

### 3.1 Dashboard de Análise
- **Cards topo**: Total cobrado, Total proposto, Diferença (R$ e %), R$/kg comparativo
- **Tabela pivot por UF**: qtd NFs, cobrado, proposto, diferença, %dif, R$/kg — com linha Total Geral, ordenável
- **Filtros**: UF multi-select, faixa de peso, match_status
- **Drill-down**: UF → cidades → embarques individuais

### 3.2 Detalhe do Embarque (Auditoria)
- Dados pagos vs proposta lado a lado
- Tabela de breakdown: cada componente com valor calculado (frete_base, adv, sec_tas, pedágio, gris, sefaz, emex, tda, tso, frete_peso, adm_rodo, frete_c_icms, trt, redespacho)
- Visual claro e auditável

### 3.3 Exportações CSV
- Base Cruzada completa (simulations + shipments)
- Resumo por UF
- Ambos incluem match_status e erros

