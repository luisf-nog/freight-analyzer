import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Download, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseCarrierRateCSV, readFileAsRows, generateCarrierTemplate, type ParseResult } from "@/lib/csv-utils";
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Props {
  studyId: string;
  rateCount: number;
  onImported: () => void;
}

export function CarrierRateImport({ studyId, rateCount, onImported }: Props) {
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
      const parsed = parseCarrierRateCSV(rows);
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

    // Delete existing rates in batches to avoid timeout
    let deleteMore = true;
    while (deleteMore) {
      const { data: ids } = await supabase
        .from("carrier_rates")
        .select("id")
        .eq("study_id", studyId)
        .limit(50);
      if (!ids || ids.length === 0) {
        deleteMore = false;
      } else {
        await supabase
          .from("carrier_rates")
          .delete()
          .in("id", ids.map(r => r.id));
      }
    }

    // Batch insert (500 at a time)
    const BATCH = 500;
    let errorCount = 0;
    for (let i = 0; i < result.data.length; i += BATCH) {
      const batch = result.data.slice(i, i + BATCH).map(row => ({ ...row, study_id: studyId }));
      const { error } = await supabase.from("carrier_rates").upsert(batch as any, { onConflict: "study_id,uf,cidade_corrigida" });
      if (error) errorCount++;
    }

    setUploading(false);
    if (errorCount > 0) {
      toast({ title: "Alguns lotes falharam", description: `${errorCount} lotes com erro`, variant: "destructive" });
    } else {
      toast({ title: `${result.data.length} tarifas importadas com sucesso!` });
    }
    setResult(null);
    onImported();
  };

  const handleDelete = async () => {
    let more = true;
    while (more) {
      const { data: ids } = await supabase.from("carrier_rates").select("id").eq("study_id", studyId).limit(50);
      if (!ids || ids.length === 0) { more = false; } else {
        await supabase.from("carrier_rates").delete().in("id", ids.map(r => r.id));
      }
    }
    toast({ title: "Tarifas excluídas" });
    onImported();
  };

  const downloadTemplate = () => {
    const csv = generateCarrierTemplate();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template_tabela_transportadora.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Tabela da Transportadora</span>
          {rateCount > 0 && (
            <span className="flex items-center gap-1 text-sm font-normal text-success">
              <CheckCircle2 className="h-4 w-4" /> {rateCount} tarifas
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
          {rateCount > 0 && (
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
              <p>Válidas para importar: <strong>{result.data.length}</strong></p>
              {result.duplicates > 0 && (
                <details>
                  <summary className="cursor-pointer text-warning">Duplicatas removidas (UF|Cidade): <strong>{result.duplicates}</strong></summary>
                  <div className="max-h-40 overflow-auto text-xs mt-1">
                    {result.duplicateDetails.slice(0, 50).map((d, i) => (
                      <p key={i}>Linha {d.row}: "{d.key}" (primeira: linha {d.firstRow})</p>
                    ))}
                    {result.duplicateDetails.length > 50 && <p>...e mais {result.duplicateDetails.length - 50}</p>}
                  </div>
                </details>
              )}
              {result.errors.length > 0 && <p className="text-destructive">Erros de parsing: <strong>{result.errors.length}</strong></p>}
            </div>

            {result.missingColumns.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Colunas obrigatórias não encontradas: {result.missingColumns.join(", ")}
                </AlertDescription>
              </Alert>
            )}

            {result.errors.length > 0 && result.errors.length <= 10 && (
              <div className="max-h-32 overflow-auto rounded border p-2 text-xs">
                {result.errors.map((err, i) => (
                  <p key={i} className="text-destructive">
                    Linha {err.row}, col "{err.column}": "{err.value}" — {err.message}
                  </p>
                ))}
              </div>
            )}

            {result.data.length > 0 && result.missingColumns.length === 0 && (
              <Button onClick={handleUpload} disabled={uploading} className="w-full">
                {uploading ? "Importando..." : `Confirmar importação de ${result.data.length} tarifas`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
