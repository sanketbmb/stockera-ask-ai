import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  currentPage: number;
  totalPages: number;
  onPageChange: (n: number) => void;
};

function buildPageList(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const out: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) {
      out.push("ellipsis");
    }
  }
  return out;
}

export function MasterLibraryPagination({ currentPage, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;
  const pages = buildPageList(currentPage, totalPages);
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  const baseBtn =
    "chip-press inline-flex h-9 items-center justify-center rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent/30 hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-40";
  const activeBtn =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-primary bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm";
  const numberBtn =
    "chip-press inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent/30 hover:border-primary/40";

  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-1.5">
      <button
        type="button"
        className={baseBtn}
        disabled={prevDisabled}
        onClick={() => !prevDisabled && onPageChange(currentPage - 1)}
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        Prev
      </button>
      {pages.map((p, idx) =>
        p === "ellipsis" ? (
          <span
            key={`ellipsis-${idx}`}
            className="inline-flex h-9 min-w-9 items-center justify-center px-1 text-sm text-muted-foreground"
            aria-hidden="true"
          >
            …
          </span>
        ) : p === currentPage ? (
          <button
            key={p}
            type="button"
            aria-current="page"
            className={activeBtn}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ) : (
          <button
            key={p}
            type="button"
            className={numberBtn}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className={baseBtn}
        disabled={nextDisabled}
        onClick={() => !nextDisabled && onPageChange(currentPage + 1)}
      >
        Next
        <ChevronRight className="ml-1 h-4 w-4" />
      </button>
    </nav>
  );
}
