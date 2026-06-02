// Phase 3B — Sector macro-state hero. No verdict pill, no score ring.

import { Sparkles, ShieldCheck, Gauge, AlertCircle } from "lucide-react";
import type { SectorReportPayload } from "@/lib/sector-context";

const STATE_STYLES: Record<SectorReportPayload["macro_state"], { bg: string; icon: typeof Sparkles; chipClass: string }> = {
  Constructive: { bg: "from-emerald-500/10 via-emerald-500/5 to-transparent", icon: Sparkles, chipClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  Balanced:     { bg: "from-sky-500/10 via-sky-500/5 to-transparent",         icon: Gauge,    chipClass: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  Cautious:     { bg: "from-amber-500/10 via-amber-500/5 to-transparent",     icon: ShieldCheck, chipClass: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  "Coverage Limited": { bg: "from-muted/40 to-transparent",                    icon: AlertCircle, chipClass: "border-border bg-muted/40 text-muted-foreground" },
};

export function SectorSummaryHero({ payload }: { payload: SectorReportPayload }) {
  const style = STATE_STYLES[payload.macro_state];
  const Icon = style.icon;
  return (
    <section
      aria-label="Sector macro view"
      className={`relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${style.bg} px-6 py-7 md:px-8`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider ${style.chipClass}`}>
          <Icon className="h-3 w-3" /> {payload.macro_state}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Sector macro view · {payload.horizon.replace("-", " ")}
        </span>
      </div>
      <h1 className="mt-3 font-display text-2xl md:text-3xl leading-tight text-foreground">
        {payload.hero.headline}
      </h1>
      <p className="mt-1.5 text-xs text-muted-foreground italic">{payload.hero.subtext}</p>
      <div className="mt-4 space-y-2 text-sm leading-relaxed text-foreground/85 max-w-2xl">
        {payload.hero.body_lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
    </section>
  );
}
