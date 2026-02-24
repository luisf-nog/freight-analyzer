import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatNumber } from "@/lib/csv-utils";
import { Download, TrendingUp, TrendingDown, ChevronDown, ChevronRight } from "lucide-react";

// Brazilian state capitals
const STATE_CAPITALS: Record<string, string> = {
  AC: "RIO BRANCO", AL: "MACEIO", AM: "MANAUS", AP: "MACAPA",
  BA: "SALVADOR", CE: "FORTALEZA", DF: "BRASILIA", ES: "VITORIA",
  GO: "GOIANIA", MA: "SAO LUIS", MG: "BELO HORIZONTE", MS: "CAMPO GRANDE",
  MT: "CUIABA", PA: "BELEM", PB: "JOAO PESSOA", PE: "RECIFE",
  PI: "TERESINA", PR: "CURITIBA", RJ: "RIO DE JANEIRO", RN: "NATAL",
  RO: "PORTO VELHO", RR: "BOA VISTA", RS: "PORTO ALEGRE",
  SC: "FLORIANOPOLIS", SE: "ARACAJU", SP: "SAO PAULO", TO: "PALMAS",
};

function getRegiao(uf: string, cidade: string): string {
  const capital = STATE_CAPITALS[uf];
  if (!capital) return "Interior";
  return cidade === capital ? "Capital" : "Interior";
}

interface SimRow {
  match_status: string;
  valor_cobrado: number | null;
  frete_final: number | null;
  diferenca_valor: number | null;
  pct_dif: number | null;
  reais_kg_hj: number | null;
  reais_kg_proposta: number | null;
  shipment_uf: string;
  shipment_cidade: string;
  shipment_peso: number;
}

interface AggRow {
  uf: string;
  regiao: string;
  qtd: number;
  total_cobrado: number;
  total_proposto: number;
  diferenca: number;
  soma_peso: number;
}

interface Props {
  studyId: string;
  simulationCount: number;
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

export function AnalysisDashboard({ studyId, simulationCount }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SimRow[]>([]);
  const [expandedUFs, setExpandedUFs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (simulationCount === 0) { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      // Fetch simulations joined with shipment data
      const sims = await fetchAll(
        "simulations",
        "match_status, valor_cobrado, frete_final, diferenca_valor, pct_dif, reais_kg_hj, reais_kg_proposta, shipment_row_id",
        { study_id: studyId }
      );

      // Fetch shipments for UF/cidade/peso
      const shipments = await fetchAll(
        "shipments_paid",
        "id, uf, cidade_corrigida, peso",
        { study_id: studyId }
      );

      const shipMap = new Map<string, { uf: string; cidade: string; peso: number }>();
      for (const s of shipments) {
        shipMap.set(s.id, { uf: s.uf, cidade: s.cidade_corrigida, peso: s.peso });
      }

      const merged: SimRow[] = sims.map((sim: any) => {
        const ship = shipMap.get(sim.shipment_row_id);
        return {
          ...sim,
          shipment_uf: ship?.uf ?? "",
          shipment_cidade: ship?.cidade ?? "",
          shipment_peso: ship?.peso ?? 0,
        };
      });

      setRows(merged);
      setLoading(false);
    };
    load();
  }, [studyId, simulationCount]);

  const { aggByUFRegiao, totals } = useMemo(() => {
    const map = new Map<string, AggRow>();
    let totalCobrado = 0, totalProposto = 0, totalDif = 0, totalQtd = 0, totalPeso = 0;

    for (const r of rows) {
      if (r.match_status === "NOT_FOUND") continue;
      const regiao = getRegiao(r.shipment_uf, r.shipment_cidade);
      const key = `${r.shipment_uf}|${regiao}`;
      let agg = map.get(key);
      if (!agg) {
        agg = { uf: r.shipment_uf, regiao, qtd: 0, total_cobrado: 0, total_proposto: 0, diferenca: 0, soma_peso: 0 };
        map.set(key, agg);
      }
      agg.qtd++;
      agg.total_cobrado += r.valor_cobrado ?? 0;
      agg.total_proposto += r.frete_final ?? 0;
      agg.diferenca += r.diferenca_valor ?? 0;
      agg.soma_peso += r.shipment_peso;

      totalCobrado += r.valor_cobrado ?? 0;
      totalProposto += r.frete_final ?? 0;
      totalDif += r.diferenca_valor ?? 0;
      totalQtd++;
      totalPeso += r.shipment_peso;
    }

    const aggArr = Array.from(map.values()).sort((a, b) => a.uf.localeCompare(b.uf) || a.regiao.localeCompare(b.regiao));

    return {
      aggByUFRegiao: aggArr,
      totals: { totalCobrado, totalProposto, totalDif, totalQtd, totalPeso },
    };
  }, [rows]);

  // Group by UF for collapsible
  const ufGroups = useMemo(() => {
    const map = new Map<string, AggRow[]>();
    for (const r of aggByUFRegiao) {
      const arr = map.get(r.uf) || [];
      arr.push(r);
      map.set(r.uf, arr);
    }
    return map;
  }, [aggByUFRegiao]);

  const toggleUF = (uf: string) => {
    setExpandedUFs(prev => {
      const next = new Set(prev);
      if (next.has(uf)) next.delete(uf); else next.add(uf);
      return next;
    });
  };

  const exportCSV = () => {
    const lines = ["UF;Região;Qtd NF;Diferença Valor;% Dif;R$/kg Hoje;R$/kg Proposta;Peso Médio"];
    for (const r of aggByUFRegiao) {
      const pctDif = r.total_proposto > 0 ? r.diferenca / r.total_proposto : 0;
      const rkgHj = r.soma_peso > 0 ? r.total_cobrado / r.soma_peso : 0;
      const rkgProp = r.soma_peso > 0 ? r.total_proposto / r.soma_peso : 0;
      const pesoMedio = r.qtd > 0 ? r.soma_peso / r.qtd : 0;
      lines.push(`${r.uf};${r.regiao};${r.qtd};${r.diferenca.toFixed(2)};${(pctDif * 100).toFixed(1)}%;${rkgHj.toFixed(2)};${rkgProp.toFixed(2)};${pesoMedio.toFixed(1)}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "analise_uf_regiao.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (simulationCount === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p>Rode a simulação primeiro para ver a análise.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">Carregando análise...</CardContent></Card>;
  }

  const pctGeral = totals.totalProposto > 0 ? totals.totalDif / totals.totalProposto : 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Total Cobrado</p>
            <p className="text-xl font-bold">{formatBRL(totals.totalCobrado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Total Proposta</p>
            <p className="text-xl font-bold">{formatBRL(totals.totalProposto)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Diferença</p>
            <div className="flex items-center justify-center gap-1">
              {totals.totalDif > 0 ? (
                <TrendingDown className="h-4 w-4 text-destructive" />
              ) : (
                <TrendingUp className="h-4 w-4 text-success" />
              )}
              <p className={`text-xl font-bold ${totals.totalDif > 0 ? "text-destructive" : "text-success"}`}>
                {formatBRL(totals.totalDif)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{(pctGeral * 100).toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">R$/kg Comparativo</p>
            <div className="flex justify-center gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Hoje</p>
                <p className="font-bold">
                  R$ {totals.totalPeso > 0 ? (totals.totalCobrado / totals.totalPeso).toFixed(2) : "0,00"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Proposta</p>
                <p className="font-bold">
                  R$ {totals.totalPeso > 0 ? (totals.totalProposto / totals.totalPeso).toFixed(2) : "0,00"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pivot table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Análise por UF / Região</CardTitle>
          <Button variant="outline" size="sm" className="gap-1" onClick={exportCSV}>
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-[500px] overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>UF</TableHead>
                  <TableHead>Região</TableHead>
                  <TableHead className="text-right">Qtd NF</TableHead>
                  <TableHead className="text-right">Diferença Valor</TableHead>
                  <TableHead className="text-right">% Dif</TableHead>
                  <TableHead className="text-right">R$/kg Hoje</TableHead>
                  <TableHead className="text-right">R$/kg Proposta</TableHead>
                  <TableHead className="text-right">Peso Médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(ufGroups.entries()).map(([uf, regions]) => {
                  const ufTotal = regions.reduce((acc, r) => ({
                    qtd: acc.qtd + r.qtd,
                    cobrado: acc.cobrado + r.total_cobrado,
                    proposto: acc.proposto + r.total_proposto,
                    dif: acc.dif + r.diferenca,
                    peso: acc.peso + r.soma_peso,
                  }), { qtd: 0, cobrado: 0, proposto: 0, dif: 0, peso: 0 });
                  const ufPct = ufTotal.proposto > 0 ? ufTotal.dif / ufTotal.proposto : 0;
                  const ufRkgHj = ufTotal.peso > 0 ? ufTotal.cobrado / ufTotal.peso : 0;
                  const ufRkgProp = ufTotal.peso > 0 ? ufTotal.proposto / ufTotal.peso : 0;
                  const ufPesoMedio = ufTotal.qtd > 0 ? ufTotal.peso / ufTotal.qtd : 0;
                  const expanded = expandedUFs.has(uf);

                  return (
                    <>
                      <TableRow
                        key={uf}
                        className="cursor-pointer font-medium hover:bg-muted/50"
                        onClick={() => toggleUF(uf)}
                      >
                        <TableCell>
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="font-bold">{uf}</TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                        <TableCell className="text-right font-bold">{ufTotal.qtd.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className={`text-right font-bold ${ufTotal.dif > 0 ? "text-destructive" : "text-success"}`}>
                          {formatBRL(ufTotal.dif)}
                        </TableCell>
                        <TableCell className={`text-right ${ufPct > 0 ? "text-destructive" : "text-success"}`}>
                          {(ufPct * 100).toFixed(0)}%
                        </TableCell>
                        <TableCell className="text-right">R$ {ufRkgHj.toFixed(2)}</TableCell>
                        <TableCell className="text-right">R$ {ufRkgProp.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{formatNumber(ufPesoMedio, 1)}</TableCell>
                      </TableRow>
                      {expanded && regions.map((r) => {
                        const pct = r.total_proposto > 0 ? r.diferenca / r.total_proposto : 0;
                        const rkgHj = r.soma_peso > 0 ? r.total_cobrado / r.soma_peso : 0;
                        const rkgProp = r.soma_peso > 0 ? r.total_proposto / r.soma_peso : 0;
                        const pesoMedio = r.qtd > 0 ? r.soma_peso / r.qtd : 0;
                        return (
                          <TableRow key={`${r.uf}-${r.regiao}`} className="bg-muted/20 text-sm">
                            <TableCell></TableCell>
                            <TableCell className="pl-8">{r.uf}</TableCell>
                            <TableCell>{r.regiao}</TableCell>
                            <TableCell className="text-right">{r.qtd.toLocaleString("pt-BR")}</TableCell>
                            <TableCell className={`text-right ${r.diferenca > 0 ? "text-destructive" : "text-success"}`}>
                              {formatBRL(r.diferenca)}
                            </TableCell>
                            <TableCell className={`text-right ${pct > 0 ? "text-destructive" : "text-success"}`}>
                              {(pct * 100).toFixed(0)}%
                            </TableCell>
                            <TableCell className="text-right">R$ {rkgHj.toFixed(2)}</TableCell>
                            <TableCell className="text-right">R$ {rkgProp.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{formatNumber(pesoMedio, 1)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </>
                  );
                })}
                {/* Total row */}
                <TableRow className="border-t-2 font-bold bg-muted/30">
                  <TableCell></TableCell>
                  <TableCell>TOTAL</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right">{totals.totalQtd.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className={`text-right ${totals.totalDif > 0 ? "text-destructive" : "text-success"}`}>
                    {formatBRL(totals.totalDif)}
                  </TableCell>
                  <TableCell className={`text-right ${pctGeral > 0 ? "text-destructive" : "text-success"}`}>
                    {(pctGeral * 100).toFixed(0)}%
                  </TableCell>
                  <TableCell className="text-right">
                    R$ {totals.totalPeso > 0 ? (totals.totalCobrado / totals.totalPeso).toFixed(2) : "0,00"}
                  </TableCell>
                  <TableCell className="text-right">
                    R$ {totals.totalPeso > 0 ? (totals.totalProposto / totals.totalPeso).toFixed(2) : "0,00"}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(totals.totalQtd > 0 ? totals.totalPeso / totals.totalQtd : 0, 1)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
