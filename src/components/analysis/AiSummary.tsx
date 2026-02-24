import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, FileText, Briefcase, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface AiSummaryProps {
  buildPayload: () => Record<string, unknown>;
  disabled?: boolean;
}

type SummaryType = "executive" | "technical";

export function AiSummary({ buildPayload, disabled }: AiSummaryProps) {
  const [summaryType, setSummaryType] = useState<SummaryType>("executive");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (type: SummaryType) => {
    setSummaryType(type);
    setContent("");
    setError(null);
    setLoading(true);

    try {
      const payload = buildPayload();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-analysis-summary`;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ data: payload, type }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${resp.status}`);
      }

      if (!resp.body) throw new Error("Sem resposta do servidor");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              accumulated += delta;
              setContent(accumulated);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              accumulated += delta;
              setContent(accumulated);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [buildPayload]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" /> Resumo por IA
          </CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={summaryType === "executive" && content ? "default" : "outline"}
              className="gap-1.5"
              disabled={disabled || loading}
              onClick={() => generate("executive")}
            >
              {loading && summaryType === "executive" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Briefcase className="h-3.5 w-3.5" />
              )}
              Executivo
            </Button>
            <Button
              size="sm"
              variant={summaryType === "technical" && content ? "default" : "outline"}
              className="gap-1.5"
              disabled={disabled || loading}
              onClick={() => generate("technical")}
            >
              {loading && summaryType === "technical" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              Técnico
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!content && !loading && !error && (
          <p className="text-center text-sm text-muted-foreground py-6">
            Clique em <strong>Executivo</strong> ou <strong>Técnico</strong> para gerar o resumo com IA.
          </p>
        )}

        {loading && !content && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Gerando análise...</span>
          </div>
        )}

        {content && (
          <div className="relative">
            {loading && (
              <Badge variant="outline" className="absolute right-0 top-0 gap-1 text-[10px]">
                <Loader2 className="h-3 w-3 animate-spin" /> Gerando...
              </Badge>
            )}
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
