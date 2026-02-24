import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Play, Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  studyId: string;
  rateCount: number;
  shipmentCount: number;
  onComplete: () => void;
}

export function RunSimulation({ studyId, rateCount, shipmentCount, onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ processed: number; matched: number; notFound: number } | null>(null);

  const canRun = rateCount > 0 && shipmentCount > 0;

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("run-simulation", {
        body: { study_id: studyId },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setResult(data);
      toast({ title: "Simulação concluída", description: `${data.processed} embarques processados` });
      onComplete();
    } catch (err: any) {
      toast({ title: "Erro na simulação", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Motor de Simulação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A simulação aplica a tabela de tarifas importada sobre cada embarque do histórico,
            calculando o frete proposto com todos os componentes (faixas de peso, ADV, GRIS, pedágio, ICMS, TRT, etc).
          </p>
          {!canRun && (
            <p className="text-sm text-destructive">
              Importe a tabela da transportadora e os fretes pagos antes de rodar a simulação.
            </p>
          )}
          <Button onClick={run} disabled={!canRun || running} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Processando..." : "Rodar Simulação"}
          </Button>

          {result && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Simulação concluída</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Processados</p>
                  <p className="font-bold">{result.processed.toLocaleString("pt-BR")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Match OK</p>
                  <p className="font-bold text-success">{result.matched.toLocaleString("pt-BR")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Não Encontrados</p>
                  <p className="font-bold text-destructive">{result.notFound.toLocaleString("pt-BR")}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
