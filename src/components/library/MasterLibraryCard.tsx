import { AuthGatedReportLink } from "@/components/common/AuthGatedReportLink";
import { cn } from "@/lib/utils";
import { VERDICT_TONE_FILLED } from "@/lib/verdictTone";

export type MasterLibraryRow = {
  id: string;
  kind: string | null;
  source_table: string | null;
  source_id: string | null;
  symbol: string | null;
  symbol_exchange: string | null;
  title: string;
  verdict: string | null;
  sector: string | null;
  analyst_id: string | null;
  body_excerpt: string | null;
  published_at: string | null;
  is_public: boolean | null;
  is_tombstoned: boolean | null;
};

function normalizeVerdict(v: string | null): string | null {
  if (!v) return null;
  return v.toUpperCase().replace(/_/g, " ");
}

function verdictClass(v: string): string {
  return VERDICT_TONE_FILLED[v] ?? "bg-muted text-muted-foreground";
}

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const sec = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

interface Props {
  item: MasterLibraryRow;
}

export function MasterLibraryCard({ item }: Props) {
  const verdict = normalizeVerdict(item.verdict);
  const isQueryReport = item.source_table === "queries" && !!item.source_id;

  const body = (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {item.symbol && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-primary">
            {item.symbol}
          </span>
        )}
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

      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
        {item.title}
      </h3>

      {item.body_excerpt && (
        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {item.body_excerpt}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between pt-2 text-[11px]">
        <span className="text-muted-foreground">{relativeDate(item.published_at)}</span>
        {isQueryReport ? (
          <span className="inline-flex items-center gap-1 font-medium text-primary">
            View full answer
            <span aria-hidden className="nudge-right">→</span>
          </span>
        ) : (
          <span
            className="text-muted-foreground/70"
            title="Available soon (L4C-3)"
          >
            View full answer →
          </span>
        )}
      </div>
    </div>
  );

  const baseClasses =
    "card-lift group block h-full rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

  if (isQueryReport) {
    return (
      <AuthGatedReportLink
        queryId={item.source_id as string}
        className={baseClasses}
        aria-label={`View full answer: ${item.title}`}
      >
        {body}
      </AuthGatedReportLink>
    );
  }

  return (
    <div
      className={cn(baseClasses, "cursor-default opacity-90")}
      aria-disabled="true"
    >
      {body}
    </div>
  );
}

export default MasterLibraryCard;
