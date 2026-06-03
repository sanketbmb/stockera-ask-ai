import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { NSE_STOCKS, type NseStock } from "@/data/nseStocks";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface StockAutocompleteProps {
  value?: NseStock | null;
  onSelect: (stock: NseStock) => void;
  onClear?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

const MAX_RESULTS = 10;
const DEBOUNCE_MS = 180;

function normalizeSymbol(sym: string): string {
  return sym.trim().toUpperCase().replace(/\.(NS|BO|BSE|NSE)$/i, "");
}

/** Prefer NSE row when same symbol exists on both exchanges. */
function dedupePreferNSE(
  rows: Array<{ symbol: string; company_name: string | null; exchange: string }>,
): NseStock[] {
  const byKey = new Map<string, { symbol: string; name: string; sector: string; exchange: string }>();
  for (const r of rows) {
    const symbol = normalizeSymbol(r.symbol);
    const existing = byKey.get(symbol);
    const candidate = {
      symbol,
      name: r.company_name?.trim() || symbol,
      sector: r.exchange === "NSE" ? "NSE" : "BSE",
      exchange: r.exchange,
    };
    if (!existing) {
      byKey.set(symbol, candidate);
    } else if (existing.exchange !== "NSE" && r.exchange === "NSE") {
      byKey.set(symbol, candidate);
    }
  }
  return Array.from(byKey.values()).map(({ symbol, name, sector }) => ({ symbol, name, sector }));
}

function rankResults(results: NseStock[], q: string): NseStock[] {
  const query = q.toUpperCase();
  return results
    .slice()
    .sort((a, b) => {
      const aExact = a.symbol === query ? 0 : 1;
      const bExact = b.symbol === query ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      const aPre = a.symbol.startsWith(query) ? 0 : 1;
      const bPre = b.symbol.startsWith(query) ? 0 : 1;
      if (aPre !== bPre) return aPre - bPre;
      return a.symbol.localeCompare(b.symbol);
    })
    .slice(0, MAX_RESULTS);
}

function staticFallback(q: string): NseStock[] {
  const query = q.toUpperCase();
  if (!query) return [];
  const matches = NSE_STOCKS.filter(
    (s) => s.symbol.includes(query) || s.name.toUpperCase().includes(query),
  );
  return rankResults(matches, query);
}

async function searchStockMaster(q: string): Promise<NseStock[]> {
  const query = q.trim();
  if (!query) return [];
  const upper = query.toUpperCase();
  const like = `%${query}%`;

  // Fetch enough rows to dedupe NSE/BSE duplicates before slicing.
  const { data, error } = await supabase
    .from("stock_master")
    .select("symbol, company_name, exchange")
    .or(`symbol.ilike.${upper}%,symbol.ilike.${like},company_name.ilike.${like}`)
    .limit(40);

  if (error) throw error;
  const deduped = dedupePreferNSE(data ?? []);
  return rankResults(deduped, upper);
}

export function StockAutocomplete({
  value,
  onSelect,
  onClear,
  placeholder = "Search stock by symbol or name (e.g. TCS or Reliance)",
  autoFocus,
  className,
}: StockAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [results, setResults] = useState<NseStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);

  useEffect(() => setHighlight(0), [results]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      return;
    }
    setLoading(true);
    const myReq = ++reqIdRef.current;
    const t = setTimeout(async () => {
      try {
        const live = await searchStockMaster(trimmed);
        if (reqIdRef.current !== myReq) return;
        if (live.length === 0) {
          // Honest fallback: surface curated list if live returned nothing
          const fb = staticFallback(trimmed);
          setResults(fb);
        } else {
          setResults(live);
        }
      } catch (err) {
        console.warn("[StockAutocomplete] live search failed, using fallback", err);
        if (reqIdRef.current !== myReq) return;
        setResults(staticFallback(trimmed));
      } finally {
        if (reqIdRef.current === myReq) {
          setLoading(false);
          setSearched(true);
        }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function handleSelect(stock: NseStock) {
    onSelect({ ...stock, symbol: normalizeSymbol(stock.symbol) });
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative w-full", className)}>
      {value ? (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-card">
          <div className="flex items-center gap-3">
            <span className="font-mono text-base font-semibold text-foreground">
              {value.symbol}
            </span>
            <span className="text-sm text-muted-foreground">{value.name}</span>
            {value.sector ? (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-accent">
                {value.sector}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              onClear?.();
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Change stock"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              autoFocus={autoFocus}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="w-full rounded-xl border border-input bg-card px-10 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              aria-autocomplete="list"
              aria-expanded={open}
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {open && query.trim().length > 0 && (
            <div className="absolute left-0 right-0 z-30 mt-2 max-h-80 overflow-auto rounded-xl border border-border bg-popover shadow-card-lg">
              {loading && results.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Searching…
                </div>
              ) : results.length === 0 && searched ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No matches —{" "}
                  <a
                    href="mailto:support@stockera.in?subject=Add%20stock%20to%20Stockera"
                    className="font-medium text-accent hover:underline"
                  >
                    request to add stock
                  </a>
                </div>
              ) : (
                <ul role="listbox">
                  {results.map((s, i) => (
                    <li
                      key={`${s.symbol}-${i}`}
                      role="option"
                      aria-selected={i === highlight}
                      onMouseEnter={() => setHighlight(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(s)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm",
                        i === highlight && "bg-accent/10",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {s.symbol}
                        </span>
                        <span className="truncate text-sm text-muted-foreground">
                          {s.name}
                        </span>
                      </div>
                      {s.sector ? (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          {s.sector}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default StockAutocomplete;
