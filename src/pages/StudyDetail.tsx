import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package } from "lucide-react";
import { CarrierRateImport } from "@/components/imports/CarrierRateImport";
import { ShipmentImport } from "@/components/imports/ShipmentImport";
import { IcmsEditor } from "@/components/imports/IcmsEditor";
import { DeadlineImport } from "@/components/imports/DeadlineImport";
import { MatchQuality } from "@/components/imports/MatchQuality";
import { RunSimulation } from "@/components/simulation/RunSimulation";
import { AnalysisDashboard } from "@/components/analysis/AnalysisDashboard";
import { toast } from "@/hooks/use-toast";

interface Study {
  id: string;
  name: string;
  carrier_name: string;
  status: string;
  notes: string | null;
}

const StudyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [study, setStudy] = useState<Study | null>(null);
  const [loading, setLoading] = useState(true);
  const [rateCount, setRateCount] = useState(0);
  const [shipmentCount, setShipmentCount] = useState(0);
  const [simulationCount, setSimulationCount] = useState(0);

  const fetchStudy = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("studies")
      .select("id, name, carrier_name, status, notes")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      toast({ title: "Estudo não encontrado", variant: "destructive" });
      navigate("/");
      return;
    }
    setStudy(data as Study);
    setLoading(false);
  }, [id, navigate]);

  const fetchCounts = useCallback(async () => {
    if (!id) return;
    const [{ count: rc }, { count: sc }, { count: simc }] = await Promise.all([
      supabase.from("carrier_rates").select("id", { count: "exact", head: true }).eq("study_id", id),
      supabase.from("shipments_paid").select("id", { count: "exact", head: true }).eq("study_id", id),
      supabase.from("simulations").select("id", { count: "exact", head: true }).eq("study_id", id),
    ]);
    setRateCount(rc ?? 0);
    setShipmentCount(sc ?? 0);
    setSimulationCount(simc ?? 0);
  }, [id]);

  useEffect(() => {
    fetchStudy();
    fetchCounts();
  }, [fetchStudy, fetchCounts]);

  if (loading || !study) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="container flex items-center gap-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Package className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold">{study.name}</h1>
              {study.carrier_name && <p className="text-xs text-muted-foreground">{study.carrier_name}</p>}
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <Tabs defaultValue="imports">
          <TabsList>
            <TabsTrigger value="imports">Importações</TabsTrigger>
            <TabsTrigger value="match">Qualidade do Match</TabsTrigger>
            <TabsTrigger value="simulation">Simulação</TabsTrigger>
            <TabsTrigger value="analysis">Análise</TabsTrigger>
          </TabsList>

          <TabsContent value="imports" className="space-y-4 pt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <CarrierRateImport studyId={study.id} rateCount={rateCount} onImported={fetchCounts} />
              <ShipmentImport studyId={study.id} shipmentCount={shipmentCount} onImported={fetchCounts} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <DeadlineImport studyId={study.id} table="deadlines_realized" title="Prazo Realizado (Histórico)" onImported={fetchCounts} />
              <DeadlineImport studyId={study.id} table="deadlines_proposed" title="Prazo Proposto (Transportadora)" onImported={fetchCounts} />
            </div>
            <IcmsEditor />
          </TabsContent>

          <TabsContent value="match" className="pt-4">
            <MatchQuality studyId={study.id} rateCount={rateCount} shipmentCount={shipmentCount} />
          </TabsContent>

          <TabsContent value="simulation" className="pt-4">
            <RunSimulation studyId={study.id} rateCount={rateCount} shipmentCount={shipmentCount} onComplete={fetchCounts} />
          </TabsContent>

          <TabsContent value="analysis" className="pt-4">
            <AnalysisDashboard studyId={study.id} simulationCount={simulationCount} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default StudyDetail;
