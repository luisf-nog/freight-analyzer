import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Archive, Copy, Trash2, TrendingDown, TrendingUp, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  imported: { label: "Importado", className: "bg-primary/15 text-primary" },
  calculated: { label: "Calculado", className: "bg-success/15 text-success" },
  archived: { label: "Arquivado", className: "bg-muted text-muted-foreground opacity-60" },
};

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

interface Props {
  study: StudyRow;
  summary?: StudySummary;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function StudyCard({ study, summary, onDuplicate, onArchive, onDelete }: Props) {
  const navigate = useNavigate();
  const statusInfo = STATUS_MAP[study.status] ?? STATUS_MAP.draft;
  const date = new Date(study.created_at).toLocaleDateString("pt-BR");

  const hasSavings = summary && summary.economia > 0;
  const hasLoss = summary && summary.economia < 0;

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => navigate(`/study/${study.id}`)}
    >
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-lg leading-tight">{study.name}</CardTitle>
          {study.carrier_name && (
            <p className="text-sm text-muted-foreground">{study.carrier_name}</p>
          )}
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <Badge variant="secondary" className={statusInfo.className}>
            {statusInfo.label}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onDuplicate(study.id)}>
                <Copy className="mr-2 h-4 w-4" /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onArchive(study.id)}>
                <Archive className="mr-2 h-4 w-4" /> Arquivar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(study.id)} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {summary ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span>{summary.total_notas.toLocaleString("pt-BR")} notas simuladas</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Pago</span>
              <span className="font-medium">{formatCurrency(summary.total_pago)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Proposto</span>
              <span className="font-medium">{formatCurrency(summary.total_proposto)}</span>
            </div>
            <div className={`flex items-center justify-between rounded-md px-2 py-1 text-xs font-semibold ${
              hasSavings ? "bg-green-500/10 text-green-700" : hasLoss ? "bg-red-500/10 text-red-700" : "bg-muted text-muted-foreground"
            }`}>
              <span className="flex items-center gap-1">
                {hasSavings ? <TrendingDown className="h-3.5 w-3.5" /> : hasLoss ? <TrendingUp className="h-3.5 w-3.5" /> : null}
                {hasSavings ? "Economia" : hasLoss ? "Acréscimo" : "Diferença"}
              </span>
              <span>{formatCurrency(Math.abs(summary.economia))} ({Math.abs(summary.pct_economia)}%)</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Sem simulação</p>
        )}
        <p className="text-xs text-muted-foreground">Criado em {date}</p>
      </CardContent>
    </Card>
  );
}
