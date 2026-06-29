import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface QueryLike {
  stock_symbol?: string | null;
  stock_name?: string | null;
}

interface Suggestion {
  symbol: string;
  name: string;
}

interface Props {
  queries: QueryLike[];
  value: string;
  onChange: (next: string) => void;
  onSelectSuggestion: (symbol: string) => void;
}

export function QueriesSearchBar({ queries, value, onChange, onSelectSuggestion }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // distinct (symbol, name) pairs across the queries
  const universe = useMemo<Suggestion[]>(() => {
    const map = new Map<string, Suggestion>();
    for (const q of queries) {
      const symbol = (q.stock_symbol ?? "").trim();
      const name = (q.stock_name ?? "").trim();
      if (!symbol && !name) continue;
      const key = `${symbol.toLowerCase()}|${name.toLowerCase()}`;
      if (!map.has(key)) map.set(key, { symbol: symbol || name, name });
    }
    return Array.from(map.values());
  }, [queries]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    const bucketA: Suggestion[] = [];
    const bucketB: Suggestion[] = [];
    for (const s of universe) {
      const sym = s.symbol.toLowerCase();
      const nm = s.name.toLowerCase();
      if (sym.startsWith(q) || nm.startsWith(q)) bucketA.push(s);
      else if (sym.includes(q) || nm.includes(q)) bucketB.push(s);
    }
    const cmp = (a: Suggestion, b: Suggestion) => a.symbol.localeCompare(b.symbol);
    bucketA.sort(cmp);
    bucketB.sort(cmp);
    return [...bucketA, ...bucketB].slice(0, 8);
  }, [universe, value]);

  // reset highlight when suggestions change
  useEffect(() => {
    setActiveIdx(0);
  }, [value]);

  // click outside closes
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showDropdown = open && suggestions.length > 0;

  const select = (s: Suggestion) => {
    onSelectSuggestion(s.symbol);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              if (showDropdown && suggestions[activeIdx]) {
                e.preventDefault();
                select(suggestions[activeIdx]);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Search your queries by stock symbol or name…"
          className="pl-9 pr-9"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          role="listbox"
          className="qsb-pop absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg max-h-72 overflow-y-auto"
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.symbol}-${s.name}-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => select(s)}
              className={`w-full text-left px-3 py-2 text-sm flex items-baseline gap-2 ${
                i === activeIdx ? "bg-muted/70" : "hover:bg-muted/50"
              }`}
            >
              <span className="font-mono font-semibold text-foreground">{s.symbol}</span>
              {s.name && s.name !== s.symbol && (
                <span className="text-xs text-muted-foreground truncate">{s.name}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .qsb-pop { animation: qsb-fade 120ms ease-out; }
        @keyframes qsb-fade { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .qsb-pop { animation: none; }
        }
      `}</style>
    </div>
  );
}
