import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Download, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseDeadlineCSV, readFileAsRows, generateDeadlineTemplate, type ParseResult } from "@/lib/csv-utils";
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

type TableName = "deadlines_realized" | "deadlines_proposed";

interface Props {
  studyId: string;
  table: TableName;
  title: string;
  onImported: () => void;
}

export function DeadlineImport({ studyId, table, title, onImported }: Props) {
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ParseResult<Record<string, unknown>> | null>(null);
  const [count, setCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchCount = useCallback(async () => {
    const { count: c } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("study_id", studyId);
    setCount(c ?? 0);
  }, [studyId, table]);

  useEffect(() => { fetchCount(); }, [fetchCount]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const rows = await readFileAsRows(file);
      const parsed = parseDeadlineCSV(rows);
      setResult(parsed);
      if (parsed.missingColumns.length > 0) {
        toast({ title: "Colunas obrigatórias faltando", description: parsed.missingColumns.join(", "), variant: "destructive" });
      }
      if (parsed.duplicates > 0) {
        toast({ title: `${parsed.duplicates} registros duplicados foram agrupados (média calculada)` });
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

    await supabase.from(table).delete().eq("study_id", studyId);

    const BATCH = 500;
    let errorCount = 0;
    for (let i = 0; i < result.data.length; i += BATCH) {
      const batch = result.data.slice(i, i + BATCH).map(row => ({ ...row, study_id: studyId }));
      const { error } = await supabase.from(table).upsert(batch as any, { onConflict: "study_id,uf,cidade_corrigida" });
      if (error) errorCount++;
    }

    setUploading(false);
    if (errorCount > 0) {
      toast({ title: "Alguns lotes falharam", variant: "destructive" });
    } else {
      toast({ title: `${result.data.length} cidades importadas!` });
    }
    setResult(null);
    fetchCount();
    onImported();
  };

  const handleDelete = async () => {
    await supabase.from(table).delete().eq("study_id", studyId);
    toast({ title: "Prazos excluídos" });
    setCount(0);
    onImported();
  };

  const downloadTemplate = () => {
    const csv = generateDeadlineTemplate();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template_${table}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{title}</span>
          {count > 0 && (
            <span className="flex items-center gap-1 text-sm font-normal text-success">
              <CheckCircle2 className="h-4 w-4" /> {count} cidades
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
          {count > 0 && (
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
              <p>Cidades únicas (após média): <strong>{result.data.length}</strong></p>
              {result.duplicates > 0 && <p className="text-muted-foreground">Registros agrupados por média: <strong>{result.duplicates}</strong></p>}
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

            {result.data.length > 0 && result.missingColumns.length === 0 && (
              <Button onClick={handleUpload} disabled={uploading} className="w-full">
                {uploading ? "Importando..." : `Confirmar importação de ${result.data.length} cidades`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
