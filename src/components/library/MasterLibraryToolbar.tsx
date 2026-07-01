import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SortKey = "latest" | "most_viewed";

export const VERDICT_FILTERS = [
  "BUY",
  "HOLD",
  "AVERAGE",
  "EXIT",
  "PARTIAL_EXIT",
  "WAIT",
] as const;
export type VerdictFilter = (typeof VERDICT_FILTERS)[number];

export function verdictDisplayLabel(v: VerdictFilter): string {
  return v === "PARTIAL_EXIT" ? "PARTIAL EXIT" : v;
}

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  verdict: VerdictFilter | null;
  onVerdictChange: (v: VerdictFilter | null) => void;
  sector: string;
  onSectorChange: (v: string) => void;
  sectorOptions: string[];
  sort: SortKey;
  onSortChange: (v: SortKey) => void;
  mostViewedDisabled?: boolean;
  onClear: () => void;
  hasActiveFilters: boolean;
}

export function MasterLibraryToolbar({
  search,
  onSearchChange,
  verdict,
  onVerdictChange,
  sector,
  onSectorChange,
  sectorOptions,
  sort,
  onSortChange,
  mostViewedDisabled = false,
  onClear,
  hasActiveFilters,
}: Props) {
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
        {/* Row 1: search + sector + sort + clear */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search symbol, title, or excerpt"
              aria-label="Search library"
              className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <Select
            value={sector === "" ? "__all__" : sector}
            onValueChange={(v) => onSectorChange(v === "__all__" ? "" : v)}
          >
            <SelectTrigger
              aria-label="Filter by sector"
              className="h-10 rounded-lg border-border bg-card text-sm text-foreground sm:w-48"
            >
              <SelectValue placeholder="All sectors" />
            </SelectTrigger>
            <SelectContent className="text-sm">
              <SelectItem value="__all__">All sectors</SelectItem>
              {sectorOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => onSortChange(v as SortKey)}>
            <SelectTrigger
              aria-label="Sort order"
              className="h-10 rounded-lg border-border bg-card text-sm text-foreground sm:w-40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="text-sm">
              <SelectItem value="latest">Latest</SelectItem>
              <SelectItem value="most_viewed" disabled={mostViewedDisabled}>
                Most viewed{mostViewedDisabled ? " (soon)" : ""}
              </SelectItem>
            </SelectContent>
          </Select>


          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Row 2: verdict chips */}
        <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
          {VERDICT_FILTERS.map((v) => {
            const active = verdict === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => onVerdictChange(active ? null : v)}
                aria-pressed={active}
                data-state={active ? "active" : "inactive"}
                className={cn(
                  "tab-underline chip-press rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {verdictDisplayLabel(v)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default MasterLibraryToolbar;
