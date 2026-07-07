// Library Videos & Blogs Phase 1 — filter chip state.
// Type: All / Videos / Blogs. Price: All / Free / Paid.
// Client-side only; parent applies filters to fetched rows.
import { Button } from "@/components/ui/button";

export type TypeFilter = "all" | "videos" | "blogs";
export type PriceFilter = "all" | "free" | "paid";

export interface LibraryFilters {
  type: TypeFilter;
  price: PriceFilter;
}

interface Props {
  value: LibraryFilters;
  onChange: (next: LibraryFilters) => void;
}

const TYPE_OPTS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "videos", label: "Videos" },
  { key: "blogs", label: "Blogs" },
];

const PRICE_OPTS: { key: PriceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
];

export function LibraryFilterChips({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1" role="group" aria-label="Type filter">
        {TYPE_OPTS.map((o) => (
          <Button
            key={o.key}
            type="button"
            size="sm"
            variant={value.type === o.key ? "default" : "outline"}
            onClick={() => onChange({ ...value, type: o.key })}
            className="h-8 rounded-full px-3 text-xs"
            aria-pressed={value.type === o.key}
          >
            {o.label}
          </Button>
        ))}
      </div>
      <span className="text-muted-foreground text-xs">·</span>
      <div className="flex items-center gap-1" role="group" aria-label="Price filter">
        {PRICE_OPTS.map((o) => (
          <Button
            key={o.key}
            type="button"
            size="sm"
            variant={value.price === o.key ? "default" : "outline"}
            onClick={() => onChange({ ...value, price: o.key })}
            className="h-8 rounded-full px-3 text-xs"
            aria-pressed={value.price === o.key}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
