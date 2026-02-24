import { useEffect, useState, useMemo, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatNumber } from "@/lib/csv-utils";
import {
  Download, TrendingUp, TrendingDown, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, ShieldAlert, BarChart3, Search,
  DollarSign, Scale, Percent, FileText, ArrowUpDown,
} from "lucide-react";

// === Constants ===

const STATE_CAPITALS: Record<string, string> = {
  AC: "RIO BRANCO", AL: "MACEIO", AM: "MANAUS", AP: "MACAPA",
  BA: "SALVADOR", CE: "FORTALEZA", DF: "BRASILIA", ES: "VITORIA",
  GO: "GOIANIA", MA: "SAO LUIS", MG: "BELO HORIZONTE", MS: "CAMPO GRANDE",
  MT: "CUIABA", PA: "BELEM", PB: "JOAO PESSOA", PE: "RECIFE",
  PI: "TERESINA", PR: "CURITIBA", RJ: "RIO DE JANEIRO", RN: "NATAL",
  RO: "PORTO VELHO", RR: "BOA VISTA", RS: "PORTO ALEGRE",
  SC: "FLORIANOPOLIS", SE: "ARACAJU", SP: "SAO PAULO", TO: "PALMAS",
};

const UF_MACRO: Record<string, string> = {
  AC: "Norte", AM: "Norte", AP: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste",
  PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MS: "Centro-Oeste", MT: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
  PR: "Sul", RS: "Sul", SC: "Sul",
};

const WEIGHT_BANDS = [
  { label: "≤10kg", min: 0, max: 10 },
  { label: "10-20kg", min: 10, max: 20 },
  { label: "20-30kg", min: 20, max: 30 },
  { label: "30-50kg", min: 30, max: 50 },
  { label: "50-70kg", min: 50, max: 70 },
  { label: "70-100kg", min: 70, max: 100 },
  { label: "100-150kg", min: 100, max: 150 },
  { label: "150-200kg", min: 150, max: 200 },
  { label: ">200kg", min: 200, max: Infinity },
];

const VARIATION_BANDS = [
  { label: "< -10%", min: -Infinity, max: -0.10, color: "bg-emerald-600" },
  { label: "-10% a -5%", min: -0.10, max: -0.05, color: "bg-emerald-400" },
  { label: "-5% a +5%", min: -0.05, max: 0.05, color: "bg-amber-400" },
  { label: "+5% a +10%", min: 0.05, max: 0.10, color: "bg-orange-400" },
  { label: "> +10%", min: 0.10, max: Infinity, color: "bg-red-500" },
];

// === Types ===

interface SimRow {
  match_status: string;
  valor_cobrado: number | null;
  frete_final: number | null;
  diferenca_valor: number | null;
  pct_dif: number | null;
  reais_kg_hj: number | null;
  reais_kg_proposta: number | null;
  frete_base_peso: number | null;
  adv: number | null;
  sec_tas: number | null;
  pedagio: number | null;
  gris: number | null;
  sefaz: number | null;
  emex: number | null;
  tda: number | null;
  tso: number | null;
  tx_redespacho: number | null;
  frete_peso: number | null;
  adm_rodo_tax: number | null;
  frete_c_icms: number | null;
  trt_calc: number | null;
  errors: string | null;
  shipment_uf: string;
  shipment_cidade: string;
  shipment_peso: number;
  shipment_valor_nf: number;
  shipment_data: string | null;
}

interface Props {
  studyId: string;
  simulationCount: number;
}

// === Helpers ===

function getCapInt(uf: string, cidade: string) {
  return STATE_CAPITALS[uf] === cidade ? "Capital" : "Interior";
}

function getMacro(uf: string) {
  return UF_MACRO[uf] ?? "Outro";
}

async function fetchAll(table: "simulations" | "shipments_paid", select: string, filters: Record<string, string>) {
  const all: any[] = [];
  let offset = 0;
  const batchSize = 1000;
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + batchSize - 1) as any;
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

// === Component ===

export function AnalysisDashboard({ studyId, simulationCount }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SimRow[]>([]);
  const [expandedUFs, setExpandedUFs] = useState<Set<string>>(new Set());
  const [filterUF, setFilterUF] = useState<string>("all");
  const [filterWeight, setFilterWeight] = useState<string>("all");
  const [drillCity, setDrillCity] = useState<{ uf: string; cidade: string } | null>(null);
  const [drillRow, setDrillRow] = useState<SimRow | null>(null);
  const [sortCol, setSortCol] = useState<string>("diferenca");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (simulationCount === 0) { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      const [sims, shipments] = await Promise.all([
        fetchAll("simulations",
          "match_status, valor_cobrado, frete_final, diferenca_valor, pct_dif, reais_kg_hj, reais_kg_proposta, frete_base_peso, adv, sec_tas, pedagio, gris, sefaz, emex, tda, tso, tx_redespacho, frete_peso, adm_rodo_tax, frete_c_icms, trt_calc, errors, shipment_row_id",
          { study_id: studyId }),
        fetchAll("shipments_paid",
          "id, uf, cidade_corrigida, peso, valor_nf, data",
          { study_id: studyId }),
      ]);
      const shipMap = new Map<string, { uf: string; cidade: string; peso: number; valor_nf: number; data: string | null }>();
      for (const s of shipments) shipMap.set(s.id, { uf: s.uf, cidade: s.cidade_corrigida, peso: s.peso, valor_nf: s.valor_nf, data: s.data });
      const merged: SimRow[] = sims.map((sim: any) => {
        const ship = shipMap.get(sim.shipment_row_id);
        return { ...sim, shipment_uf: ship?.uf ?? "", shipment_cidade: ship?.cidade ?? "", shipment_peso: ship?.peso ?? 0, shipment_valor_nf: ship?.valor_nf ?? 0, shipment_data: ship?.data ?? null };
      });
      setRows(merged);
      setLoading(false);
    };
    load();
  }, [studyId, simulationCount]);

  // Filtered rows
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (r.match_status === "NOT_FOUND") return false;
      if (filterUF !== "all" && r.shipment_uf !== filterUF) return false;
      if (filterWeight !== "all") {
        const band = WEIGHT_BANDS.find(b => b.label === filterWeight);
        if (band && (r.shipment_peso <= band.min || r.shipment_peso > band.max)) return false;
      }
      return true;
    });
  }, [rows, filterUF, filterWeight]);

  // === Computed data ===
  const stats = useMemo(() => {
    const ok = filtered;
    const all = rows;
    const totalCobrado = ok.reduce((s, r) => s + (r.valor_cobrado ?? 0), 0);
    const totalProposto = ok.reduce((s, r) => s + (r.frete_final ?? 0), 0);
    const totalDif = totalCobrado - totalProposto;
    const totalPeso = ok.reduce((s, r) => s + r.shipment_peso, 0);
    const qtdNF = ok.length;

    // Reliability
    const totalAll = all.length;
    const okCount = all.filter(r => r.match_status === "OK").length;
    const notFound = all.filter(r => r.match_status === "NOT_FOUND");
    const missingIcms = all.filter(r => r.match_status === "MISSING_ICMS");
    const notFoundValue = notFound.reduce((s, r) => s + (r.valor_cobrado ?? 0), 0);
    const notFoundPeso = notFound.reduce((s, r) => s + r.shipment_peso, 0);
    const missingIcmsValue = missingIcms.reduce((s, r) => s + (r.valor_cobrado ?? 0), 0);

    return {
      totalCobrado, totalProposto, totalDif, totalPeso, qtdNF,
      econMediaNF: qtdNF > 0 ? totalDif / qtdNF : 0,
      rkgPago: totalPeso > 0 ? totalCobrado / totalPeso : 0,
      rkgProposta: totalPeso > 0 ? totalProposto / totalPeso : 0,
      pctDifGeral: totalProposto > 0 ? (totalDif / totalProposto) * 100 : 0,
      // reliability
      totalAll,
      matchPct: totalAll > 0 ? (okCount / totalAll) * 100 : 0,
      notFoundCount: notFound.length,
      notFoundPct: totalAll > 0 ? (notFound.length / totalAll) * 100 : 0,
      notFoundValue, notFoundPeso,
      missingIcmsCount: missingIcms.length,
      missingIcmsPct: totalAll > 0 ? (missingIcms.length / totalAll) * 100 : 0,
      missingIcmsValue,
    };
  }, [filtered, rows]);

  // UF pivot
  const ufPivot = useMemo(() => {
    const map = new Map<string, { uf: string; qtd: number; cobrado: number; proposto: number; dif: number; peso: number; wins: number }>();
    for (const r of filtered) {
      const uf = r.shipment_uf;
      let agg = map.get(uf);
      if (!agg) agg = { uf, qtd: 0, cobrado: 0, proposto: 0, dif: 0, peso: 0, wins: 0 };
      agg.qtd++;
      agg.cobrado += r.valor_cobrado ?? 0;
      agg.proposto += r.frete_final ?? 0;
      agg.dif += (r.valor_cobrado ?? 0) - (r.frete_final ?? 0);
      agg.peso += r.shipment_peso;
      if ((r.valor_cobrado ?? 0) > (r.frete_final ?? 0)) agg.wins++;
      map.set(uf, agg);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const av = (a as any)[sortCol] ?? 0;
      const bv = (b as any)[sortCol] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [filtered, sortCol, sortDir]);

  // Top gains / losses by city
  const cityRanking = useMemo(() => {
    const map = new Map<string, { cidade: string; uf: string; qtd: number; cobrado: number; proposto: number; dif: number; peso: number }>();
    for (const r of filtered) {
      const key = `${r.shipment_uf}|${r.shipment_cidade}`;
      let agg = map.get(key);
      if (!agg) agg = { cidade: r.shipment_cidade, uf: r.shipment_uf, qtd: 0, cobrado: 0, proposto: 0, dif: 0, peso: 0 };
      agg.qtd++;
      agg.cobrado += r.valor_cobrado ?? 0;
      agg.proposto += r.frete_final ?? 0;
      agg.dif += (r.valor_cobrado ?? 0) - (r.frete_final ?? 0);
      agg.peso += r.shipment_peso;
      map.set(key, agg);
    }
    const all = Array.from(map.values());
    const topGains = [...all].sort((a, b) => b.dif - a.dif).slice(0, 10);
    const topLosses = [...all].sort((a, b) => a.dif - b.dif).slice(0, 10);
    return { topGains, topLosses };
  }, [filtered]);

  // Variation distribution
  const variationDist = useMemo(() => {
    const counts = VARIATION_BANDS.map(() => 0);
    for (const r of filtered) {
      const pct = r.pct_dif ?? 0;
      // pct_dif is (cobrado - proposto) / proposto stored as decimal fraction
      // But in our simulation it was stored as (cobrado - final) / final... let's recalculate
      const proposto = r.frete_final ?? 0;
      const cobrado = r.valor_cobrado ?? 0;
      const variation = proposto > 0 ? (cobrado - proposto) / proposto : 0;
      for (let i = 0; i < VARIATION_BANDS.length; i++) {
        if (variation > VARIATION_BANDS[i].min && variation <= VARIATION_BANDS[i].max) {
          counts[i]++;
          break;
        }
      }
    }
    const total = filtered.length || 1;
    return VARIATION_BANDS.map((b, i) => ({ ...b, count: counts[i], pct: (counts[i] / total) * 100 }));
  }, [filtered]);

  // Drill-down city data
  const drillData = useMemo(() => {
    if (!drillCity) return [];
    return filtered.filter(r => r.shipment_uf === drillCity.uf && r.shipment_cidade === drillCity.cidade);
  }, [filtered, drillCity]);

  // Available UFs
  const availableUFs = useMemo(() => {
    const set = new Set(rows.filter(r => r.match_status !== "NOT_FOUND").map(r => r.shipment_uf));
    return Array.from(set).sort();
  }, [rows]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const toggleUF = (uf: string) => {
    setExpandedUFs(prev => {
      const next = new Set(prev);
      next.has(uf) ? next.delete(uf) : next.add(uf);
      return next;
    });
  };

  // Get subrows for expanded UF (Capital/Interior + macro region)
  const getUFSubRows = (uf: string) => {
    const ufRows = filtered.filter(r => r.shipment_uf === uf);
    const map = new Map<string, { regiao: string; qtd: number; cobrado: number; proposto: number; dif: number; peso: number; wins: number }>();
    for (const r of ufRows) {
      const regiao = getCapInt(r.shipment_uf, r.shipment_cidade);
      let agg = map.get(regiao);
      if (!agg) agg = { regiao, qtd: 0, cobrado: 0, proposto: 0, dif: 0, peso: 0, wins: 0 };
      agg.qtd++;
      agg.cobrado += r.valor_cobrado ?? 0;
      agg.proposto += r.frete_final ?? 0;
      agg.dif += (r.valor_cobrado ?? 0) - (r.frete_final ?? 0);
      agg.peso += r.shipment_peso;
      if ((r.valor_cobrado ?? 0) > (r.frete_final ?? 0)) agg.wins++;
      map.set(regiao, agg);
    }
    return Array.from(map.values()).sort((a, b) => a.regiao.localeCompare(b.regiao));
  };

  // Macro region pivot
  const macroPivot = useMemo(() => {
    const map = new Map<string, { regiao: string; qtd: number; cobrado: number; proposto: number; dif: number; peso: number }>();
    for (const r of filtered) {
      const regiao = getMacro(r.shipment_uf);
      let agg = map.get(regiao);
      if (!agg) agg = { regiao, qtd: 0, cobrado: 0, proposto: 0, dif: 0, peso: 0 };
      agg.qtd++;
      agg.cobrado += r.valor_cobrado ?? 0;
      agg.proposto += r.frete_final ?? 0;
      agg.dif += (r.valor_cobrado ?? 0) - (r.frete_final ?? 0);
      agg.peso += r.shipment_peso;
      map.set(regiao, agg);
    }
    return Array.from(map.values()).sort((a, b) => b.dif - a.dif);
  }, [filtered]);

  const exportCSV = () => {
    const lines = ["UF;Região Macro;Capital/Interior;Qtd NF;Valor Cobrado;Valor Proposta;Diferença;% Dif;R$/kg Hoje;R$/kg Proposta;Peso Médio;Win Rate"];
    for (const uf of ufPivot) {
      const sub = getUFSubRows(uf.uf);
      for (const s of sub) {
        const pct = s.proposto > 0 ? ((s.dif / s.proposto) * 100).toFixed(1) : "0";
        const rkgH = s.peso > 0 ? (s.cobrado / s.peso).toFixed(2) : "0";
        const rkgP = s.peso > 0 ? (s.proposto / s.peso).toFixed(2) : "0";
        const pm = s.qtd > 0 ? (s.peso / s.qtd).toFixed(1) : "0";
        const wr = s.qtd > 0 ? ((s.wins / s.qtd) * 100).toFixed(0) : "0";
        lines.push(`${uf.uf};${getMacro(uf.uf)};${s.regiao};${s.qtd};${s.cobrado.toFixed(2)};${s.proposto.toFixed(2)};${s.dif.toFixed(2)};${pct}%;${rkgH};${rkgP};${pm};${wr}%`);
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "analise_completa.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (simulationCount === 0) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground"><p className="text-lg">Rode a simulação primeiro para ver a análise.</p></CardContent></Card>;
  }
  if (loading) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground"><div className="flex items-center justify-center gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Carregando análise...</div></CardContent></Card>;
  }

  const difColor = (v: number) => v > 0 ? "text-emerald-600" : v < 0 ? "text-destructive" : "text-muted-foreground";
  const difBg = (v: number) => v > 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : v < 0 ? "bg-red-50 dark:bg-red-950/30" : "";

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterUF} onValueChange={setFilterUF}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="UF" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas UFs</SelectItem>
            {availableUFs.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterWeight} onValueChange={setFilterWeight}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Faixa de peso" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os pesos</SelectItem>
            {WEIGHT_BANDS.map(b => <SelectItem key={b.label} value={b.label}>{b.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="ml-auto gap-1" onClick={exportCSV}>
          <Download className="h-4 w-4" /> Exportar
        </Button>
      </div>

      {/* BLOCO 1 — Resultado Geral */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <DollarSign className="h-4 w-4" /> Resultado Geral
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard label="Total Pago" value={formatBRL(stats.totalCobrado)} />
          <MetricCard label="Total Proposta" value={formatBRL(stats.totalProposto)} />
          <MetricCard
            label="Diferença Total"
            value={formatBRL(stats.totalDif)}
            sub={`${stats.pctDifGeral >= 0 ? "+" : ""}${stats.pctDifGeral.toFixed(1)}%`}
            color={difColor(stats.totalDif)}
            icon={stats.totalDif > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          />
          <MetricCard label="Economia Média/NF" value={formatBRL(stats.econMediaNF)} color={difColor(stats.econMediaNF)} />
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-4">
              <p className="text-xs text-muted-foreground">R$/kg</p>
              <div className="mt-1 flex items-baseline gap-3">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Pago</p>
                  <p className="text-base font-bold">R$ {stats.rkgPago.toFixed(2)}</p>
                </div>
                <span className="text-muted-foreground">→</span>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Proposta</p>
                  <p className="text-base font-bold">R$ {stats.rkgProposta.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* BLOCO 2 — Confiabilidade */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> Confiabilidade do Estudo
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className={stats.matchPct >= 90 ? "border-emerald-200 dark:border-emerald-800" : "border-amber-200 dark:border-amber-800"}>
            <CardContent className="flex items-center gap-3 p-4">
              <CheckCircle2 className={`h-8 w-8 ${stats.matchPct >= 90 ? "text-emerald-600" : "text-amber-500"}`} />
              <div>
                <p className="text-xs text-muted-foreground">Match Cidade+UF</p>
                <p className="text-xl font-bold">{stats.matchPct.toFixed(1)}%</p>
              </div>
            </CardContent>
          </Card>
          <Card className={stats.notFoundCount > 0 ? "border-amber-200 dark:border-amber-800" : ""}>
            <CardContent className="flex items-center gap-3 p-4">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground">NOT_FOUND</p>
                <p className="text-xl font-bold">{stats.notFoundCount.toLocaleString("pt-BR")}</p>
                <p className="text-[10px] text-muted-foreground">{stats.notFoundPct.toFixed(1)}% — {formatBRL(stats.notFoundValue)} ({formatNumber(stats.notFoundPeso, 0)} kg)</p>
              </div>
            </CardContent>
          </Card>
          <Card className={stats.missingIcmsCount > 0 ? "border-orange-200 dark:border-orange-800" : ""}>
            <CardContent className="flex items-center gap-3 p-4">
              <FileText className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-xs text-muted-foreground">MISSING_ICMS</p>
                <p className="text-xl font-bold">{stats.missingIcmsCount.toLocaleString("pt-BR")}</p>
                <p className="text-[10px] text-muted-foreground">{stats.missingIcmsPct.toFixed(1)}% — {formatBRL(stats.missingIcmsValue)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Scale className="h-8 w-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Volume Analisado</p>
                <p className="text-xl font-bold">{stats.qtdNF.toLocaleString("pt-BR")} NFs</p>
                <p className="text-[10px] text-muted-foreground">{formatNumber(stats.totalPeso, 0)} kg total</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* BLOCO 3 — Tabela por UF + Macro Região */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <BarChart3 className="h-4 w-4" /> Análise por UF / Região
        </h2>
        <Tabs defaultValue="uf">
          <TabsList className="mb-3">
            <TabsTrigger value="uf">Por UF</TabsTrigger>
            <TabsTrigger value="macro">Por Macro Região</TabsTrigger>
          </TabsList>

          <TabsContent value="uf">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead className="cursor-pointer" onClick={() => toggleSort("uf")}>UF <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                        <TableHead>Macro</TableHead>
                        <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("qtd")}>Qtd NF</TableHead>
                        <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("cobrado")}>Pago</TableHead>
                        <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("proposto")}>Proposta</TableHead>
                        <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("diferenca")}>Diferença <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                        <TableHead className="text-right">% Dif</TableHead>
                        <TableHead className="text-right">R$/kg Hoje</TableHead>
                        <TableHead className="text-right">R$/kg Prop.</TableHead>
                        <TableHead className="text-right">Peso Médio</TableHead>
                        <TableHead className="text-right">Win Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ufPivot.map(uf => {
                        const pct = uf.proposto > 0 ? (uf.dif / uf.proposto) * 100 : 0;
                        const rkgH = uf.peso > 0 ? uf.cobrado / uf.peso : 0;
                        const rkgP = uf.peso > 0 ? uf.proposto / uf.peso : 0;
                        const pm = uf.qtd > 0 ? uf.peso / uf.qtd : 0;
                        const wr = uf.qtd > 0 ? (uf.wins / uf.qtd) * 100 : 0;
                        const expanded = expandedUFs.has(uf.uf);
                        const subRows = expanded ? getUFSubRows(uf.uf) : [];

                        return (
                          <Fragment key={uf.uf}>
                            <TableRow className="cursor-pointer font-medium hover:bg-muted/50" onClick={() => toggleUF(uf.uf)}>
                              <TableCell>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                              <TableCell className="font-bold">{uf.uf}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[10px]">{getMacro(uf.uf)}</Badge></TableCell>
                              <TableCell className="text-right">{uf.qtd.toLocaleString("pt-BR")}</TableCell>
                              <TableCell className="text-right">{formatBRL(uf.cobrado)}</TableCell>
                              <TableCell className="text-right">{formatBRL(uf.proposto)}</TableCell>
                              <TableCell className={`text-right font-bold ${difColor(uf.dif)}`}>{formatBRL(uf.dif)}</TableCell>
                              <TableCell className={`text-right ${difColor(uf.dif)}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</TableCell>
                              <TableCell className="text-right">R$ {rkgH.toFixed(2)}</TableCell>
                              <TableCell className="text-right">R$ {rkgP.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{formatNumber(pm, 1)}</TableCell>
                              <TableCell className="text-right"><Badge variant={wr >= 60 ? "default" : "secondary"} className="text-[10px]">{wr.toFixed(0)}%</Badge></TableCell>
                            </TableRow>
                            {subRows.map(s => {
                              const sp = s.proposto > 0 ? (s.dif / s.proposto) * 100 : 0;
                              const srkgH = s.peso > 0 ? s.cobrado / s.peso : 0;
                              const srkgP = s.peso > 0 ? s.proposto / s.peso : 0;
                              const spm = s.qtd > 0 ? s.peso / s.qtd : 0;
                              const swr = s.qtd > 0 ? (s.wins / s.qtd) * 100 : 0;
                              return (
                                <TableRow key={`${uf.uf}-${s.regiao}`} className="bg-muted/20 text-xs">
                                  <TableCell />
                                  <TableCell className="pl-8 text-muted-foreground">{uf.uf}</TableCell>
                                  <TableCell><Badge variant="outline" className="text-[10px]">{s.regiao}</Badge></TableCell>
                                  <TableCell className="text-right">{s.qtd.toLocaleString("pt-BR")}</TableCell>
                                  <TableCell className="text-right">{formatBRL(s.cobrado)}</TableCell>
                                  <TableCell className="text-right">{formatBRL(s.proposto)}</TableCell>
                                  <TableCell className={`text-right font-semibold ${difColor(s.dif)}`}>{formatBRL(s.dif)}</TableCell>
                                  <TableCell className={`text-right ${difColor(s.dif)}`}>{sp >= 0 ? "+" : ""}{sp.toFixed(1)}%</TableCell>
                                  <TableCell className="text-right">R$ {srkgH.toFixed(2)}</TableCell>
                                  <TableCell className="text-right">R$ {srkgP.toFixed(2)}</TableCell>
                                  <TableCell className="text-right">{formatNumber(spm, 1)}</TableCell>
                                  <TableCell className="text-right">{swr.toFixed(0)}%</TableCell>
                                </TableRow>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                      {/* Total */}
                      <TableRow className="border-t-2 bg-muted/30 font-bold">
                        <TableCell />
                        <TableCell>TOTAL</TableCell>
                        <TableCell />
                        <TableCell className="text-right">{stats.qtdNF.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right">{formatBRL(stats.totalCobrado)}</TableCell>
                        <TableCell className="text-right">{formatBRL(stats.totalProposto)}</TableCell>
                        <TableCell className={`text-right ${difColor(stats.totalDif)}`}>{formatBRL(stats.totalDif)}</TableCell>
                        <TableCell className={`text-right ${difColor(stats.totalDif)}`}>{stats.pctDifGeral >= 0 ? "+" : ""}{stats.pctDifGeral.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">R$ {stats.rkgPago.toFixed(2)}</TableCell>
                        <TableCell className="text-right">R$ {stats.rkgProposta.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{formatNumber(stats.qtdNF > 0 ? stats.totalPeso / stats.qtdNF : 0, 1)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="macro">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Macro Região</TableHead>
                      <TableHead className="text-right">Qtd NF</TableHead>
                      <TableHead className="text-right">Pago</TableHead>
                      <TableHead className="text-right">Proposta</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                      <TableHead className="text-right">% Dif</TableHead>
                      <TableHead className="text-right">R$/kg Hoje</TableHead>
                      <TableHead className="text-right">R$/kg Prop.</TableHead>
                      <TableHead className="text-right">Peso Médio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {macroPivot.map(m => {
                      const pct = m.proposto > 0 ? (m.dif / m.proposto) * 100 : 0;
                      return (
                        <TableRow key={m.regiao}>
                          <TableCell className="font-semibold">{m.regiao}</TableCell>
                          <TableCell className="text-right">{m.qtd.toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-right">{formatBRL(m.cobrado)}</TableCell>
                          <TableCell className="text-right">{formatBRL(m.proposto)}</TableCell>
                          <TableCell className={`text-right font-bold ${difColor(m.dif)}`}>{formatBRL(m.dif)}</TableCell>
                          <TableCell className={`text-right ${difColor(m.dif)}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</TableCell>
                          <TableCell className="text-right">R$ {(m.peso > 0 ? m.cobrado / m.peso : 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">R$ {(m.peso > 0 ? m.proposto / m.peso : 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{formatNumber(m.qtd > 0 ? m.peso / m.qtd : 0, 1)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* BLOCO 4 — Top Ganhos / Perdas */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Search className="h-4 w-4" /> Onde Ganha e Onde Dói
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4 text-emerald-600" /> Top 10 Maiores Ganhos (R$)</CardTitle>
              <CardDescription>Cidades onde a proposta é mais barata que o pago</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cidade</TableHead>
                    <TableHead>UF</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Ganho (R$)</TableHead>
                    <TableHead className="text-right">% Dif</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cityRanking.topGains.map((c, i) => (
                    <TableRow key={i} className="cursor-pointer hover:bg-muted/50" onClick={() => setDrillCity({ uf: c.uf, cidade: c.cidade })}>
                      <TableCell className="text-xs">{c.cidade}</TableCell>
                      <TableCell>{c.uf}</TableCell>
                      <TableCell className="text-right">{c.qtd}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">{formatBRL(c.dif)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{c.proposto > 0 ? `+${((c.dif / c.proposto) * 100).toFixed(1)}%` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><TrendingDown className="h-4 w-4 text-destructive" /> Top 10 Maiores Perdas (R$)</CardTitle>
              <CardDescription>Cidades onde a proposta é mais cara que o pago</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cidade</TableHead>
                    <TableHead>UF</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Perda (R$)</TableHead>
                    <TableHead className="text-right">% Dif</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cityRanking.topLosses.map((c, i) => (
                    <TableRow key={i} className="cursor-pointer hover:bg-muted/50" onClick={() => setDrillCity({ uf: c.uf, cidade: c.cidade })}>
                      <TableCell className="text-xs">{c.cidade}</TableCell>
                      <TableCell>{c.uf}</TableCell>
                      <TableCell className="text-right">{c.qtd}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{formatBRL(c.dif)}</TableCell>
                      <TableCell className="text-right text-destructive">{c.proposto > 0 ? `${((c.dif / c.proposto) * 100).toFixed(1)}%` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* BLOCO 5 — Distribuição do Impacto */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Percent className="h-4 w-4" /> Distribuição do Impacto
        </h2>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-3">
              {variationDist.map((band, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-28 text-right text-xs text-muted-foreground">{band.label}</span>
                  <div className="flex-1">
                    <div className="relative h-7 overflow-hidden rounded bg-muted">
                      <div className={`absolute inset-y-0 left-0 rounded ${band.color} transition-all`} style={{ width: `${Math.max(band.pct, 0.5)}%` }} />
                      <div className="absolute inset-0 flex items-center px-2">
                        <span className="text-xs font-semibold text-foreground drop-shadow-sm">
                          {band.count.toLocaleString("pt-BR")} ({band.pct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Variação = (Pago − Proposta) / Proposta. Positivo = proposta mais barata. Negativo = proposta mais cara.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* BLOCO 6 — Drill-down Dialog */}
      <Dialog open={!!drillCity} onOpenChange={(o) => { if (!o) { setDrillCity(null); setDrillRow(null); } }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {drillCity?.cidade} / {drillCity?.uf} — {drillData.length} NFs
            </DialogTitle>
          </DialogHeader>

          {drillRow ? (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setDrillRow(null)}>← Voltar à lista</Button>
              <h3 className="font-semibold">Breakdown do Cálculo</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ["Frete Base Peso", drillRow.frete_base_peso],
                  ["ADV", drillRow.adv],
                  ["SEC + TAS", drillRow.sec_tas],
                  ["Pedágio", drillRow.pedagio],
                  ["GRIS", drillRow.gris],
                  ["SEFAZ", drillRow.sefaz],
                  ["EMEX", drillRow.emex],
                  ["TDA", drillRow.tda],
                  ["TSO", drillRow.tso],
                  ["Tx Redespacho", drillRow.tx_redespacho],
                  ["Frete Peso (subtotal)", drillRow.frete_peso],
                  ["ADM+Rodo+Tax", drillRow.adm_rodo_tax],
                  ["Frete c/ ICMS", drillRow.frete_c_icms],
                  ["TRT", drillRow.trt_calc],
                  ["Frete Final", drillRow.frete_final],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between rounded bg-muted/50 px-3 py-1.5">
                    <span className="text-muted-foreground">{label as string}</span>
                    <span className="font-mono font-semibold">{formatBRL(val as number)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between rounded border p-3">
                <span>Valor Cobrado</span>
                <span className="font-bold">{formatBRL(drillRow.valor_cobrado)}</span>
              </div>
              <div className={`flex justify-between rounded border p-3 ${difBg((drillRow.valor_cobrado ?? 0) - (drillRow.frete_final ?? 0))}`}>
                <span>Diferença</span>
                <span className={`font-bold ${difColor((drillRow.valor_cobrado ?? 0) - (drillRow.frete_final ?? 0))}`}>
                  {formatBRL((drillRow.valor_cobrado ?? 0) - (drillRow.frete_final ?? 0))}
                </span>
              </div>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Peso</TableHead>
                    <TableHead className="text-right">Valor NF</TableHead>
                    <TableHead className="text-right">Pago</TableHead>
                    <TableHead className="text-right">Proposta</TableHead>
                    <TableHead className="text-right">Dif (R$)</TableHead>
                    <TableHead className="text-right">% Dif</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillData.slice(0, 200).map((r, i) => {
                    const d = (r.valor_cobrado ?? 0) - (r.frete_final ?? 0);
                    const p = (r.frete_final ?? 0) > 0 ? (d / (r.frete_final ?? 1)) * 100 : 0;
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-right">{formatNumber(r.shipment_peso, 1)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.shipment_valor_nf)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.valor_cobrado)}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.frete_final)}</TableCell>
                        <TableCell className={`text-right font-semibold ${difColor(d)}`}>{formatBRL(d)}</TableCell>
                        <TableCell className={`text-right ${difColor(d)}`}>{p >= 0 ? "+" : ""}{p.toFixed(1)}%</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setDrillRow(r)}>Ver cálculo</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {drillData.length > 200 && <p className="p-3 text-center text-xs text-muted-foreground">Mostrando 200 de {drillData.length}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// === Subcomponents ===

function MetricCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className={`mt-1 flex items-center gap-1 ${color ?? ""}`}>
          {icon}
          <p className="text-lg font-bold">{value}</p>
        </div>
        {sub && <p className={`text-xs ${color ?? "text-muted-foreground"}`}>{sub}</p>}
      </CardContent>
    </Card>
  );
}
