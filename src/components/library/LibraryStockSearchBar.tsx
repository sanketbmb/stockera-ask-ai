// Library Videos & Blogs Phase 1 — stock search bar with symbol/company
// autocomplete. Purely presentational; the parent owns the selected
// symbol. No route wire-in yet.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { searchStockMaster, type StockMasterHit } from "@/lib/library-videos.functions";

export type SelectedSymbol = {
  symbol: string;
  company_name: string | null;
  exchange: string | null;
};

interface Props {
  selected: SelectedSymbol | null;
  onSelect: (s: SelectedSymbol | null) => void;
  placeholder?: string;
}

export function LibraryStockSearchBar({ selected, onSelect, placeholder }: Props) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const searchFn = useServerFn(searchStockMaster);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const enabled = debounced.length >= 1 && !selected;
  const { data: hits, isFetching } = useQuery({
    queryKey: ["library-videos", "stock-search", debounced],
    queryFn: () => searchFn({ data: { q: debounced } }) as Promise<StockMasterHit[]>,
    enabled,
    staleTime: 30_000,
  });

  const showMenu = useMemo(() => open && enabled && !!hits && hits.length > 0, [open, enabled, hits]);

  if (selected) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-sm py-1.5 px-3 font-mono">
          {selected.symbol}
          {selected.company_name ? (
            <span className="ml-2 font-sans font-normal text-muted-foreground">{selected.company_name}</span>
          ) : null}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onSelect(null);
            setQ("");
            setDebounced("");
          }}
          className="h-8 px-2"
          aria-label="Clear selected stock"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "Search a stock — symbol or company (e.g. INFY, Infosys)"}
          className="pl-9"
          aria-label="Search a stock"
        />
      </div>
      {showMenu ? (
        <div
          role="listbox"
          className="absolute z-20 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-72 overflow-auto"
        >
          {(hits ?? []).map((h) => (
            <button
              key={`${h.symbol}|${h.exchange ?? ""}`}
              type="button"
              role="option"
              onClick={() => {
                onSelect(h);
                setOpen(false);
                setQ("");
              }}
              className="w-full text-left px-3 py-2 hover:bg-accent focus:bg-accent focus:outline-none flex items-center justify-between gap-3"
            >
              <span className="min-w-0 flex-1">
                <span className="font-mono font-medium">{h.symbol}</span>
                {h.company_name ? (
                  <span className="ml-2 text-sm text-muted-foreground truncate">{h.company_name}</span>
                ) : null}
              </span>
              {h.exchange ? (
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">{h.exchange}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {enabled && !isFetching && hits && hits.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No matches for "{debounced}".</p>
      ) : null}
    </div>
  );
}
