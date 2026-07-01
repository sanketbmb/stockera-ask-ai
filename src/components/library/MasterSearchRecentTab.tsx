import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { VERDICT_TONE_FILLED } from "@/lib/verdictTone";

type RecentRow = {
  id: string;
  symbol: string | null;
  verdict: string | null;
  title: string;
  source_id: string | null;
  source_table: string | null;
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

async function fetchRecent(): Promise<RecentRow[]> {
  const { data, error } = await supabase
    .from("library_items")
    .select("id, symbol, verdict, title, source_id, source_table, published_at")
    .eq("is_public", true)
    .eq("is_tombstoned", false)
    .eq("source_table", "queries")
    .not("verdict", "is", null)
    .not("symbol", "is", null)
    .not("source_id", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(12);
  if (error) throw error;
  return (data ?? []) as RecentRow[];
}

export function MasterSearchRecentTab({ onClose }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["master-search-recent"],
    queryFn: fetchRecent,
    staleTime: 5 * 60 * 1000,
  });

  // Realtime: mirror the ai_followups postgres_changes pattern.
  // A new library_items row (or verdict/title update) invalidates the cached
  // list so useQuery re-fetches; dedup + ordering stay in fetchRecent.
  useEffect(() => {
    const channel = supabase
      .channel("library_items:recent_feed")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "library_items",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["master-search-recent"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "library_items",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["master-search-recent"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="space-y-2 py-2" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-muted/60" />
        ))}
      </div>
    );
  }

  const rows = (data ?? []).filter(
    (r) => r.source_id && r.symbol && r.verdict && r.title,
  );

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
      {rows.map((r) => {
        const verdict = (r.verdict as string).toUpperCase();
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => {
                onClose?.();
                navigate({
                  to: "/report/$queryId",
                  params: { queryId: r.source_id as string },
                });
              }}
              className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-primary">
                    {r.symbol}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      verdictClass(verdict),
                    )}
                  >
                    {verdict}
                  </span>
                </div>
                <div className="mt-1 truncate text-sm text-foreground">{r.title}</div>
              </div>
              <div className="shrink-0 pt-1 text-[11px] text-muted-foreground">
                {relativeDate(r.published_at)}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default MasterSearchRecentTab;
