import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Download, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseShipmentCSV, readFileAsRows, generateShipmentTemplate, type ParseResult } from "@/lib/csv-utils";
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatNumber } from "@/lib/csv-utils";

interface Props {
  studyId: string;
  shipmentCount: number;
  onImported: () => void;
}

export function ShipmentImport({ studyId, shipmentCount, onImported }: Props) {
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ParseResult<Record<string, unknown>> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const rows = await readFileAsRows(file);
      const parsed = parseShipmentCSV(rows);
      setResult(parsed);
      if (parsed.missingColumns.length > 0) {
        toast({ title: "Colunas obrigatórias faltando", description: parsed.missingColumns.join(", "), variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao ler arquivo", variant: "destructive" });
    }
    setParsing(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!result || result.data.length === 0) return;
    setUploading(true);

    // Delete existing in batches to avoid timeout
    let deleteMore = true;
    while (deleteMore) {
      const { data: ids } = await supabase
        .from("shipments_paid")
        .select("id")
        .eq("study_id", studyId)
        .limit(500);
      if (!ids || ids.length === 0) {
        deleteMore = false;
      } else {
        await supabase
          .from("shipments_paid")
          .delete()
          .in("id", ids.map(r => r.id));
      }
    }

    const BATCH = 500;
    let errorCount = 0;
    for (let i = 0; i < result.data.length; i += BATCH) {
      const batch = result.data.slice(i, i + BATCH).map(row => ({ ...row, study_id: studyId }));
      const { error } = await supabase.from("shipments_paid").insert(batch as any);
      if (error) errorCount++;
    }

    setUploading(false);
    if (errorCount > 0) {
      toast({ title: "Alguns lotes falharam", variant: "destructive" });
    } else {
      toast({ title: `${result.data.length} embarques importados!` });
    }
    setResult(null);
    onImported();
  };

  const handleDelete = async () => {
    let more = true;
    while (more) {
      const { data: ids } = await supabase.from("shipments_paid").select("id").eq("study_id", studyId).limit(500);
      if (!ids || ids.length === 0) { more = false; } else {
        await supabase.from("shipments_paid").delete().in("id", ids.map(r => r.id));
      }
    }
    toast({ title: "Embarques excluídos" });
    onImported();
  };

  const downloadTemplate = () => {
    const csv = generateShipmentTemplate();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template_fretes_pagos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const preview = result?.data.slice(0, 5) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Fretes Pagos</span>
          {shipmentCount > 0 && (
            <span className="flex items-center gap-1 text-sm font-normal text-success">
              <CheckCircle2 className="h-4 w-4" /> {shipmentCount.toLocaleString("pt-BR")} embarques
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => fileRef.current?.click()} disabled={parsing}>
            <Upload className="h-4 w-4" /> {parsing ? "Lendo..." : "Importar CSV/XLSX"}
          </Button>
          <Button variant="ghost" size="sm" className="gap-1" onClick={downloadTemplate}>
            <Download className="h-4 w-4" /> Template
          </Button>
          {shipmentCount > 0 && (
            <Button variant="ghost" size="sm" className="gap-1 text-destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" /> Limpar
            </Button>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" className="hidden" onChange={handleFile} />

        {result && (
          <div className="space-y-2">
            <div className="rounded-md border p-3 text-sm">
              <p>Total de linhas: <strong>{result.totalRows}</strong></p>
              <p>Válidas: <strong>{result.data.length}</strong></p>
              {result.errors.length > 0 && <p className="text-destructive">Erros: <strong>{result.errors.length}</strong></p>}
            </div>

            {result.missingColumns.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Colunas obrigatórias não encontradas: {result.missingColumns.join(", ")}
                </AlertDescription>
              </Alert>
            )}

            {preview.length > 0 && (
              <div className="overflow-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cidade</TableHead>
                      <TableHead>UF</TableHead>
                      <TableHead className="text-right">Peso</TableHead>
                      <TableHead className="text-right">Valor NF</TableHead>
                      <TableHead className="text-right">Valor Cobrado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{String(row.cidade_corrigida ?? "")}</TableCell>
                        <TableCell>{String(row.uf ?? "")}</TableCell>
                        <TableCell className="text-right">{formatNumber(row.peso as number)}</TableCell>
                        <TableCell className="text-right">{formatBRL(row.valor_nf as number)}</TableCell>
                        <TableCell className="text-right">{formatBRL(row.valor_cobrado as number)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {result.data.length > 5 && (
                  <p className="p-2 text-center text-xs text-muted-foreground">
                    Mostrando 5 de {result.data.length} linhas
                  </p>
                )}
              </div>
            )}

            {result.data.length > 0 && result.missingColumns.length === 0 && (
              <Button onClick={handleUpload} disabled={uploading} className="w-full">
                {uploading ? "Importando..." : `Confirmar importação de ${result.data.length} embarques`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
