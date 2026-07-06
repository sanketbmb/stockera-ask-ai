import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MasterSearchRecentTab } from "./MasterSearchRecentTab";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { LockedVideoCard } from "@/components/video-answers/LockedVideoCard";
import type {
  LibraryItem,
  LibraryStock,
  SearchResponse,
} from "@/types/library-search";

interface Props {
  onClose?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
  variant?: "panel" | "dialog";
  initialQuery?: string;
}

type Row =
  | { kind: "stock"; id: string; stock: LibraryStock }
  | { kind: "item"; id: string; section: LibraryItem["kind"]; item: LibraryItem };

const SECTIONS: ReadonlyArray<{
  key: "stocks" | "reports" | "videos" | "community" | "analysts";
  label: string;
  itemKind: LibraryItem["kind"] | "stock";
}> = [
  { key: "stocks", label: "📊 STOCKS", itemKind: "stock" },
  { key: "reports", label: "📝 AI REPORTS", itemKind: "report" },
  { key: "videos", label: "🎥 ANALYST VIDEOS", itemKind: "video" },
  { key: "community", label: "💬 COMMUNITY", itemKind: "community_query" },
  { key: "analysts", label: "👤 ANALYSTS", itemKind: "analyst" },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function MasterSearch({
  onClose,
  autoFocus,
  placeholder = "Search stocks, reports, analysts…",
  variant = "panel",
  initialQuery = "",
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState(initialQuery);
  const debouncedQ = useDebounced(q.trim(), 200);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const rowIdPrefix = useId();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (debouncedQ.length < 3) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Primary stock suggestions: stock_master (deterministic, Indian universe, zero API cost).
    // Fallback to twelvedata symbol_search ONLY when user is logged in and stock_master returns 0 rows.
    const stockSuggestions = (async (): Promise<LibraryStock[]> => {
      try {
        const like = `${debouncedQ}%`;
        const contains = `%${debouncedQ}%`;
        const { data: rows } = await supabase
          .from("stock_master")
          .select("symbol, exchange, company_name")
          .or(`symbol.ilike.${like},company_name.ilike.${contains}`)
          .limit(8);
        const primary: LibraryStock[] = (rows ?? []).map((r) => ({
          symbol: r.symbol,
          exchange: (r.exchange === "BSE" ? "BSE" : "NSE") as "NSE" | "BSE",
          name: r.company_name ?? null,
        }));
        if (primary.length > 0) return primary;
        if (user == null) return [];
        try {
          const { data: td } = await supabase.functions.invoke("twelvedata-fetch", {
            body: { endpoint: "symbol_search", params: { symbol: debouncedQ } },
          });
          const list = (td as { success?: boolean; data?: { data?: Array<Record<string, unknown>> } } | null)?.data?.data ?? [];
          return list.slice(0, 8).map((r) => ({
            symbol: String(r.symbol ?? ""),
            exchange: (String(r.exchange ?? "").includes("BSE") ? "BSE" : "NSE") as "NSE" | "BSE",
            name: (r.instrument_name ?? r.name ?? null) as string | null,
          }));
        } catch {
          return [];
        }
      } catch {
        return [];
      }
    })();

    const librarySearch = (async (): Promise<SearchResponse> => {
      const empty: SearchResponse = {
        stocks: [], reports: [], videos: [], community: [], analysts: [], total_found: 0,
      } as unknown as SearchResponse;
      try {
        const { data: libData, error: libErr } = await supabase.functions.invoke("library-search", {
          body: { q: debouncedQ, limit: 30 },
        });
        if (libErr || !libData) return empty;
        return libData as SearchResponse;
      } catch {
        return empty;
      }
    })();

    Promise.all([librarySearch, stockSuggestions])
      .then(([base, stocks]) => {
        if (cancelled) return;
        setData({ ...base, stocks: stocks.length > 0 ? stocks : (base.stocks ?? []) });
      })
      .catch(() => {
        if (!cancelled) setData({
          stocks: [], reports: [], videos: [], community: [], analysts: [], total_found: 0,
        } as unknown as SearchResponse);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, user]);


  // Flatten rows in render order for keyboard nav
  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const out: Row[] = [];
    for (const sec of SECTIONS) {
      if (sec.key === "stocks") {
        data.stocks.forEach((s, i) =>
          out.push({ kind: "stock", id: `stock-${s.symbol}-${i}`, stock: s }),
        );
      } else {
        const list =
          sec.key === "reports"
            ? data.reports
            : sec.key === "videos"
            ? data.videos
            : sec.key === "community"
            ? data.community
            : data.analysts;
        list.forEach((it) =>
          out.push({ kind: "item", id: it.id, section: it.kind, item: it }),
        );
      }
    }
    return out;
  }, [data]);

  useEffect(() => {
    setActiveIdx(0);
  }, [rows]);

  const seedStock = (sym: string) => {
    onClose?.();
    navigate({ to: "/stock/$symbol", params: { symbol: sym } });
  };


  const openItem = (it: LibraryItem) => {
    if (!it.related_query_id) return;
    // fire-and-forget view log
    supabase.functions.invoke("library-views", { body: { item_id: it.id } }).catch(() => {});
    onClose?.();
    if (!user) {
      navigate({
        to: "/login",
        search: { redirect: `/report/${it.related_query_id}` } as never,
      });
      return;
    }
    navigate({ to: "/report/$queryId", params: { queryId: it.related_query_id } });
  };

  const activateRow = (row: Row) => {
    if (row.kind === "stock") {
      seedStock(row.stock.symbol);
      return;
    }
    const { section, item } = row;
    if (section === "analyst") return;
    if ((section === "report" || section === "video" || section === "community_query") && item.related_query_id) {
      openItem(item);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose?.();
      return;
    }
    if (!rows.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const row = rows[activeIdx];
      if (row) {
        e.preventDefault();
        activateRow(row);
      }
    }
  };

  const showHelper = debouncedQ.length < 3 && !loading;
  const totalResults = data?.total_found ?? 0;
  const activeRowId = rows[activeIdx] ? `${rowIdPrefix}-${rows[activeIdx].id}` : undefined;

  return (
    <div className={cn("w-full", variant === "panel" ? "rounded-2xl border border-border bg-card shadow-sm" : "")}>
      <div className="p-3 sm:p-4">
        <Tabs defaultValue="recent" className="w-full">
          <TabsList className="mb-3 grid w-full grid-cols-2">
            <TabsTrigger value="recent">Latest answered</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
          </TabsList>

          <TabsContent value="recent" className="mt-0">
            <div className="max-h-[19rem] overflow-y-auto overscroll-contain pr-1 scroll-smooth [scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent]">
              <MasterSearchRecentTab onClose={onClose} />
            </div>
          </TabsContent>


          <TabsContent value="search" className="mt-0">
            <div
              role="combobox"
              aria-expanded={!!data}
              aria-controls={listboxId}
              aria-haspopup="listbox"
              aria-owns={listboxId}
            >
              <Input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                aria-label="Search the research library"
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-activedescendant={activeRowId}
                className="h-11"
              />
            </div>

            {showHelper && (
              <p className="mt-3 text-xs text-muted-foreground">
                Try: SUZLON · &lsquo;should I average HDFC?&rsquo; · &lsquo;IT sector outlook&rsquo;
              </p>
            )}

            <div className="sr-only" role="status" aria-live="polite">
              {loading ? "Searching…" : data ? `${totalResults} results` : ""}
            </div>

            {(loading || data || error) && (
              <div
                id={listboxId}
                role="listbox"
                className="mt-3 max-h-[60vh] overflow-y-auto motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200"
              >
                {loading && (
                  <div className="space-y-2 py-2" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="h-9 animate-pulse rounded-md bg-muted/60" />
                    ))}
                  </div>
                )}
                {error && !loading && (
                  <p className="py-4 text-sm text-destructive">{error}</p>
                )}
                {data && !loading && !error && (
                  <>
                    {totalResults === 0 && data.stocks.length === 0 && (
                      <p className="py-4 text-sm text-muted-foreground">No matches yet. Try a ticker or a question.</p>
                    )}
                    {SECTIONS.map((sec) => {
                      const list =
                        sec.key === "stocks"
                          ? data.stocks
                          : sec.key === "reports"
                          ? data.reports
                          : sec.key === "videos"
                          ? data.videos
                          : sec.key === "community"
                          ? data.community
                          : data.analysts;
                      if (!list || list.length === 0) return null;
                      return (
                        <div key={sec.key} className="mb-3">
                          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {sec.label}
                          </div>
                          <ul>
                            {sec.key === "stocks"
                              ? data.stocks.map((s, i) => {
                                  const rowId = `stock-${s.symbol}-${i}`;
                                  const idx = rows.findIndex((r) => r.id === rowId);
                                  const active = idx === activeIdx;
                                  return (
                                    <li
                                      id={`${rowIdPrefix}-${rowId}`}
                                      key={rowId}
                                      role="option"
                                      aria-selected={active}
                                      onMouseEnter={() => setActiveIdx(idx)}
                                      onClick={() => seedStock(s.symbol)}
                                      className={cn(
                                        "flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-sm",
                                        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                                      )}
                                    >
                                      <span className="font-mono font-medium">{s.symbol}</span>
                                      <span className="text-xs text-muted-foreground">{s.exchange ?? "NSE"}</span>
                                    </li>
                                  );
                                })
                              : (list as LibraryItem[]).map((it) => {
                                  const idx = rows.findIndex((r) => r.id === it.id);
                                  const active = idx === activeIdx;
                                  const isAnalyst = it.kind === "analyst";
                                  const navigable =
                                    !isAnalyst && !!it.related_query_id;
                                  return (
                                    <li
                                      id={`${rowIdPrefix}-${it.id}`}
                                      key={it.id}
                                      role="option"
                                      aria-selected={active}
                                      aria-disabled={!navigable && !isAnalyst ? undefined : !navigable}
                                      onMouseEnter={() => setActiveIdx(idx)}
                                      onClick={() => {
                                        if (isAnalyst) return;
                                        if (navigable) openItem(it);
                                      }}
                                      className={cn(
                                        "rounded-md px-2 py-2 text-sm",
                                        navigable ? "cursor-pointer" : "cursor-default",
                                        active ? "bg-accent text-accent-foreground" : navigable ? "hover:bg-accent/50" : "",
                                      )}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate font-medium">{it.title}</div>
                                          {it.body_excerpt && (
                                            <div className="truncate text-xs text-muted-foreground">
                                              {it.body_excerpt}
                                            </div>
                                          )}
                                        </div>
                                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                                          {isAnalyst ? (
                                            <span className="italic">Coming soon</span>
                                          ) : (
                                            <>
                                              {it.symbol && <div className="font-mono">{it.symbol}</div>}
                                              {it.analyst_name && <div>{it.analyst_name}</div>}
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </li>
                                  );
                                })}
                          </ul>
                        </div>
                      );
                    })}
                    <div className="border-t border-border px-2 pt-3 text-center text-xs text-muted-foreground">
                      Full library pages coming next.
                    </div>
                  </>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default MasterSearch;
