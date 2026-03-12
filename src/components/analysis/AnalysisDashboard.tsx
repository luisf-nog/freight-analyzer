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
  DollarSign, Scale, Percent, FileText, ArrowUpDown, Clock,
  MapPin, Weight, Target, Activity, Eye, EyeOff, Send,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, LineChart, Line, ComposedChart, Area,
  ScatterChart, Scatter, ZAxis, Cell,
} from "recharts";

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

async function fetchAll(table: string, select: string, filters: Record<string, string>) {
  const all: any[] = [];
  let offset = 0;
  const batchSize = 1000;
  // Ensure 'id' is in the select for stable ordering (remove from results later if not requested)
  const needsId = !select.includes("id");
  const actualSelect = needsId ? `id, ${select}` : select;
  while (true) {
    let q = (supabase.from(table as any) as any).select(actualSelect).order("id" as any).range(offset, offset + batchSize - 1);
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }
  if (needsId) {
    return all.map(({ id, ...rest }) => rest);
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
  const [drillSortCol, setDrillSortCol] = useState<string>("shipment_peso");
  const [drillSortDir, setDrillSortDir] = useState<"asc" | "desc">("desc");
  const [hideSensitive, setHideSensitive] = useState(false);
  const [showCarrierView, setShowCarrierView] = useState(false);
  const [expandedMacros, setExpandedMacros] = useState<Set<string>>(new Set());
  const [expandedCarrierUFs, setExpandedCarrierUFs] = useState<Set<string>>(new Set());
  const [deadlinesRealized, setDeadlinesRealized] = useState<Array<{ uf: string; cidade_corrigida: string; prazo_dias: number }>>([]);
  const [deadlinesProposed, setDeadlinesProposed] = useState<Array<{ uf: string; cidade_corrigida: string; prazo_dias: number }>>([]);

  useEffect(() => {
    if (simulationCount === 0) { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      const [sims, shipments, realized, proposed] = await Promise.all([
        fetchAll("simulations",
          "match_status, valor_cobrado, frete_final, diferenca_valor, pct_dif, reais_kg_hj, reais_kg_proposta, frete_base_peso, adv, sec_tas, pedagio, gris, sefaz, emex, tda, tso, tx_redespacho, frete_peso, adm_rodo_tax, frete_c_icms, trt_calc, errors, shipment_row_id",
          { study_id: studyId }),
        fetchAll("shipments_paid",
          "id, uf, cidade_corrigida, peso, valor_nf, data",
          { study_id: studyId }),
        fetchAll("deadlines_realized", "uf, cidade_corrigida, prazo_dias", { study_id: studyId }),
        fetchAll("deadlines_proposed", "uf, cidade_corrigida, prazo_dias", { study_id: studyId }),
      ]);
      const shipMap = new Map<string, { uf: string; cidade: string; peso: number; valor_nf: number; data: string | null }>();
      for (const s of shipments) shipMap.set(s.id, { uf: s.uf, cidade: s.cidade_corrigida, peso: s.peso, valor_nf: s.valor_nf, data: s.data });
      const merged: SimRow[] = sims.map((sim: any) => {
        const ship = shipMap.get(sim.shipment_row_id);
        return { ...sim, shipment_uf: ship?.uf ?? "", shipment_cidade: ship?.cidade ?? "", shipment_peso: ship?.peso ?? 0, shipment_valor_nf: ship?.valor_nf ?? 0, shipment_data: ship?.data ?? null };
      });

      setRows(merged);
      setDeadlinesRealized(realized as any);
      setDeadlinesProposed(proposed as any);
      setLoading(false);
    };
    load();
  }, [studyId, simulationCount]);

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

  const stats = useMemo(() => {
    const ok = filtered;
    const all = rows;
    const totalCobrado = ok.reduce((s, r) => s + (r.valor_cobrado ?? 0), 0);
    const totalProposto = ok.reduce((s, r) => s + (r.frete_final ?? 0), 0);
    const totalDif = totalCobrado - totalProposto;
    const totalPeso = ok.reduce((s, r) => s + r.shipment_peso, 0);
    const qtdNF = ok.length;
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
      totalAll, matchPct: totalAll > 0 ? (okCount / totalAll) * 100 : 0,
      notFoundCount: notFound.length, notFoundPct: totalAll > 0 ? (notFound.length / totalAll) * 100 : 0,
      notFoundValue, notFoundPeso,
      missingIcmsCount: missingIcms.length, missingIcmsPct: totalAll > 0 ? (missingIcms.length / totalAll) * 100 : 0,
      missingIcmsValue,
    };
  }, [filtered, rows]);

  const ufPivot = useMemo(() => {
    const map = new Map<string, { uf: string; qtd: number; cobrado: number; proposto: number; dif: number; peso: number; wins: number }>();
    for (const r of filtered) {
      const uf = r.shipment_uf;
      let agg = map.get(uf);
      if (!agg) agg = { uf, qtd: 0, cobrado: 0, proposto: 0, dif: 0, peso: 0, wins: 0 };
      agg.qtd++; agg.cobrado += r.valor_cobrado ?? 0; agg.proposto += r.frete_final ?? 0;
      agg.dif += (r.valor_cobrado ?? 0) - (r.frete_final ?? 0); agg.peso += r.shipment_peso;
      if ((r.valor_cobrado ?? 0) > (r.frete_final ?? 0)) agg.wins++;
      map.set(uf, agg);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const av = (a as any)[sortCol] ?? 0; const bv = (b as any)[sortCol] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [filtered, sortCol, sortDir]);

  const cityRanking = useMemo(() => {
    const map = new Map<string, { cidade: string; uf: string; qtd: number; cobrado: number; proposto: number; dif: number; peso: number }>();
    for (const r of filtered) {
      const key = `${r.shipment_uf}|${r.shipment_cidade}`;
      let agg = map.get(key);
      if (!agg) agg = { cidade: r.shipment_cidade, uf: r.shipment_uf, qtd: 0, cobrado: 0, proposto: 0, dif: 0, peso: 0 };
      agg.qtd++; agg.cobrado += r.valor_cobrado ?? 0; agg.proposto += r.frete_final ?? 0;
      agg.dif += (r.valor_cobrado ?? 0) - (r.frete_final ?? 0); agg.peso += r.shipment_peso;
      map.set(key, agg);
    }
    const all = Array.from(map.values());
    return { topGains: [...all].sort((a, b) => b.dif - a.dif).slice(0, 10), topLosses: [...all].sort((a, b) => a.dif - b.dif).slice(0, 10) };
  }, [filtered]);

  const variationDist = useMemo(() => {
    const counts = VARIATION_BANDS.map(() => 0);
    for (const r of filtered) {
      const proposto = r.frete_final ?? 0; const cobrado = r.valor_cobrado ?? 0;
      const variation = proposto > 0 ? (cobrado - proposto) / proposto : 0;
      for (let i = 0; i < VARIATION_BANDS.length; i++) {
        if (variation > VARIATION_BANDS[i].min && variation <= VARIATION_BANDS[i].max) { counts[i]++; break; }
      }
    }
    const total = filtered.length || 1;
    return VARIATION_BANDS.map((b, i) => ({ ...b, count: counts[i], pct: (counts[i] / total) * 100 }));
  }, [filtered]);

  const drillData = useMemo(() => {
    if (!drillCity) return [];
    const data = filtered.filter(r => r.shipment_uf === drillCity.uf && r.shipment_cidade === drillCity.cidade);
    return [...data].sort((a, b) => {
      const av = (a as any)[drillSortCol] ?? 0;
      const bv = (b as any)[drillSortCol] ?? 0;
      return drillSortDir === "asc" ? av - bv : bv - av;
    });
  }, [filtered, drillCity, drillSortCol, drillSortDir]);

  const availableUFs = useMemo(() => {
    const set = new Set(rows.filter(r => r.match_status !== "NOT_FOUND").map(r => r.shipment_uf));
    return Array.from(set).sort();
  }, [rows]);

  // Chart data: bar chart cobrado vs proposto by UF
  const ufChartData = useMemo(() => {
    return ufPivot.map(uf => ({
      uf: uf.uf,
      cobrado: Math.round(uf.cobrado),
      proposto: Math.round(uf.proposto),
      diferenca: Math.round(uf.dif),
      pctDif: uf.proposto > 0 ? ((uf.dif / uf.proposto) * 100) : 0,
    })).sort((a, b) => b.cobrado - a.cobrado);
  }, [ufPivot]);

  // Pareto data: cities where proposal is MORE EXPENSIVE (losses), sorted by biggest loss
  const paretoData = useMemo(() => {
    const cityMap = new Map<string, { label: string; cobrado: number; proposto: number; perda: number }>();
    for (const r of filtered) {
      const key = `${r.shipment_cidade}/${r.shipment_uf}`;
      const agg = cityMap.get(key) ?? { label: key, cobrado: 0, proposto: 0, perda: 0 };
      agg.cobrado += r.valor_cobrado ?? 0;
      agg.proposto += r.frete_final ?? 0;
      agg.perda += Math.max(0, (r.frete_final ?? 0) - (r.valor_cobrado ?? 0));
      cityMap.set(key, agg);
    }
    // Only cities where proposta > cobrado (net loss)
    const lossCities = Array.from(cityMap.values())
      .filter(c => c.proposto > c.cobrado)
      .sort((a, b) => b.perda - a.perda);
    const grandTotal = lossCities.reduce((s, c) => s + c.perda, 0);
    let cumulative = 0;
    return lossCities.slice(0, 30).map((c, i) => {
      cumulative += c.perda;
      return {
        cidade: c.label,
        perda: Math.round(c.perda),
        pctAcumulado: grandTotal > 0 ? (cumulative / grandTotal) * 100 : 0,
        rank: i + 1,
      };
    });
  }, [filtered]);

  // Scatter data: peso vs frete por embarque (sample up to 500)
  const scatterData = useMemo(() => {
    const sampled = filtered.length > 500
      ? filtered.filter((_, i) => i % Math.ceil(filtered.length / 500) === 0)
      : filtered;
    return sampled.map(r => ({
      peso: r.shipment_peso,
      cobrado: r.valor_cobrado ?? 0,
      proposta: r.frete_final ?? 0,
      dif: (r.valor_cobrado ?? 0) - (r.frete_final ?? 0),
    }));
  }, [filtered]);

  const COST_COMPONENTS = [
    { key: "frete_base_peso", label: "Frete Base Peso" },
    { key: "adv", label: "ADV" },
    { key: "sec_tas", label: "SEC + TAS" },
    { key: "pedagio", label: "Pedágio" },
    { key: "gris", label: "GRIS" },
    { key: "sefaz", label: "SEFAZ" },
    { key: "emex", label: "EMEX" },
    { key: "tda", label: "TDA" },
    { key: "tso", label: "TSO" },
    { key: "tx_redespacho", label: "Tx Redespacho" },
    { key: "trt_calc", label: "TRT" },
  ] as const;

  const componentBreakdown = useMemo(() => {
    const totals = COST_COMPONENTS.map(c => ({
      ...c,
      total: filtered.reduce((s, r) => s + ((r as any)[c.key] ?? 0), 0),
    }));
    const grandTotal = totals.reduce((s, c) => s + c.total, 0);
    return totals
      .map(c => ({ ...c, pct: grandTotal > 0 ? (c.total / grandTotal) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const toggleDrillSort = (col: string) => {
    if (drillSortCol === col) setDrillSortDir(d => d === "asc" ? "desc" : "asc");
    else { setDrillSortCol(col); setDrillSortDir("desc"); }
  };

  const toggleUF = (uf: string) => {
    setExpandedUFs(prev => {
      const next = new Set(prev);
      next.has(uf) ? next.delete(uf) : next.add(uf);
      return next;
    });
  };

  const getUFSubRows = (uf: string) => {
    const ufRows = filtered.filter(r => r.shipment_uf === uf);
    const map = new Map<string, { regiao: string; qtd: number; cobrado: number; proposto: number; dif: number; peso: number; wins: number }>();
    for (const r of ufRows) {
      const regiao = getCapInt(r.shipment_uf, r.shipment_cidade);
      let agg = map.get(regiao);
      if (!agg) agg = { regiao, qtd: 0, cobrado: 0, proposto: 0, dif: 0, peso: 0, wins: 0 };
      agg.qtd++; agg.cobrado += r.valor_cobrado ?? 0; agg.proposto += r.frete_final ?? 0;
      agg.dif += (r.valor_cobrado ?? 0) - (r.frete_final ?? 0); agg.peso += r.shipment_peso;
      if ((r.valor_cobrado ?? 0) > (r.frete_final ?? 0)) agg.wins++;
      map.set(regiao, agg);
    }
    return Array.from(map.values()).sort((a, b) => a.regiao.localeCompare(b.regiao));
  };

  const macroPivot = useMemo(() => {
    const map = new Map<string, { regiao: string; qtd: number; cobrado: number; proposto: number; dif: number; peso: number }>();
    for (const r of filtered) {
      const regiao = getMacro(r.shipment_uf);
      let agg = map.get(regiao);
      if (!agg) agg = { regiao, qtd: 0, cobrado: 0, proposto: 0, dif: 0, peso: 0 };
      agg.qtd++; agg.cobrado += r.valor_cobrado ?? 0; agg.proposto += r.frete_final ?? 0;
      agg.dif += (r.valor_cobrado ?? 0) - (r.frete_final ?? 0); agg.peso += r.shipment_peso;
      map.set(regiao, agg);
    }
    return Array.from(map.values()).sort((a, b) => b.dif - a.dif);
  }, [filtered]);

  const weightPivot = useMemo(() => {
    return WEIGHT_BANDS.map(band => {
      const bandRows = filtered.filter(r => r.shipment_peso > band.min && r.shipment_peso <= band.max);
      const qtd = bandRows.length;
      const cobrado = bandRows.reduce((s, r) => s + (r.valor_cobrado ?? 0), 0);
      const proposto = bandRows.reduce((s, r) => s + (r.frete_final ?? 0), 0);
      const dif = cobrado - proposto;
      const peso = bandRows.reduce((s, r) => s + r.shipment_peso, 0);
      const wins = bandRows.filter(r => (r.valor_cobrado ?? 0) > (r.frete_final ?? 0)).length;
      return { label: band.label, qtd, cobrado, proposto, dif, peso, wins };
    }).filter(b => b.qtd > 0);
  }, [filtered]);

  const deadlineByUF = useMemo(() => {
    const realizedByUF = new Map<string, { total: number; count: number }>();
    for (const d of deadlinesRealized) {
      const agg = realizedByUF.get(d.uf) ?? { total: 0, count: 0 };
      agg.total += d.prazo_dias; agg.count++;
      realizedByUF.set(d.uf, agg);
    }
    const proposedByUF = new Map<string, { total: number; count: number }>();
    for (const d of deadlinesProposed) {
      const agg = proposedByUF.get(d.uf) ?? { total: 0, count: 0 };
      agg.total += d.prazo_dias; agg.count++;
      proposedByUF.set(d.uf, agg);
    }
    return { realizedByUF, proposedByUF };
  }, [deadlinesRealized, deadlinesProposed]);

  const hasDeadlines = deadlinesRealized.length > 0 || deadlinesProposed.length > 0;

  const getDeadlineUF = (uf: string) => {
    const r = deadlineByUF.realizedByUF.get(uf);
    const p = deadlineByUF.proposedByUF.get(uf);
    return { realizado: r ? r.total / r.count : null, proposto: p ? p.total / p.count : null };
  };

  const getDeadlineMacro = (regiao: string) => {
    const ufsInRegiao = Object.entries(UF_MACRO).filter(([, m]) => m === regiao).map(([uf]) => uf);
    let rTotal = 0, rCount = 0, pTotal = 0, pCount = 0;
    for (const uf of ufsInRegiao) {
      const r = deadlineByUF.realizedByUF.get(uf);
      if (r) { rTotal += r.total; rCount += r.count; }
      const p = deadlineByUF.proposedByUF.get(uf);
      if (p) { pTotal += p.total; pCount += p.count; }
    }
    return { realizado: rCount > 0 ? rTotal / rCount : null, proposto: pCount > 0 ? pTotal / pCount : null };
  };

  const getDeadlineCapInt = (uf: string, regiao: string) => {
    const capital = STATE_CAPITALS[uf];
    const isCapital = regiao === "Capital";
    const filterFn = (d: { uf: string; cidade_corrigida: string }) =>
      d.uf === uf && (isCapital ? d.cidade_corrigida === capital : d.cidade_corrigida !== capital);
    const rRows = deadlinesRealized.filter(filterFn);
    const pRows = deadlinesProposed.filter(filterFn);
    return {
      realizado: rRows.length > 0 ? rRows.reduce((s, d) => s + d.prazo_dias, 0) / rRows.length : null,
      proposto: pRows.length > 0 ? pRows.reduce((s, d) => s + d.prazo_dias, 0) / pRows.length : null,
    };
  };

  const deadlineStats = useMemo(() => {
    if (!hasDeadlines) return null;
    const rTotal = deadlinesRealized.reduce((s, d) => s + d.prazo_dias, 0);
    const rCount = deadlinesRealized.length;
    const pTotal = deadlinesProposed.reduce((s, d) => s + d.prazo_dias, 0);
    const pCount = deadlinesProposed.length;
    const avgReal = rCount > 0 ? rTotal / rCount : null;
    const avgProp = pCount > 0 ? pTotal / pCount : null;
    let faster = 0, slower = 0, equal = 0;
    const realMap = new Map<string, number>();
    for (const d of deadlinesRealized) realMap.set(`${d.uf}|${d.cidade_corrigida}`, d.prazo_dias);
    for (const d of deadlinesProposed) {
      const r = realMap.get(`${d.uf}|${d.cidade_corrigida}`);
      if (r !== undefined) {
        if (d.prazo_dias < r) faster++;
        else if (d.prazo_dias > r) slower++;
        else equal++;
      }
    }
    return { avgReal, avgProp, cidadesReal: rCount, cidadesProp: pCount, faster, slower, equal };
  }, [deadlinesRealized, deadlinesProposed, hasDeadlines]);

  const carrierPivot = useMemo(() => {
    // Group by macro → UF → Capital/Interior, only where proposta > cobrado (loss)
    type CapInt = { regiao: string; qtd: number; cobrado: number; proposto: number; dif: number };
    type UFNode = { uf: string; qtd: number; cobrado: number; proposto: number; dif: number; capint: Map<string, CapInt> };
    type MacroNode = { regiao: string; qtd: number; cobrado: number; proposto: number; dif: number; ufs: Map<string, UFNode> };

    // Build deadline lookup by UF+CapInt
    const getCarrierDeadline = (uf: string, regiao: string) => {
      const capital = STATE_CAPITALS[uf];
      const isCapital = regiao === "Capital";
      const filterFn = (d: { uf: string; cidade_corrigida: string }) =>
        d.uf === uf && (isCapital ? d.cidade_corrigida === capital : d.cidade_corrigida !== capital);
      const rRows = deadlinesRealized.filter(filterFn);
      const pRows = deadlinesProposed.filter(filterFn);
      return {
        realizado: rRows.length > 0 ? rRows.reduce((s, d) => s + d.prazo_dias, 0) / rRows.length : null,
        proposto: pRows.length > 0 ? pRows.reduce((s, d) => s + d.prazo_dias, 0) / pRows.length : null,
      };
    };
    const macroMap = new Map<string, MacroNode>();
    for (const r of filtered) {
      const macro = getMacro(r.shipment_uf);
      const ci = getCapInt(r.shipment_uf, r.shipment_cidade);
      let mNode = macroMap.get(macro);
      if (!mNode) mNode = { regiao: macro, qtd: 0, cobrado: 0, proposto: 0, dif: 0, ufs: new Map() };
      let uNode = mNode.ufs.get(r.shipment_uf);
      if (!uNode) uNode = { uf: r.shipment_uf, qtd: 0, cobrado: 0, proposto: 0, dif: 0, capint: new Map() };
      let cNode = uNode.capint.get(ci);
      if (!cNode) cNode = { regiao: ci, qtd: 0, cobrado: 0, proposto: 0, dif: 0 };
      const cobrado = r.valor_cobrado ?? 0;
      const proposto = r.frete_final ?? 0;
      const d = cobrado - proposto;
      cNode.qtd++; cNode.cobrado += cobrado; cNode.proposto += proposto; cNode.dif += d;
      uNode.capint.set(ci, cNode);
      uNode.qtd++; uNode.cobrado += cobrado; uNode.proposto += proposto; uNode.dif += d;
      mNode.ufs.set(r.shipment_uf, uNode);
      mNode.qtd++; mNode.cobrado += cobrado; mNode.proposto += proposto; mNode.dif += d;
      macroMap.set(macro, mNode);
    }
    // Filter: only keep capint rows where dif < 0 (proposta mais cara), then prune empty UFs/macros
    type CapIntResult = { regiao: string; qtd: number; pctDif: number; prazoReal: number | null; prazoProp: number | null };
    type UFResult = { uf: string; qtd: number; pctDif: number; prazoReal: number | null; prazoProp: number | null; capint: CapIntResult[] };
    type MacroResult = { regiao: string; qtd: number; pctDif: number; prazoReal: number | null; prazoProp: number | null; ufs: UFResult[] };
    const result: MacroResult[] = [];
    for (const m of macroMap.values()) {
      const ufs: UFResult[] = [];
      for (const u of m.ufs.values()) {
        const caps: CapIntResult[] = Array.from(u.capint.values())
          .filter(c => c.dif < 0)
          .map(c => {
            const dl = getCarrierDeadline(u.uf, c.regiao);
            return { regiao: c.regiao, qtd: c.qtd, pctDif: c.proposto > 0 ? (c.dif / c.proposto) * 100 : 0, prazoReal: dl.realizado, prazoProp: dl.proposto };
          })
          .sort((a, b) => a.pctDif - b.pctDif);
        if (caps.length === 0) continue;
        const lossQtd = caps.reduce((s, c) => s + c.qtd, 0);
        const lossCobrado = Array.from(u.capint.values()).filter(c => c.dif < 0).reduce((s, c) => s + c.cobrado, 0);
        const lossProposto = Array.from(u.capint.values()).filter(c => c.dif < 0).reduce((s, c) => s + c.proposto, 0);
        const lossDif = lossCobrado - lossProposto;
        // UF deadline: average across all deadlines for this UF
        const dlUF = getDeadlineUF(u.uf);
        ufs.push({ uf: u.uf, qtd: lossQtd, pctDif: lossProposto > 0 ? (lossDif / lossProposto) * 100 : 0, prazoReal: dlUF.realizado, prazoProp: dlUF.proposto, capint: caps });
      }
      if (ufs.length === 0) continue;
      ufs.sort((a, b) => a.pctDif - b.pctDif);
      const macroLossQtd = ufs.reduce((s, u) => s + u.qtd, 0);
      const mLossCobrado = Array.from(m.ufs.values()).flatMap(u => Array.from(u.capint.values())).filter(c => c.dif < 0).reduce((s, c) => s + c.cobrado, 0);
      const mLossProposto = Array.from(m.ufs.values()).flatMap(u => Array.from(u.capint.values())).filter(c => c.dif < 0).reduce((s, c) => s + c.proposto, 0);
      const mLossDif = mLossCobrado - mLossProposto;
      const dlMacro = getDeadlineMacro(m.regiao);
      result.push({ regiao: m.regiao, qtd: macroLossQtd, pctDif: mLossProposto > 0 ? (mLossDif / mLossProposto) * 100 : 0, prazoReal: dlMacro.realizado, prazoProp: dlMacro.proposto, ufs });
    }
    return result.sort((a, b) => a.pctDif - b.pctDif);
  }, [filtered, deadlinesRealized, deadlinesProposed]);

  const toggleMacro = (macro: string) => {
    setExpandedMacros(prev => {
      const next = new Set(prev);
      next.has(macro) ? next.delete(macro) : next.add(macro);
      return next;
    });
  };

  const toggleCarrierUF = (uf: string) => {
    setExpandedCarrierUFs(prev => {
      const next = new Set(prev);
      next.has(uf) ? next.delete(uf) : next.add(uf);
      return next;
    });
  };

  const expandAllCarrier = () => {
    const allMacros = new Set(carrierPivot.map(m => m.regiao));
    const allUFs = new Set(carrierPivot.flatMap(m => m.ufs.map(u => u.uf)));
    setExpandedMacros(allMacros);
    setExpandedCarrierUFs(allUFs);
  };

  const collapseAllCarrier = () => {
    setExpandedMacros(new Set());
    setExpandedCarrierUFs(new Set());
  };

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
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold text-foreground">Nenhuma simulação encontrada</p>
          <p className="mt-1 text-sm text-muted-foreground">Rode a simulação primeiro para ver a análise completa.</p>
        </CardContent>
      </Card>
    );
  }
  if (loading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground">Carregando análise...</p>
        </CardContent>
      </Card>
    );
  }

  const difColor = (v: number) => v > 0 ? "text-emerald-600" : v < 0 ? "text-destructive" : "text-muted-foreground";
  const blurClass = hideSensitive ? "blur-sm select-none" : "";
  const difBg = (v: number) => v > 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : v < 0 ? "bg-red-50 dark:bg-red-950/30" : "";

  return (
    <div className="space-y-8">
      {/* Filters Bar */}
      <Card className="border-none bg-gradient-to-r from-primary/5 via-transparent to-accent/5 shadow-none">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Target className="h-4 w-4" />
            Filtros:
          </div>
          <Select value={filterUF} onValueChange={setFilterUF}>
            <SelectTrigger className="w-[150px] bg-card"><SelectValue placeholder="UF" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas UFs</SelectItem>
              {availableUFs.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterWeight} onValueChange={setFilterWeight}>
            <SelectTrigger className="w-[170px] bg-card"><SelectValue placeholder="Faixa de peso" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os pesos</SelectItem>
              {WEIGHT_BANDS.map(b => <SelectItem key={b.label} value={b.label}>{b.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setHideSensitive(h => !h)}>
            {hideSensitive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {hideSensitive ? "Mostrar valores" : "Ocultar valores"}
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
          <Button size="sm" className="ml-auto gap-2" onClick={() => setShowCarrierView(true)}>
            <Send className="h-4 w-4" /> Enviar à Transportadora
          </Button>
        </CardContent>
      </Card>

      {/* ═══ BLOCO 1 — Hero KPIs ═══ */}
      <section>
        <SectionHeader icon={<DollarSign className="h-4 w-4" />} title="Resultado Geral" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <HeroCard
            label="Total Pago (Atual)"
            value={formatBRL(stats.totalCobrado)}
            sublabel={`${stats.qtdNF.toLocaleString("pt-BR")} NFs`}
            iconBg="bg-muted"
            icon={<DollarSign className="h-5 w-5 text-muted-foreground" />}
            blurValue={hideSensitive}
          />
          <HeroCard
            label="Total Proposta"
            value={formatBRL(stats.totalProposto)}
            sublabel={`R$/kg ${stats.rkgProposta.toFixed(2)}`}
            iconBg="bg-primary/10"
            icon={<DollarSign className="h-5 w-5 text-primary" />}
            blurValue={hideSensitive}
          />
          <HeroCard
            label="Economia Total"
            value={formatBRL(stats.totalDif)}
            sublabel={`${stats.pctDifGeral >= 0 ? "+" : ""}${stats.pctDifGeral.toFixed(1)}%`}
            valueColor={difColor(stats.totalDif)}
            iconBg={stats.totalDif > 0 ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-red-100 dark:bg-red-900/30"}
            icon={stats.totalDif > 0 ? <TrendingUp className="h-5 w-5 text-emerald-600" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
            highlight
          />
          <HeroCard
            label="Economia Média / NF"
            value={formatBRL(stats.econMediaNF)}
            valueColor={difColor(stats.econMediaNF)}
            iconBg="bg-accent/10"
            icon={<Scale className="h-5 w-5 text-accent" />}
          />
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
            <CardContent className="relative flex flex-col items-center justify-center p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">R$ / kg</p>
              <div className="mt-3 flex items-center gap-4">
                <div className="text-center">
                  <p className="text-[11px] text-muted-foreground">Pago</p>
                  <p className={`text-xl font-bold tabular-nums ${blurClass}`}>R$ {stats.rkgPago.toFixed(2)}</p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <span className="text-sm text-muted-foreground">→</span>
                </div>
                <div className="text-center">
                  <p className="text-[11px] text-muted-foreground">Proposta</p>
                  <p className={`text-xl font-bold tabular-nums text-primary ${blurClass}`}>R$ {stats.rkgProposta.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ═══ BLOCO Prazo ═══ */}
      {deadlineStats && (
        <section>
          <SectionHeader icon={<Clock className="h-4 w-4" />} title="Comparativo de Prazos" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <HeroCard
              label="Prazo Médio Hoje"
              value={deadlineStats.avgReal !== null ? deadlineStats.avgReal.toFixed(1) + " dias" : "—"}
              sublabel={`${deadlineStats.cidadesReal.toLocaleString("pt-BR")} cidades`}
              iconBg="bg-muted"
              icon={<Clock className="h-5 w-5 text-muted-foreground" />}
              blurValue={hideSensitive}
            />
            <HeroCard
              label="Prazo Médio Proposta"
              value={deadlineStats.avgProp !== null ? deadlineStats.avgProp.toFixed(1) + " dias" : "—"}
              sublabel={`${deadlineStats.cidadesProp.toLocaleString("pt-BR")} cidades`}
              iconBg="bg-primary/10"
              icon={<Clock className="h-5 w-5 text-primary" />}
            />
            {(() => {
              if (deadlineStats.avgReal === null || deadlineStats.avgProp === null) return (
                <HeroCard label="Diferença Média" value="—" iconBg="bg-muted" icon={<Clock className="h-5 w-5 text-muted-foreground" />} />
              );
              const d = deadlineStats.avgReal - deadlineStats.avgProp;
              return (
                <HeroCard
                  label="Diferença Média"
                  value={`${d > 0 ? "-" : "+"}${Math.abs(d).toFixed(1)} dias`}
                  sublabel={d > 0 ? "Proposta mais rápida" : d < 0 ? "Proposta mais lenta" : "Mesmo prazo"}
                  valueColor={d > 0 ? "text-emerald-600" : d < 0 ? "text-destructive" : ""}
                  iconBg={d > 0 ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-red-100 dark:bg-red-900/30"}
                  icon={d > 0 ? <TrendingUp className="h-5 w-5 text-emerald-600" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
                  highlight
                />
              );
            })()}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent" />
              <CardContent className="relative flex flex-col items-center justify-center p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cidades Comparadas</p>
                <div className="mt-3 flex items-center gap-5">
                  <div className="text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 mx-auto mb-1">
                      <span className="text-lg font-bold text-emerald-600">{deadlineStats.faster}</span>
                    </div>
                    <p className="text-[10px] font-medium text-emerald-600">Mais rápido</p>
                  </div>
                  <div className="text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mx-auto mb-1">
                      <span className="text-lg font-bold text-muted-foreground">{deadlineStats.equal}</span>
                    </div>
                    <p className="text-[10px] font-medium text-muted-foreground">Igual</p>
                  </div>
                  <div className="text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 mx-auto mb-1">
                      <span className="text-lg font-bold text-destructive">{deadlineStats.slower}</span>
                    </div>
                    <p className="text-[10px] font-medium text-destructive">Mais lento</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* ═══ BLOCO 2 — Tabela por UF / Macro Região / Peso ═══ */}
      <section>
        <SectionHeader icon={<MapPin className="h-4 w-4" />} title="Análise Geográfica e por Peso" />
        <Tabs defaultValue="uf">
          <TabsList className="mb-4 h-10">
            <TabsTrigger value="uf" className="gap-1.5"><MapPin className="h-3.5 w-3.5" /> Por UF</TabsTrigger>
            <TabsTrigger value="macro" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Macro Região</TabsTrigger>
            <TabsTrigger value="peso" className="gap-1.5"><Weight className="h-3.5 w-3.5" /> Faixa de Peso</TabsTrigger>
          </TabsList>

          <TabsContent value="uf">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="w-8" />
                        <TableHead className="cursor-pointer font-semibold" onClick={() => toggleSort("uf")}>UF <ArrowUpDown className="inline h-3 w-3 opacity-50" /></TableHead>
                        <TableHead className="font-semibold">Macro</TableHead>
                        <TableHead className="cursor-pointer text-right font-semibold" onClick={() => toggleSort("qtd")}>Qtd NF</TableHead>
                        <TableHead className="cursor-pointer text-right font-semibold" onClick={() => toggleSort("cobrado")}>Pago</TableHead>
                        <TableHead className="cursor-pointer text-right font-semibold" onClick={() => toggleSort("proposto")}>Proposta</TableHead>
                        <TableHead className="cursor-pointer text-right font-semibold" onClick={() => toggleSort("diferenca")}>Diferença <ArrowUpDown className="inline h-3 w-3 opacity-50" /></TableHead>
                        <TableHead className="text-right font-semibold">% Dif</TableHead>
                        <TableHead className="text-right font-semibold">R$/kg Hoje</TableHead>
                        <TableHead className="text-right font-semibold">R$/kg Prop.</TableHead>
                        <TableHead className="text-right font-semibold">Peso Médio</TableHead>
                        <TableHead className="text-right font-semibold">Win Rate</TableHead>
                        {hasDeadlines && <TableHead className="text-right font-semibold">Prazo Real.</TableHead>}
                        {hasDeadlines && <TableHead className="text-right font-semibold">Prazo Prop.</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ufPivot.map(uf => {
                        const pct = uf.proposto > 0 ? (uf.dif / uf.proposto) * 100 : 0;
                        const rkgH = uf.peso > 0 ? uf.cobrado / uf.peso : 0;
                        const rkgP = uf.peso > 0 ? uf.proposto / uf.peso : 0;
                        const pm = uf.qtd > 0 ? uf.peso / uf.qtd : 0;
                        const wr = uf.qtd > 0 ? (uf.wins / uf.qtd) * 100 : 0;
                        const dl = hasDeadlines ? getDeadlineUF(uf.uf) : null;
                        const expanded = expandedUFs.has(uf.uf);
                        const subRows = expanded ? getUFSubRows(uf.uf) : [];

                        return (
                          <Fragment key={uf.uf}>
                            <TableRow className="cursor-pointer font-medium transition-colors hover:bg-muted/50" onClick={() => toggleUF(uf.uf)}>
                              <TableCell className="w-8">{expanded ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}</TableCell>
                              <TableCell className="font-bold text-foreground">{uf.uf}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[10px] font-medium">{getMacro(uf.uf)}</Badge></TableCell>
                              <TableCell className="text-right tabular-nums">{uf.qtd.toLocaleString("pt-BR")}</TableCell>
                              <TableCell className={`text-right tabular-nums ${blurClass}`}>{formatBRL(uf.cobrado)}</TableCell>
                              <TableCell className={`text-right tabular-nums ${blurClass}`}>{formatBRL(uf.proposto)}</TableCell>
                              <TableCell className={`text-right font-bold tabular-nums ${difColor(uf.dif)}`}>{formatBRL(uf.dif)}</TableCell>
                              <TableCell className={`text-right tabular-nums ${difColor(uf.dif)}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</TableCell>
                              <TableCell className={`text-right tabular-nums ${blurClass}`}>R$ {rkgH.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums">R$ {rkgP.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatNumber(pm, 1)}</TableCell>
                              <TableCell className={`text-right ${blurClass}`}><Badge variant={wr >= 60 ? "default" : "secondary"} className="text-[10px]">{wr.toFixed(0)}%</Badge></TableCell>
                              {dl && <TableCell className={`text-right tabular-nums ${blurClass}`}>{dl.realizado !== null ? dl.realizado.toFixed(1) + "d" : "—"}</TableCell>}
                              {dl && <TableCell className={`text-right tabular-nums ${dl.realizado !== null && dl.proposto !== null ? (dl.proposto < dl.realizado ? "text-emerald-600" : dl.proposto > dl.realizado ? "text-destructive" : "") : ""}`}>{dl.proposto !== null ? dl.proposto.toFixed(1) + "d" : "—"}</TableCell>}
                            </TableRow>
                            {subRows.map(s => {
                              const sp = s.proposto > 0 ? (s.dif / s.proposto) * 100 : 0;
                              const srkgH = s.peso > 0 ? s.cobrado / s.peso : 0;
                              const srkgP = s.peso > 0 ? s.proposto / s.peso : 0;
                              const spm = s.qtd > 0 ? s.peso / s.qtd : 0;
                              const swr = s.qtd > 0 ? (s.wins / s.qtd) * 100 : 0;
                              const sdl = hasDeadlines ? getDeadlineCapInt(uf.uf, s.regiao) : null;
                              return (
                                <TableRow key={`${uf.uf}-${s.regiao}`} className="bg-muted/10 text-xs">
                                  <TableCell />
                                  <TableCell className="pl-8 text-muted-foreground">{uf.uf}</TableCell>
                                  <TableCell><Badge variant="outline" className="border-dashed text-[10px]">{s.regiao}</Badge></TableCell>
                                  <TableCell className="text-right tabular-nums">{s.qtd.toLocaleString("pt-BR")}</TableCell>
                                  <TableCell className={`text-right tabular-nums ${blurClass}`}>{formatBRL(s.cobrado)}</TableCell>
                                  <TableCell className={`text-right tabular-nums ${blurClass}`}>{formatBRL(s.proposto)}</TableCell>
                                  <TableCell className={`text-right font-semibold tabular-nums ${difColor(s.dif)}`}>{formatBRL(s.dif)}</TableCell>
                                  <TableCell className={`text-right tabular-nums ${difColor(s.dif)}`}>{sp >= 0 ? "+" : ""}{sp.toFixed(1)}%</TableCell>
                                  <TableCell className={`text-right tabular-nums ${blurClass}`}>R$ {srkgH.toFixed(2)}</TableCell>
                                  <TableCell className="text-right tabular-nums">R$ {srkgP.toFixed(2)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatNumber(spm, 1)}</TableCell>
                                  <TableCell className={`text-right tabular-nums ${blurClass}`}>{swr.toFixed(0)}%</TableCell>
                                  {sdl && <TableCell className={`text-right tabular-nums ${blurClass}`}>{sdl.realizado !== null ? sdl.realizado.toFixed(1) + "d" : "—"}</TableCell>}
                                  {sdl && <TableCell className={`text-right tabular-nums ${sdl.realizado !== null && sdl.proposto !== null ? (sdl.proposto < sdl.realizado ? "text-emerald-600" : sdl.proposto > sdl.realizado ? "text-destructive" : "") : ""}`}>{sdl.proposto !== null ? sdl.proposto.toFixed(1) + "d" : "—"}</TableCell>}
                                </TableRow>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                      {/* Total */}
                      <TableRow className="border-t-2 border-primary/20 bg-muted/40 font-bold">
                        <TableCell />
                        <TableCell className="text-primary">TOTAL</TableCell>
                        <TableCell />
                        <TableCell className="text-right tabular-nums">{stats.qtdNF.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(stats.totalCobrado)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(stats.totalProposto)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${difColor(stats.totalDif)}`}>{formatBRL(stats.totalDif)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${difColor(stats.totalDif)}`}>{stats.pctDifGeral >= 0 ? "+" : ""}{stats.pctDifGeral.toFixed(1)}%</TableCell>
                        <TableCell className="text-right tabular-nums">R$ {stats.rkgPago.toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">R$ {stats.rkgProposta.toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(stats.qtdNF > 0 ? stats.totalPeso / stats.qtdNF : 0, 1)}</TableCell>
                        <TableCell />
                        {hasDeadlines && <TableCell className="text-right tabular-nums">{deadlineStats?.avgReal !== null ? deadlineStats?.avgReal?.toFixed(1) + "d" : "—"}</TableCell>}
                        {hasDeadlines && <TableCell className="text-right tabular-nums">{deadlineStats?.avgProp !== null ? deadlineStats?.avgProp?.toFixed(1) + "d" : "—"}</TableCell>}
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
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-semibold">Macro Região</TableHead>
                      <TableHead className="text-right font-semibold">Qtd NF</TableHead>
                      <TableHead className="text-right font-semibold">Pago</TableHead>
                      <TableHead className="text-right font-semibold">Proposta</TableHead>
                      <TableHead className="text-right font-semibold">Diferença</TableHead>
                      <TableHead className="text-right font-semibold">% Dif</TableHead>
                      <TableHead className="text-right font-semibold">R$/kg Hoje</TableHead>
                      <TableHead className="text-right font-semibold">R$/kg Prop.</TableHead>
                      <TableHead className="text-right font-semibold">Peso Médio</TableHead>
                      {hasDeadlines && <TableHead className="text-right font-semibold">Prazo Real.</TableHead>}
                      {hasDeadlines && <TableHead className="text-right font-semibold">Prazo Prop.</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {macroPivot.map(m => {
                      const pct = m.proposto > 0 ? (m.dif / m.proposto) * 100 : 0;
                      const dl = hasDeadlines ? getDeadlineMacro(m.regiao) : null;
                      return (
                        <TableRow key={m.regiao}>
                          <TableCell className="font-semibold">{m.regiao}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.qtd.toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatBRL(m.cobrado)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatBRL(m.proposto)}</TableCell>
                          <TableCell className={`text-right font-bold tabular-nums ${difColor(m.dif)}`}>{formatBRL(m.dif)}</TableCell>
                          <TableCell className={`text-right tabular-nums ${difColor(m.dif)}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</TableCell>
                          <TableCell className="text-right tabular-nums">R$ {(m.peso > 0 ? m.cobrado / m.peso : 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums">R$ {(m.peso > 0 ? m.proposto / m.peso : 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(m.qtd > 0 ? m.peso / m.qtd : 0, 1)}</TableCell>
                          {dl && <TableCell className="text-right tabular-nums">{dl.realizado !== null ? dl.realizado.toFixed(1) + "d" : "—"}</TableCell>}
                          {dl && <TableCell className={`text-right tabular-nums ${dl.realizado !== null && dl.proposto !== null ? (dl.proposto < dl.realizado ? "text-emerald-600" : dl.proposto > dl.realizado ? "text-destructive" : "") : ""}`}>{dl.proposto !== null ? dl.proposto.toFixed(1) + "d" : "—"}</TableCell>}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="peso">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-semibold">Faixa de Peso</TableHead>
                        <TableHead className="text-right font-semibold">Qtd NF</TableHead>
                        <TableHead className="text-right font-semibold">Pago</TableHead>
                        <TableHead className="text-right font-semibold">Proposta</TableHead>
                        <TableHead className="text-right font-semibold">Diferença</TableHead>
                        <TableHead className="text-right font-semibold">% Dif</TableHead>
                        <TableHead className="text-right font-semibold">R$/kg Hoje</TableHead>
                        <TableHead className="text-right font-semibold">R$/kg Prop.</TableHead>
                        <TableHead className="text-right font-semibold">Peso Médio</TableHead>
                        <TableHead className="text-right font-semibold">Win Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {weightPivot.map(b => {
                        const pct = b.proposto > 0 ? (b.dif / b.proposto) * 100 : 0;
                        const rkgH = b.peso > 0 ? b.cobrado / b.peso : 0;
                        const rkgP = b.peso > 0 ? b.proposto / b.peso : 0;
                        const pm = b.qtd > 0 ? b.peso / b.qtd : 0;
                        const wr = b.qtd > 0 ? (b.wins / b.qtd) * 100 : 0;
                        return (
                          <TableRow key={b.label}>
                            <TableCell className="font-semibold">{b.label}</TableCell>
                            <TableCell className="text-right tabular-nums">{b.qtd.toLocaleString("pt-BR")}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatBRL(b.cobrado)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatBRL(b.proposto)}</TableCell>
                            <TableCell className={`text-right font-bold tabular-nums ${difColor(b.dif)}`}>{formatBRL(b.dif)}</TableCell>
                            <TableCell className={`text-right tabular-nums ${difColor(b.dif)}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</TableCell>
                            <TableCell className="text-right tabular-nums">R$ {rkgH.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums">R$ {rkgP.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(pm, 1)}</TableCell>
                            <TableCell className="text-right"><Badge variant={wr >= 60 ? "default" : "secondary"} className="text-[10px]">{wr.toFixed(0)}%</Badge></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

      {/* ═══ BLOCO 4 — Top Ganhos / Perdas ═══ */}
      <section>
        <SectionHeader icon={<Search className="h-4 w-4" />} title="Onde Ganha e Onde Dói" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-300" />
            <CardHeader className="pb-2 pt-5">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                Top 10 Maiores Ganhos
              </CardTitle>
              <CardDescription>Cidades onde a proposta é mais barata</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="font-semibold">Cidade</TableHead>
                    <TableHead className="font-semibold">UF</TableHead>
                    <TableHead className="text-right font-semibold">Qtd</TableHead>
                    <TableHead className="text-right font-semibold">Ganho (R$)</TableHead>
                    <TableHead className="text-right font-semibold">% Dif</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cityRanking.topGains.map((c, i) => (
                    <TableRow key={i} className="cursor-pointer transition-colors hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10" onClick={() => setDrillCity({ uf: c.uf, cidade: c.cidade })}>
                      <TableCell className="text-xs font-medium">{c.cidade}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{c.uf}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{c.qtd}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-emerald-600">{formatBRL(c.dif)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{c.proposto > 0 ? `+${((c.dif / c.proposto) * 100).toFixed(1)}%` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 to-red-300" />
            <CardHeader className="pb-2 pt-5">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                </div>
                Top 10 Maiores Perdas
              </CardTitle>
              <CardDescription>Cidades onde a proposta é mais cara</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="font-semibold">Cidade</TableHead>
                    <TableHead className="font-semibold">UF</TableHead>
                    <TableHead className="text-right font-semibold">Qtd</TableHead>
                    <TableHead className="text-right font-semibold">Perda (R$)</TableHead>
                    <TableHead className="text-right font-semibold">% Dif</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cityRanking.topLosses.map((c, i) => (
                    <TableRow key={i} className="cursor-pointer transition-colors hover:bg-red-50/50 dark:hover:bg-red-900/10" onClick={() => setDrillCity({ uf: c.uf, cidade: c.cidade })}>
                      <TableCell className="text-xs font-medium">{c.cidade}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{c.uf}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{c.qtd}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-destructive">{formatBRL(c.dif)}</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">{c.proposto > 0 ? `${((c.dif / c.proposto) * 100).toFixed(1)}%` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ═══ BLOCO — Composição de Custos ═══ */}
      <section>
        <SectionHeader icon={<Percent className="h-4 w-4" />} title="Composição de Custos da Proposta" />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Qual taxa pesa mais no frete?</CardTitle>
            <CardDescription>Soma de cada componente sobre todos os embarques filtrados, ordenado pelo maior impacto</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold">Componente</TableHead>
                  <TableHead className="text-right font-semibold">Total (R$)</TableHead>
                  <TableHead className="text-right font-semibold">% do Frete</TableHead>
                  <TableHead className="font-semibold">Participação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {componentBreakdown.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell className="font-semibold">{c.label}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatBRL(c.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.pct.toFixed(1)}%</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/50">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${Math.max(c.pct, 0.5)}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-primary/20 bg-muted/40 font-bold">
                  <TableCell className="text-primary">TOTAL</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatBRL(componentBreakdown.reduce((s, c) => s + c.total, 0))}</TableCell>
                  <TableCell className="text-right tabular-nums">100%</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* ═══ BLOCO 5 — Distribuição do Impacto ═══ */}
      <section>
        <SectionHeader icon={<Percent className="h-4 w-4" />} title="Distribuição do Impacto" />
        <Card>
          <CardContent className="p-6">
            <div className="space-y-3">
              {variationDist.map((band, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="w-28 text-right text-xs font-medium text-muted-foreground">{band.label}</span>
                  <div className="flex-1">
                    <div className="relative h-8 overflow-hidden rounded-lg bg-muted/50">
                      <div className={`absolute inset-y-0 left-0 rounded-lg ${band.color} transition-all duration-500`} style={{ width: `${Math.max(band.pct, 0.5)}%` }} />
                      <div className="absolute inset-0 flex items-center px-3">
                        <span className="text-xs font-semibold text-foreground drop-shadow-sm">
                          {band.count.toLocaleString("pt-BR")} ({band.pct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              💡 Variação = (Pago − Proposta) / Proposta. Positivo = proposta mais barata. Negativo = proposta mais cara.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ═══ BLOCO 6 — Gráficos Visuais ═══ */}
      <section>
        <SectionHeader icon={<BarChart3 className="h-4 w-4" />} title="Visão Gráfica" />
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Bar Chart: Cobrado vs Proposto por UF */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Pago vs Proposta por UF</CardTitle>
              <CardDescription>Comparativo de valores em R$ por estado</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ufChartData} margin={{ top: 5, right: 10, left: 10, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="uf" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" interval={0} />
                    <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <RechartsTooltip
                      formatter={(value: number) => formatBRL(value)}
                      labelFormatter={(label: string) => `UF: ${label}`}
                      contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="cobrado" name="Pago" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="proposto" name="Proposta" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Scatter: Peso vs Frete */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Peso × Frete por Embarque</CardTitle>
              <CardDescription>Cada ponto é um embarque — verde = economia, vermelho = perda</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="peso" name="Peso (kg)" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}kg`} />
                    <YAxis dataKey="cobrado" name="Pago (R$)" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                    <ZAxis dataKey="dif" range={[20, 80]} />
                    <RechartsTooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                      formatter={(value: number, name: string) => [formatBRL(value), name === "cobrado" ? "Pago" : name === "proposta" ? "Proposta" : name]}
                    />
                    <Scatter name="Embarques" data={scatterData}>
                      {scatterData.map((entry, index) => (
                        <Cell key={index} fill={entry.dif > 0 ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)"} fillOpacity={0.6} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Weight band comparison chart */}
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Diferença por Faixa de Peso</CardTitle>
            <CardDescription>Economia ou perda em R$ por faixa — verde = economia, vermelho = perda</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weightPivot.map(b => ({ ...b, dif: Math.round(b.dif) }))} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <RechartsTooltip
                    formatter={(value: number) => formatBRL(value)}
                    contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                  />
                  <Bar dataKey="dif" name="Diferença (R$)" radius={[4, 4, 0, 0]}>
                    {weightPivot.map((entry, index) => (
                      <Cell key={index} fill={entry.dif > 0 ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ═══ BLOCO 7 — Pareto / Concentração ═══ */}
      <section>
        <SectionHeader icon={<Activity className="h-4 w-4" />} title="Onde Ajustar para Fechar (Pareto)" />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Cidades onde a proposta é mais cara — Concentração de Perdas</CardTitle>
            <CardDescription>
              Top {paretoData.length} cidades com maior perda (proposta {'>'} pago), com % acumulado.
              {paretoData.length > 0 && (() => {
                const idx80 = paretoData.findIndex(d => d.pctAcumulado >= 80);
                return idx80 >= 0
                  ? ` → Ajustar ${idx80 + 1} cidades resolve 80% das perdas.`
                  : "";
              })()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {paretoData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
                <p className="text-sm font-medium">Nenhuma cidade com proposta mais cara!</p>
                <p className="text-xs text-muted-foreground mt-1">A proposta é competitiva em todas as cidades.</p>
              </div>
            ) : (
              <>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={paretoData} margin={{ top: 5, right: 30, left: 10, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="cidade" tick={{ fontSize: 9 }} angle={-55} textAnchor="end" interval={0} />
                      <YAxis yAxisId="left" tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} />
                      <RechartsTooltip
                        contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                        formatter={(value: number, name: string) => {
                          if (name === "% Acumulado") return [`${(value as number).toFixed(1)}%`, name];
                          return [formatBRL(value), name];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />
                      <Bar yAxisId="left" dataKey="perda" name="Perda (R$)" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} fillOpacity={0.8} />
                      <Line yAxisId="right" dataKey="pctAcumulado" name="% Acumulado" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Area yAxisId="right" dataKey={() => 80} name="" fill="none" stroke="hsl(var(--muted-foreground))" strokeDasharray="6 3" strokeWidth={1} dot={false} activeDot={false} legendType="none" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-3 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  🎯 Essas são as cidades que a transportadora precisa ajustar na tabela para viabilizar a parceria. Foque nas primeiras cidades para resolver a maior parte do problema.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ═══ BLOCO 8 — Drill-down Dialog ═══ */}
      <Dialog open={!!drillCity} onOpenChange={(o) => { if (!o) { setDrillCity(null); setDrillRow(null); } }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {drillCity?.cidade} / {drillCity?.uf} — {drillData.length} NFs
            </DialogTitle>
          </DialogHeader>

          {drillRow ? (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setDrillRow(null)} className="gap-1">← Voltar à lista</Button>
              <h3 className="flex items-center gap-2 font-semibold">
                <BarChart3 className="h-4 w-4 text-primary" /> Breakdown do Cálculo
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                <div className="flex justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                  <span className="text-muted-foreground">Peso</span>
                  <span className="font-mono font-semibold tabular-nums">{formatNumber(drillRow.shipment_peso ?? 0, 2)} kg</span>
                </div>
                <div className="flex justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                  <span className="text-muted-foreground">Valor NF</span>
                  <span className="font-mono font-semibold tabular-nums">{formatBRL(drillRow.shipment_valor_nf ?? 0)}</span>
                </div>
              </div>
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
                  ["TRT", drillRow.trt_calc],
                  ["Frete Final", drillRow.frete_final],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <span className="text-muted-foreground">{label as string}</span>
                    <span className="font-mono font-semibold tabular-nums">{formatBRL(val as number)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between rounded-lg border p-3">
                <span className="font-medium">Valor Cobrado</span>
                <span className="font-bold tabular-nums">{formatBRL(drillRow.valor_cobrado)}</span>
              </div>
              <div className={`flex justify-between rounded-lg border p-3 ${difBg((drillRow.valor_cobrado ?? 0) - (drillRow.frete_final ?? 0))}`}>
                <span className="font-medium">Diferença</span>
                <span className={`font-bold tabular-nums ${difColor((drillRow.valor_cobrado ?? 0) - (drillRow.frete_final ?? 0))}`}>
                  {formatBRL((drillRow.valor_cobrado ?? 0) - (drillRow.frete_final ?? 0))}
                </span>
              </div>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 sticky top-0 z-10">
                    <TableHead className="cursor-pointer text-right font-semibold" onClick={() => toggleDrillSort("shipment_peso")}>Peso <ArrowUpDown className="inline h-3 w-3 opacity-50" /></TableHead>
                    <TableHead className="cursor-pointer text-right font-semibold" onClick={() => toggleDrillSort("shipment_valor_nf")}>Valor NF <ArrowUpDown className="inline h-3 w-3 opacity-50" /></TableHead>
                    <TableHead className="cursor-pointer text-right font-semibold" onClick={() => toggleDrillSort("valor_cobrado")}>Pago <ArrowUpDown className="inline h-3 w-3 opacity-50" /></TableHead>
                    <TableHead className="cursor-pointer text-right font-semibold" onClick={() => toggleDrillSort("frete_final")}>Proposta <ArrowUpDown className="inline h-3 w-3 opacity-50" /></TableHead>
                    <TableHead className="cursor-pointer text-right font-semibold" onClick={() => toggleDrillSort("diferenca_valor")}>Dif (R$) <ArrowUpDown className="inline h-3 w-3 opacity-50" /></TableHead>
                    <TableHead className="cursor-pointer text-right font-semibold" onClick={() => toggleDrillSort("pct_dif")}>% Dif <ArrowUpDown className="inline h-3 w-3 opacity-50" /></TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillData.map((r, i) => {
                    const d = (r.valor_cobrado ?? 0) - (r.frete_final ?? 0);
                    const p = (r.frete_final ?? 0) > 0 ? (d / (r.frete_final ?? 1)) * 100 : 0;
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-right tabular-nums">{formatNumber(r.shipment_peso, 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(r.shipment_valor_nf)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(r.valor_cobrado)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(r.frete_final)}</TableCell>
                        <TableCell className={`text-right font-semibold tabular-nums ${difColor(d)}`}>{formatBRL(d)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${difColor(d)}`}>{p >= 0 ? "+" : ""}{p.toFixed(1)}%</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="text-primary" onClick={() => setDrillRow(r)}>Ver cálculo</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Carrier View Dialog ═══ */}
      <Dialog open={showCarrierView} onOpenChange={setShowCarrierView}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Visão para Transportadora — Ajustes Necessários
            </DialogTitle>
          </DialogHeader>
          {carrierPivot.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
              <p className="text-sm font-medium">Nenhuma região com proposta mais cara!</p>
              <p className="text-xs text-muted-foreground mt-1">A proposta é competitiva em todas as regiões.</p>
            </div>
          ) : (
            <div className="space-y-2 flex-1 overflow-auto">
              <div className="flex gap-2 mb-2">
                <Button variant="outline" size="sm" onClick={expandAllCarrier} className="text-xs gap-1">
                  <ChevronDown className="h-3 w-3" /> Expandir tudo
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAllCarrier} className="text-xs gap-1">
                  <ChevronRight className="h-3 w-3" /> Recolher tudo
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-8" />
                    <TableHead className="font-semibold">Região / UF / Categoria</TableHead>
                    <TableHead className="text-right font-semibold">Qtd NF</TableHead>
                    <TableHead className="text-right font-semibold">% Dif Frete</TableHead>
                    <TableHead className="text-right font-semibold">Prazo Real</TableHead>
                    <TableHead className="text-right font-semibold">Prazo Prop.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carrierPivot.map(macro => {
                    const macroExpanded = expandedMacros.has(macro.regiao);
                    return (
                      <Fragment key={macro.regiao}>
                        <TableRow className="cursor-pointer font-semibold hover:bg-muted/50" onClick={() => toggleMacro(macro.regiao)}>
                          <TableCell className="w-8">{macroExpanded ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}</TableCell>
                          <TableCell className="font-bold">{macro.regiao}</TableCell>
                          <TableCell className="text-right tabular-nums">{macro.qtd.toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-right font-bold tabular-nums text-destructive">{macro.pctDif.toFixed(1)}%</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{macro.prazoReal != null ? `${macro.prazoReal.toFixed(1)}d` : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{macro.prazoProp != null ? `${macro.prazoProp.toFixed(1)}d` : "—"}</TableCell>
                        </TableRow>
                        {macroExpanded && macro.ufs.map(uf => {
                          const ufExpanded = expandedCarrierUFs.has(uf.uf);
                          return (
                            <Fragment key={uf.uf}>
                              <TableRow className="bg-muted/10 text-sm font-medium cursor-pointer hover:bg-muted/20" onClick={() => toggleCarrierUF(uf.uf)}>
                                <TableCell className="pl-6">{ufExpanded ? <ChevronDown className="h-3.5 w-3.5 text-primary" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}</TableCell>
                                <TableCell className="pl-8 font-semibold">{uf.uf}</TableCell>
                                <TableCell className="text-right tabular-nums">{uf.qtd.toLocaleString("pt-BR")}</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums text-destructive">{uf.pctDif.toFixed(1)}%</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{uf.prazoReal != null ? `${uf.prazoReal.toFixed(1)}d` : "—"}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{uf.prazoProp != null ? `${uf.prazoProp.toFixed(1)}d` : "—"}</TableCell>
                              </TableRow>
                              {ufExpanded && uf.capint.map(ci => (
                                <TableRow key={`${uf.uf}-${ci.regiao}`} className="bg-muted/5 text-xs">
                                  <TableCell />
                                  <TableCell className="pl-14">
                                    <Badge variant="outline" className="border-dashed text-[10px]">{ci.regiao}</Badge>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">{ci.qtd.toLocaleString("pt-BR")}</TableCell>
                                  <TableCell className="text-right tabular-nums text-destructive">{ci.pctDif.toFixed(1)}%</TableCell>
                                  <TableCell className="text-right tabular-nums text-muted-foreground">{ci.prazoReal != null ? `${ci.prazoReal.toFixed(1)}d` : "—"}</TableCell>
                                  <TableCell className="text-right tabular-nums text-muted-foreground">{ci.prazoProp != null ? `${ci.prazoProp.toFixed(1)}d` : "—"}</TableCell>
                                </TableRow>
                              ))}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                🎯 Apenas regiões onde a proposta é mais cara que o valor pago atualmente. % negativo = proposta mais cara.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// === Subcomponents ===

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">{title}</h2>
      <div className="ml-2 h-px flex-1 bg-border" />
    </div>
  );
}

function HeroCard({ label, value, sublabel, valueColor, iconBg, icon, highlight, blurValue }: {
  label: string; value: string; sublabel?: string; valueColor?: string;
  iconBg?: string; icon?: React.ReactNode; highlight?: boolean; blurValue?: boolean;
}) {
  return (
    <Card className={`relative overflow-hidden transition-shadow hover:shadow-md ${highlight ? "ring-1 ring-primary/20" : ""}`}>
      {highlight && <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-accent" />}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent to-muted/20" />
      <CardContent className="relative flex items-start gap-3 p-5">
        {icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg ?? "bg-muted"}`}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={`mt-1 text-xl font-bold tabular-nums leading-tight ${valueColor ?? ""} ${blurValue ? "blur-sm select-none" : ""}`}>{value}</p>
          {sublabel && <p className={`mt-0.5 text-xs ${valueColor ?? "text-muted-foreground"} ${blurValue ? "blur-sm select-none" : ""}`}>{sublabel}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
