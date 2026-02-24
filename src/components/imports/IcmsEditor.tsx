import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface IcmsRow {
  uf: string;
  aliquota: number;
}

export function IcmsEditor() {
  const [rows, setRows] = useState<IcmsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("icms_uf").select("uf, aliquota").order("uf");
      setRows((data as IcmsRow[]) ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  const handleChange = async (uf: string, value: string) => {
    const numStr = value.replace(",", ".");
    const num = parseFloat(numStr);
    if (isNaN(num)) return;

    // If user enters as percentage (e.g., 18), convert to decimal
    const aliquota = num > 1 ? num / 100 : num;

    setRows(prev => prev.map(r => r.uf === uf ? { ...r, aliquota } : r));

    const { error } = await supabase.from("icms_uf").update({ aliquota, updated_at: new Date().toISOString() }).eq("uf", uf);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando ICMS...</p>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Alíquotas ICMS por UF</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[400px] overflow-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">UF</TableHead>
                <TableHead>Alíquota (%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.uf}>
                  <TableCell className="font-medium">{r.uf}</TableCell>
                  <TableCell>
                    <Input
                      className="h-8 w-24"
                      defaultValue={(r.aliquota * 100).toFixed(1)}
                      onBlur={e => handleChange(r.uf, e.target.value)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Edite diretamente. Valores serão salvos como decimal (ex: 18% → 0.18).
        </p>
      </CardContent>
    </Card>
  );
}
