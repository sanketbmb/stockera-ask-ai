import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { VERDICT_TONE_FILLED } from "@/lib/verdictTone";
import { StockLogo } from "@/components/common/StockLogo";


type RecentRow = {
  id: string;
  symbol: string | null;
  verdict: string | null;
  title: string;
  published_at: string | null;
};

interface Props {
  onClose?: () => void;
}

function verdictClass(v: string) {
  return VERDICT_TONE_FILLED[v.toUpperCase()] ?? "bg-muted text-muted-foreground";
}

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const sec = Math.max(1, Math.round(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(mo / 12);
  return `${yr}y ago`;
}

// Source of truth = public.queries. library_items is a downstream projection
// that lags realtime; the homepage explore list must surface new AI reports
// the moment the parent queries row is inserted/updated with is_public_library
// = true and ai_report ready. All filters, ordering and limit are server-side.
async function fetchRecent(): Promise<RecentRow[]> {
  const { data, error } = await supabase
    .from("queries")
    .select("id, stock_symbol, stock_name, query_text, ai_report, frozen_at, created_at")
    .eq("is_public_library", true)
    .is("library_tombstoned_at", null)
    .not("ai_report", "is", null)
    .order("frozen_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(5);
  if (error) throw error;
  const rows = (data ?? []).map((r): RecentRow => {
    const symbol = (r.stock_symbol ?? r.stock_name ?? null) as string | null;
    const report = (r.ai_report ?? null) as { final_verdict?: { action?: string } } | null;
    const verdict = report?.final_verdict?.action ?? null;
    const title = (r.query_text ?? r.stock_name ?? "").trim();
    return {
      id: r.id as string,
      symbol,
      verdict,
      title,
      published_at: (r.frozen_at ?? r.created_at) as string | null,
    };
  });
  // eslint-disable-next-line no-console
  console.debug("[recent-feed] count=", rows.length, "first=", rows[0]);
  return rows;
}

export function MasterSearchRecentTab({ onClose }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const channelId = useId();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["master-search-recent"],
    queryFn: fetchRecent,
    staleTime: 60 * 1000,
    throwOnError: false,
    retry: false,
  });

  // Realtime: subscribe to public.queries (NOT library_items). INSERT covers
  // brand-new questions; UPDATE covers the publish flip (is_public_library
  // false→true, or ai_report becoming populated). Mirrors the canonical
  // AskClaudeFollowup postgres_changes pattern.
  useEffect(() => {
    const channel = supabase
      .channel(`queries:homepage_recent_feed:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "queries" },
        () => queryClient.invalidateQueries({ queryKey: ["master-search-recent"] }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "queries" },
        () => queryClient.invalidateQueries({ queryKey: ["master-search-recent"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, channelId]);

  if (isLoading) {
    return (
      <div className="space-y-2 py-2" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-muted/60" />
        ))}
      </div>
    );
  }

  // Only drop rows that truly have no symbol or no title; preserve server order.
  const rows = (data ?? []).filter((r) => r.symbol && r.title);

  if (isError || rows.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No answered reports yet — be the first to ask.
        </p>
        <button
          type="button"
          onClick={() => {
            onClose?.();
            navigate({ to: "/post-query" });
          }}
          className="mt-3 inline-flex items-center rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
        >
          Post a query
        </button>
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {rows.map((r, i) => {
        const verdict = r.verdict ? r.verdict.toUpperCase() : null;
        return (
          <motion.li
            key={r.id}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: Math.min(i, 6) * 0.04, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              onClick={() => {
                onClose?.();
                if (!user) {
                  navigate({
                    to: "/login",
                    search: { redirect: `/report/${r.id}` } as never,
                  });
                  return;
                }
                navigate({
                  to: "/report/$queryId",
                  params: { queryId: r.id },
                });
              }}
              className="group flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left text-sm transition-all duration-200 hover:bg-accent/60 hover:translate-x-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {r.symbol && <StockLogo symbol={r.symbol} size={24} />}
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-primary transition-colors group-hover:bg-primary/20">
                    {r.symbol}
                  </span>
                  {verdict && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        verdictClass(verdict),
                      )}
                    >
                      {verdict}
                    </span>
                  )}
                </div>
                <div className="mt-1 line-clamp-2 text-sm text-foreground">{r.title}</div>
              </div>
              <div className="shrink-0 pt-1 text-[11px] text-muted-foreground">
                {relativeDate(r.published_at)}
              </div>
            </button>
          </motion.li>
        );
      })}
    </ul>
  );
}


export default MasterSearchRecentTab;
