// src/components/report/AskClaudeFollowup.tsx
// Stage 2 — Claude follow-up below V1 report.
// Two modes: "explain" (stay inside report JSON) and "open" (Ask anything,
// using report as priming + general market knowledge). Both SEBI-safe.
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useQueryTypeDetection } from "@/hooks/useQueryTypeDetection";
import type { StockAnalysisPayload } from "@/types/stock-analysis";

type Turn = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  route_decision: string | null;
};

type FollowupMode = "explain" | "open";

const FALLBACK_LINE = "Our analyst team will reply within 24h.";
const THREAD_CAP = 10;

function deriveThreadId(queryId: string): string {
  return queryId;
}

export function AskClaudeFollowup({
  queryId,
  aiReport: _aiReport,
}: {
  queryId: string;
  aiReport: StockAnalysisPayload;
}) {
  const threadId = useMemo(() => deriveThreadId(queryId), [queryId]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [realtimeOk, setRealtimeOk] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [followupMode, setFollowupMode] = useState<FollowupMode>("explain");
  const endRef = useRef<HTMLDivElement | null>(null);

  const detectedType = useQueryTypeDetection(input);
  const shouldSuggestOpen =
    followupMode === "explain" &&
    (detectedType === "News / Latest" ||
      detectedType === "Educational" ||
      detectedType === "Sectorial View" ||
      detectedType === "Live Price");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUserId(data.user?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  const loadTurns = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("ai_followups")
      .select("id, role, content, created_at, route_decision")
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setTurns((data ?? []) as Turn[]);
  };

  useEffect(() => {
    if (userId) void loadTurns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, threadId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`ai_followups:thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ai_followups",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as Turn & { user_id: string };
          if (row.user_id !== userId) return;
          if (row.role !== "user" && row.role !== "assistant") return;
          setTurns((prev) =>
            prev.some((t) => t.id === row.id) ? prev : [...prev, row],
          );
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeOk(false);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, sending]);

  const userTurns = turns.filter((t) => t.role === "user").length;
  const atCap = userTurns >= THREAD_CAP;

  const appendLocal = (role: "user" | "assistant", content: string) => {
    setTurns((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role,
        content,
        created_at: new Date().toISOString(),
        route_decision: null,
      },
    ]);
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || sending || atCap) return;
    setSending(true);
    setLoadError(null);
    appendLocal("user", msg);
    setInput("");
    try {
      const { data, error } = await supabase.functions.invoke("ask-claude", {
        body: {
          mode: "report_followup",
          query_id: queryId,
          thread_id: threadId,
          user_message: msg,
          followup_mode: followupMode,
        },
      });
      if (error) {
        const ctx = (error as unknown as { context?: Response }).context;
        const status = ctx?.status;
        if (status === 429) {
          toast.info("Daily limit reached.");
          appendLocal("assistant", FALLBACK_LINE);
        } else if (status === 413) {
          toast.error("This report is too large for follow-up context.");
          appendLocal("assistant", "This report is too large for follow-up context.");
        } else {
          appendLocal("assistant", FALLBACK_LINE);
        }
        return;
      }
      const payload = data as
        | { ok?: boolean; content?: string; followup_id?: string; route_decision?: string | null }
        | null;
      const answer = payload?.content?.trim();
      if (answer) {
        setTurns((prev) => {
          const id = payload?.followup_id ?? `local-${Date.now()}`;
          if (prev.some((t) => t.id === id)) return prev;
          return [
            ...prev,
            {
              id,
              role: "assistant",
              content: answer,
              created_at: new Date().toISOString(),
              route_decision: payload?.route_decision ?? null,
            },
          ];
        });
      } else {
        setLoadError("The assistant returned an empty response. Please try again.");
      }
      void loadTurns();
    } catch (e) {
      console.error("ask-claude invoke failed", e);
      appendLocal("assistant", FALLBACK_LINE);
    } finally {
      setSending(false);
    }
  };

  const modeHint =
    followupMode === "open"
      ? "Wider answers using market knowledge. Still SEBI-safe — no new buy/sell calls."
      : "Stays inside this report. SEBI-safe.";

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur p-5 md:p-6 space-y-4">
      <header className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg">Ask about this report</h2>
      </header>

      {turns.length === 0 && !loadError && (
        <p className="text-sm text-muted-foreground">
          Ask anything about this analysis. Switch to <strong>Ask anything</strong>{" "}
          mode for wider context (news, education, sector views).
        </p>
      )}

      {loadError && (
        <p className="text-sm text-destructive">
          Couldn't load previous turns: {loadError}{" "}
          <button className="underline" onClick={() => void loadTurns()}>
            Reload
          </button>
        </p>
      )}

      <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
        {turns.map((t) => (
          <div
            key={t.id}
            className={
              t.role === "user"
                ? "rounded-lg bg-muted/60 px-3 py-2 text-sm"
                : "rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-sm"
            }
          >
            {t.role === "user" ? (
              <p className="whitespace-pre-wrap">{t.content}</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-2 [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-3 [&_h1]:mb-1 [&_h2]:mb-1 [&_h3]:mb-1 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_table]:my-3 [&_table]:w-full [&_table]:text-xs [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_td]:p-2 [&_td]:border-t [&_td]:border-border/40 [&_hr]:my-3 [&_hr]:border-border/40 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:italic">
                <ReactMarkdown
                  allowedElements={[
                    "p", "strong", "em", "ul", "ol", "li", "code", "pre",
                    "h1", "h2", "h3", "h4", "blockquote", "hr",
                    "table", "thead", "tbody", "tr", "th", "td", "br",
                  ]}
                  unwrapDisallowed
                  skipHtml
                >
                  {t.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex flex-col gap-2">
        {/* Mode toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-border/60 bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFollowupMode("explain")}
              className={
                "px-3 py-1 rounded-full transition " +
                (followupMode === "explain"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              Explain this report
            </button>
            <button
              type="button"
              onClick={() => setFollowupMode("open")}
              className={
                "px-3 py-1 rounded-full transition " +
                (followupMode === "open"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              Ask anything
            </button>
          </div>
          <span className="text-[11px] text-muted-foreground">{modeHint}</span>
        </div>

        {shouldSuggestOpen && (
          <div className="text-xs rounded-md border border-primary/30 bg-primary/5 px-3 py-2 flex items-center justify-between gap-2">
            <span>
              💡 Looks like a <strong>{detectedType}</strong> question. Try{" "}
              <em>Ask anything</em> mode for a wider answer.
            </span>
            <button
              type="button"
              onClick={() => setFollowupMode("open")}
              className="underline text-primary whitespace-nowrap"
            >
              Switch mode
            </button>
          </div>
        )}

        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            atCap
              ? "You've reached 10 follow-ups for this report."
              : followupMode === "open"
                ? "Ask anything — news, sector, education, general market…"
                : "Ask a follow-up question about this report…"
          }
          rows={2}
          disabled={atCap || sending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {userTurns}/{THREAD_CAP} follow-ups ·{" "}
            {followupMode === "open" ? "open mode" : "explainer mode"} ·
            SEBI-compliance aware
          </span>
          <Button
            size="sm"
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending || atCap}
          >
            {sending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            <span className="ml-1">Send</span>
          </Button>
        </div>
        {!realtimeOk && (
          <button
            onClick={() => void loadTurns()}
            className="self-end text-[11px] underline text-muted-foreground"
          >
            Realtime offline — click to reload
          </button>
        )}
      </div>
    </section>
  );
}
