// src/components/report/AskClaudeFollowup.tsx
// Stage 2.3 — Claude follow-up with CTA deep-links, citation chips,
// and tool-aware sources_used parsing.
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useQueryTypeDetection } from "@/hooks/useQueryTypeDetection";
import type { StockAnalysisPayload } from "@/types/stock-analysis";

type Citation = {
  url: string;
  title: string;
  source: string;
  published_at?: string | null;
  tool?: string;
};

type CtaAction = "stock_picker" | "educational_report" | "sector_report";

type Turn = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  route_decision: string | null;
  cta_action?: CtaAction;
  sources?: Citation[];
};

type FollowupMode = "explain" | "open";

const RATE_LIMIT_LINE =
  "You've used today's free follow-up quota. Try again tomorrow.";
const NETWORK_ERROR_LINE =
  "We couldn't reach our AI service right now. Please try again in a moment.";
const UNKNOWN_ERROR_LINE =
  "Something went wrong on our end. Please try again, or rephrase your question.";
const CONTEXT_TOO_LARGE_LINE =
  "This report is too large for follow-up context.";
const THREAD_CAP = 10;

function deriveThreadId(queryId: string): string {
  return queryId;
}

function parseSourcesUsed(raw: unknown): { sources: Citation[]; cta_action?: CtaAction } {
  if (!Array.isArray(raw)) return { sources: [] };
  const sources: Citation[] = [];
  let cta: CtaAction | undefined;
  for (const entry of raw as any[]) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.cta_action && typeof entry.cta_action === "string") {
      cta = entry.cta_action as CtaAction;
    }
    // citation shape: has url + title
    if (entry.url && entry.title) {
      sources.push({
        url: String(entry.url),
        title: String(entry.title),
        source: String(entry.source ?? "link"),
        published_at: entry.published_at ?? null,
        tool: entry.tool,
      });
    }
  }
  return { sources, cta_action: cta };
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
  const [modeToast, setModeToast] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const detectedType = useQueryTypeDetection(input);

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
      .select("id, role, content, created_at, route_decision, sources_used")
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    const mapped: Turn[] = (data ?? []).map((r: any) => {
      const { sources, cta_action } = parseSourcesUsed(r.sources_used);
      return {
        id: r.id,
        role: r.role,
        content: r.content,
        created_at: r.created_at,
        route_decision: r.route_decision ?? null,
        sources,
        cta_action,
      };
    });
    setTurns(mapped);
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
          const row = payload.new as any;
          if (row.user_id !== userId) return;
          if (row.role !== "user" && row.role !== "assistant") return;
          const { sources, cta_action } = parseSourcesUsed(row.sources_used);
          const t: Turn = {
            id: row.id,
            role: row.role,
            content: row.content,
            created_at: row.created_at,
            route_decision: row.route_decision ?? null,
            sources,
            cta_action,
          };
          setTurns((prev) => (prev.some((p) => p.id === t.id) ? prev : [...prev, t]));
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

  useEffect(() => {
    if (!modeToast) return;
    const t = setTimeout(() => setModeToast(null), 4000);
    return () => clearTimeout(t);
  }, [modeToast]);

  const userTurns = turns.filter((t) => t.role === "user").length;
  const atCap = userTurns >= THREAD_CAP;

  const appendLocal = (role: "user" | "assistant", content: string, extra?: Partial<Turn>) => {
    setTurns((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role,
        content,
        created_at: new Date().toISOString(),
        route_decision: null,
        ...(extra ?? {}),
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
    setModeToast(
      followupMode === "open"
        ? "Open mode — drawing on general market knowledge. Still SEBI-safe."
        : "Explain mode — answers stay inside this report.",
    );
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
        | {
            ok?: boolean;
            content?: string;
            followup_id?: string;
            route_decision?: string | null;
            cta_action?: CtaAction;
            sources?: Citation[];
          }
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
              cta_action: payload?.cta_action,
              sources: payload?.sources ?? [],
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

  // Auto-suggest chips based on detected type
  const suggestionChip = (() => {
    if (!input.trim()) return null;
    if (detectedType === "Which Stock to Buy") {
      return { label: "→ Try Stockera Stock Picker", href: "/stock-picker", forceMode: null as FollowupMode | null };
    }
    if (detectedType === "Sectorial View") {
      return {
        label: "→ Sector View report",
        href: `/post-query?type=sector_view&q=${encodeURIComponent(input.trim())}`,
        forceMode: null,
      };
    }
    if (detectedType === "Educational") {
      return {
        label: "→ Educational explainer",
        href: `/post-query?type=educational&q=${encodeURIComponent(input.trim())}`,
        forceMode: null,
      };
    }
    if (detectedType === "News / Latest" && followupMode !== "open") {
      return { label: "→ Will search market news (Open mode)", href: null, forceMode: "open" as FollowupMode };
    }
    return null;
  })();

  const explainTitle = "Stays inside this report's data. SEBI-safe — no new buy/sell calls.";
  const openTitle = "Wider answers using market knowledge + live tools. Still SEBI-safe.";

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
        {turns.map((t) => {
          const citationSources = (t.sources ?? []).filter(
            (s) =>
              s.url &&
              s.source !== "internal" &&
              (s.tool === "web_search" || s.tool === "marketaux"),
          );
          const ctaSource = (t.sources ?? []).find((s) => s.source === "internal");
          return (
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
                <>
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

                  {t.cta_action === "stock_picker" && (
                    <div className="mt-2">
                      <a
                        href="/stock-picker"
                        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        Open Stockera Stock Picker →
                      </a>
                    </div>
                  )}
                  {t.cta_action === "educational_report" && ctaSource?.url && (
                    <div className="mt-2">
                      <a
                        href={ctaSource.url}
                        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                      >
                        Open Stockera Explain this →
                      </a>
                    </div>
                  )}
                  {t.cta_action === "sector_report" && ctaSource?.url && (
                    <div className="mt-2">
                      <a
                        href={ctaSource.url}
                        className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
                      >
                        Open Stockera Sector View →
                      </a>
                    </div>
                  )}

                  {citationSources.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {citationSources.slice(0, 8).map((s, i) => (
                        <a
                          key={i}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
                        >
                          <span className="font-medium">{s.source || "link"}</span>
                          <span className="truncate max-w-[180px]">{s.title}</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex flex-col gap-2">
        {/* Mode toggle with tooltips */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-border/60 bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              title={explainTitle}
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
              title={openTitle}
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
          {modeToast && (
            <span className="text-[11px] text-muted-foreground animate-in fade-in">
              {modeToast}
            </span>
          )}
        </div>

        {suggestionChip && (
          <div className="text-xs rounded-md border border-primary/30 bg-primary/5 px-3 py-2 flex items-center justify-between gap-2">
            <span>
              💡 Detected: <strong>{detectedType}</strong>
            </span>
            {suggestionChip.href ? (
              <a
                href={suggestionChip.href}
                className="underline text-primary whitespace-nowrap"
              >
                {suggestionChip.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => suggestionChip.forceMode && setFollowupMode(suggestionChip.forceMode)}
                className="underline text-primary whitespace-nowrap"
              >
                {suggestionChip.label}
              </button>
            )}
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
            {followupMode === "open" ? "open mode" : "explainer mode"} · SEBI-compliance aware
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
