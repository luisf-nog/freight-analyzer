import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  onCreated: () => void;
}

export function CreateStudyDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("studies").insert({
      name: name.trim(),
      carrier_name: carrierName.trim(),
      notes: notes.trim() || null,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao criar estudo", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Estudo criado com sucesso!" });
    setOpen(false);
    setName("");
    setCarrierName("");
    setNotes("");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2">
          <Plus className="h-5 w-5" />
          Novo Estudo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Novo Estudo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="study-name">Nome do Estudo *</Label>
            <Input id="study-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Análise Transportadora X - Jan/2024" />
          </div>
          <div>
            <Label htmlFor="carrier-name">Nome da Transportadora</Label>
            <Input id="carrier-name" value={carrierName} onChange={e => setCarrierName(e.target.value)} placeholder="Ex: Transportadora ABC" />
          </div>
          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas adicionais..." rows={3} />
          </div>
          <Button onClick={handleCreate} disabled={loading} className="w-full">
            {loading ? "Criando..." : "Criar Estudo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
