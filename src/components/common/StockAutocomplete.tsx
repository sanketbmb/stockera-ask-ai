import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { NSE_STOCKS, type NseStock } from "@/data/nseStocks";
import { cn } from "@/lib/utils";

interface StockAutocompleteProps {
  value?: NseStock | null;
  onSelect: (stock: NseStock) => void;
  onClear?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

// Simple Levenshtein for fuzzy fallback
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = Array(b.length + 1)
    .fill(0)
    .map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = cur;
    }
  }
  return dp[b.length];
}

function searchStocks(q: string): NseStock[] {
  const query = q.trim().toUpperCase();
  if (!query) return [];
  const substring = NSE_STOCKS.filter(
    (s) =>
      s.symbol.includes(query) ||
      s.name.toUpperCase().includes(query),
  );
  if (substring.length >= 8) {
    return substring
      .sort((a, b) => {
        // Prefer symbol matches first, then prefix matches
        const aSym = a.symbol.startsWith(query) ? 0 : 1;
        const bSym = b.symbol.startsWith(query) ? 0 : 1;
        if (aSym !== bSym) return aSym - bSym;
        return a.symbol.localeCompare(b.symbol);
      })
      .slice(0, 8);
  }
  // Fuzzy fallback
  const scored = NSE_STOCKS.map((s) => ({
    s,
    score: Math.min(
      lev(query, s.symbol),
      lev(query, s.name.toUpperCase().slice(0, query.length + 4)),
    ),
  }))
    .filter((x) => x.score <= 3)
    .sort((a, b) => a.score - b.score);

  const seen = new Set<string>();
  const merged = [...substring, ...scored.map((x) => x.s)].filter((s) => {
    if (seen.has(s.symbol)) return false;
    seen.add(s.symbol);
    return true;
  });
  return merged.slice(0, 8);
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
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchStocks(query), [query]);

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function handleSelect(stock: NseStock) {
    onSelect(stock);
    setQuery("");
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
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-accent">
              {value.sector}
            </span>
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
          </div>

          {open && query.trim().length > 0 && (
            <div className="absolute left-0 right-0 z-30 mt-2 max-h-80 overflow-auto rounded-xl border border-border bg-popover shadow-card-lg">
              {results.length === 0 ? (
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
                      key={s.symbol}
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
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        {s.sector}
                      </span>
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
