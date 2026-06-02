// Phase 3B — Sector View 4-card grid. Two cards are deterministic data,
// two are v1.1 placeholders per the Step 0 audit conclusions.

import { Clock, TrendingUp, BookOpen, Lightbulb } from "lucide-react";
import type { SectorReportPayload } from "@/lib/sector-context";

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1.5 last:border-b-0 last:pb-0">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function Card({ title, icon: Icon, children, placeholder }: { title: string; icon: typeof TrendingUp; children: React.ReactNode; placeholder?: boolean }) {
  return (
    <section
      className={`rounded-2xl border ${placeholder ? "border-dashed border-border bg-muted/20" : "border-border bg-card/70"} px-5 py-4 shadow-card`}
      aria-label={title}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm uppercase tracking-wider text-foreground">{title}</h3>
        {placeholder && (
          <span className="ml-auto rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
            v1.1
          </span>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function SectorMetricGrid({ payload }: { payload: SectorReportPayload }) {
  const v = payload.valuation_card;
  const w = payload.what_this_means;
  return (
    <section aria-label="Sector metrics" className="grid gap-4 md:grid-cols-2">
      {/* Card A — Valuation Snapshot */}
      <Card title="Valuation Snapshot" icon={TrendingUp}>
        <MetricRow label="Sector PE (median)" value={v.pe_median != null ? `${v.pe_median}x` : "n/a"} />
        <MetricRow label="Sector PB (median)" value={v.pb_median != null ? `${v.pb_median}x` : "n/a"} />
        {v.pe_p25 != null && v.pe_p75 != null && (
          <MetricRow label="PE peer spread (p25–p75)" value={`${v.pe_p25}x – ${v.pe_p75}x`} />
        )}
        {v.return_12m_median_pct != null && (
          <MetricRow label="Trailing 12m peer-set median return" value={`${v.return_12m_median_pct}%`} />
        )}
        <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">{v.note}</p>
      </Card>

      {/* Card B — Profitability Placeholder */}
      <Card title={payload.profitability_placeholder.title} icon={BookOpen} placeholder>
        <p className="text-sm text-muted-foreground leading-relaxed">{payload.profitability_placeholder.body}</p>
      </Card>

      {/* Card C — 5Y Historical Context Placeholder */}
      <Card title={payload.historical_placeholder.title} icon={Clock} placeholder>
        <p className="text-sm text-muted-foreground leading-relaxed">{payload.historical_placeholder.body}</p>
      </Card>

      {/* Card D — What This Means */}
      <Card title={w.title} icon={Lightbulb}>
        <p className="text-sm text-foreground/85 leading-relaxed">{w.interpretation}</p>
        <p className="pt-2 text-[11px] uppercase tracking-wider text-muted-foreground">What would strengthen conviction</p>
        <ul className="space-y-1 text-xs text-muted-foreground leading-relaxed list-disc pl-4">
          {w.conviction_boosters.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
        <p className="pt-1 text-[11px] uppercase tracking-wider text-muted-foreground">What would weaken conviction</p>
        <ul className="space-y-1 text-xs text-muted-foreground leading-relaxed list-disc pl-4">
          {w.conviction_dampeners.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      </Card>
    </section>
  );
}
