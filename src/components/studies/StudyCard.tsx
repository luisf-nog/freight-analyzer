import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Archive, Copy, Trash2, TrendingDown, TrendingUp, FileText, Clock, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  imported: { label: "Importado", className: "bg-primary/15 text-primary" },
  calculated: { label: "Calculado", className: "bg-success/15 text-success" },
  archived: { label: "Arquivado", className: "bg-muted text-muted-foreground opacity-60" },
};

const UF_MACRO: Record<string, string> = {
  AC: "Norte", AM: "Norte", AP: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste",
  PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MS: "Centro-Oeste", MT: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
  PR: "Sul", RS: "Sul", SC: "Sul",
};

const MACRO_ORDER = ["Sul", "Sudeste", "Centro-Oeste", "Nordeste", "Norte", "Outro"];


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
  prazo_medio_realizado: number | null;
  prazo_medio_proposto: number | null;
}

interface Props {
  study: StudyRow;
  summary?: StudySummary;
  ufs?: string[];
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function StudyCard({ study, summary, ufs, onDuplicate, onArchive, onDelete }: Props) {
  const navigate = useNavigate();
  const regioes = (() => {
    if (!ufs?.length) return [] as { nome: string; qtd: number }[];
    const counts: Record<string, number> = {};
    for (const uf of ufs) {
      const macro = UF_MACRO[uf] ?? "Outro";
      counts[macro] = (counts[macro] ?? 0) + 1;
    }
    return MACRO_ORDER.filter(m => counts[m]).map(m => ({ nome: m, qtd: counts[m] }));
  })();

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
        {regioes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {regioes.map(r => (
              <Badge key={r.nome} variant="outline" className="px-1.5 py-0 text-[11px] font-medium">
                {r.nome} <span className="ml-1 text-muted-foreground">{r.qtd} UF</span>
              </Badge>
            ))}
          </div>
        )}
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
            {(summary.prazo_medio_realizado != null || summary.prazo_medio_proposto != null) && (
              <div className="flex items-center justify-between text-xs border-t pt-1.5 mt-1">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Prazo
                </span>
                <span className="font-medium">
                  {summary.prazo_medio_realizado != null ? `${summary.prazo_medio_realizado}d hoje` : "—"}
                  {" → "}
                  {summary.prazo_medio_proposto != null ? `${summary.prazo_medio_proposto}d proposta` : "—"}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Sem simulação</p>
        )}
        <p className="text-xs text-muted-foreground">Criado em {date}</p>
      </CardContent>
    </Card>
  );
}
