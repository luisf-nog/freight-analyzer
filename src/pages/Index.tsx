import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StudyCard } from "@/components/studies/StudyCard";
import { CreateStudyDialog } from "@/components/studies/CreateStudyDialog";
import { toast } from "@/hooks/use-toast";
import { Package } from "lucide-react";

interface StudyRow {
  id: string;
  name: string;
  carrier_name: string;
  status: string;
  created_at: string;
  notes: string | null;
}

export interface StudySummary {
  study_id: string;
  total_notas: number;
  total_pago: number;
  total_proposto: number;
  economia: number;
  pct_economia: number;
}

const Index = () => {
  const [studies, setStudies] = useState<StudyRow[]>([]);
  const [summaries, setSummaries] = useState<Record<string, StudySummary>>({});
  const [loading, setLoading] = useState(true);

  const fetchStudies = useCallback(async () => {
    setLoading(true);
    const [studiesRes, summariesRes] = await Promise.all([
      supabase
        .from("studies")
        .select("id, name, carrier_name, status, created_at, notes")
        .neq("status", "archived")
        .order("created_at", { ascending: false }),
      supabase.rpc("study_summaries"),
    ]);
    setLoading(false);
    if (studiesRes.error) {
      toast({ title: "Erro ao carregar estudos", description: studiesRes.error.message, variant: "destructive" });
      return;
    }
    setStudies((studiesRes.data as StudyRow[]) ?? []);
    if (summariesRes.data) {
      const map: Record<string, StudySummary> = {};
      for (const s of summariesRes.data as StudySummary[]) {
        map[s.study_id] = s;
      }
      setSummaries(map);
    }
  }, []);

  useEffect(() => { fetchStudies(); }, [fetchStudies]);

  const handleDuplicate = async (id: string) => {
    const original = studies.find(s => s.id === id);
    if (!original) return;
    const { error } = await supabase.from("studies").insert({
      name: `${original.name} (cópia)`,
      carrier_name: original.carrier_name,
      notes: original.notes,
    });
    if (error) {
      toast({ title: "Erro ao duplicar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Estudo duplicado!" });
    fetchStudies();
  };

  const handleArchive = async (id: string) => {
    const { error } = await supabase.from("studies").update({ status: "archived" }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao arquivar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Estudo arquivado!" });
    fetchStudies();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("studies").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Estudo excluído!" });
    fetchStudies();
  };

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Package className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">FreteLab</h1>
              <p className="text-xs text-muted-foreground">Análise de Tabelas de Frete</p>
            </div>
          </div>
          <CreateStudyDialog onCreated={fetchStudies} />
        </div>
      </header>

      <main className="container py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground">Carregando estudos...</p>
          </div>
        ) : studies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <h2 className="mb-2 text-xl font-semibold">Nenhum estudo criado</h2>
            <p className="mb-6 text-muted-foreground">Crie um novo estudo para começar a analisar tabelas de frete.</p>
            <CreateStudyDialog onCreated={fetchStudies} />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {studies.map(s => (
              <StudyCard
                key={s.id}
                study={s}
                onDuplicate={handleDuplicate}
                onArchive={handleArchive}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
