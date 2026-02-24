import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/csv-utils";
import { CheckCircle2, XCircle, AlertTriangle, Download } from "lucide-react";

/** Fetch all rows from a table with pagination (bypasses 1000-row limit) */
async function fetchAll(
  table: "shipments_paid" | "carrier_rates" | "icms_uf",
  select: string,
  filters: Record<string, string>,
  batchSize = 1000
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    let query = (supabase.from(table) as any).select(select).range(offset, offset + batchSize - 1);
    for (const [k, v] of Object.entries(filters)) {
      query = query.eq(k, v);
    }
    const { data, error } = await query;
    if (error) throw error;
    if (data && (data as unknown[]).length > 0) {
      all.push(...(data as Record<string, unknown>[]));
      offset += batchSize;
      hasMore = (data as unknown[]).length === batchSize;
    } else {
      hasMore = false;
    }
  }
  return all;
}

interface Props {
  studyId: string;
  rateCount: number;
  shipmentCount: number;
}

interface NotFoundCity {
  cidade_corrigida: string;
  uf: string;
  count: number;
  total_cobrado: number;
}

export function MatchQuality({ studyId, rateCount, shipmentCount }: Props) {
  const [matched, setMatched] = useState(0);
  const [notFound, setNotFound] = useState<NotFoundCity[]>([]);
  const [missingIcms, setMissingIcms] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (rateCount === 0 || shipmentCount === 0) {
      setLoading(false);
      return;
    }

    const analyze = async () => {
      setLoading(true);

      // Get all shipment cities (paginated)
      const shipments = await fetchAll(
        "shipments_paid",
        "cidade_corrigida, uf, valor_cobrado",
        { study_id: studyId }
      );

      // Get all rate cities (paginated)
      const rates = await fetchAll(
        "carrier_rates",
        "cidade_corrigida, uf",
        { study_id: studyId }
      );

      // Get ICMS UFs
      const icmsData = await fetchAll("icms_uf", "uf", {});

      if (!shipments.length || !rates.length) { setLoading(false); return; }

      const rateSet = new Set(rates.map(r => `${r.uf}|${r.cidade_corrigida}`));
      const icmsSet = new Set(icmsData.map(r => String(r.uf)));

      let matchCount = 0;
      let missingIcmsCount = 0;
      const notFoundMap = new Map<string, NotFoundCity>();

      for (const s of shipments) {
        const uf = String(s.uf ?? "");
        const cidade = String(s.cidade_corrigida ?? "");
        const key = `${uf}|${cidade}`;
        if (rateSet.has(key)) {
          matchCount++;
          if (!icmsSet.has(uf)) missingIcmsCount++;
        } else {
          const existing = notFoundMap.get(key);
          if (existing) {
            existing.count++;
            existing.total_cobrado += Number(s.valor_cobrado) || 0;
          } else {
            notFoundMap.set(key, {
              cidade_corrigida: cidade,
              uf: uf,
              count: 1,
              total_cobrado: Number(s.valor_cobrado) || 0,
            });
          }
        }
      }

      setMatched(matchCount);
      setMissingIcms(missingIcmsCount);
      setNotFound(
        Array.from(notFoundMap.values()).sort((a, b) => b.total_cobrado - a.total_cobrado)
      );
      setLoading(false);
    };

    analyze();
  }, [studyId, rateCount, shipmentCount]);

  const exportPendencias = () => {
    if (notFound.length === 0) return;
    const lines = ["Cidade;UF;Qtd Embarques;Total Cobrado"];
    for (const nf of notFound) {
      lines.push(`${nf.cidade_corrigida};${nf.uf};${nf.count};${nf.total_cobrado}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pendencias_match.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (rateCount === 0 || shipmentCount === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p>Importe a tabela da transportadora e os fretes pagos para ver a qualidade do match.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">Analisando...</CardContent></Card>;
  }

  const total = shipmentCount;
  const notFoundTotal = notFound.reduce((acc, nf) => acc + nf.count, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{total.toLocaleString("pt-BR")}</p>
            <p className="text-sm text-muted-foreground">Total Embarques</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="flex items-center justify-center gap-1 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <p className="text-2xl font-bold">{matched.toLocaleString("pt-BR")}</p>
            </div>
            <p className="text-sm text-muted-foreground">Match OK</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="flex items-center justify-center gap-1 text-destructive">
              <XCircle className="h-5 w-5" />
              <p className="text-2xl font-bold">{notFoundTotal.toLocaleString("pt-BR")}</p>
            </div>
            <p className="text-sm text-muted-foreground">Não Encontrados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="flex items-center justify-center gap-1 text-warning">
              <AlertTriangle className="h-5 w-5" />
              <p className="text-2xl font-bold">{missingIcms}</p>
            </div>
            <p className="text-sm text-muted-foreground">ICMS Faltante</p>
          </CardContent>
        </Card>
      </div>

      {notFound.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Cidades Não Encontradas na Tabela</CardTitle>
            <Button variant="outline" size="sm" className="gap-1" onClick={exportPendencias}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-[300px] overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cidade</TableHead>
                    <TableHead>UF</TableHead>
                    <TableHead className="text-right">Embarques</TableHead>
                    <TableHead className="text-right">Total Cobrado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notFound.slice(0, 50).map((nf, i) => (
                    <TableRow key={i}>
                      <TableCell>{nf.cidade_corrigida}</TableCell>
                      <TableCell>{nf.uf}</TableCell>
                      <TableCell className="text-right">{nf.count}</TableCell>
                      <TableCell className="text-right">{formatBRL(nf.total_cobrado)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {notFound.length > 50 && (
                <p className="p-2 text-center text-xs text-muted-foreground">
                  Mostrando 50 de {notFound.length} cidades. Exporte o CSV para ver todas.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
