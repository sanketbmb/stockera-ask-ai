// Reflective banner — preserves the user's exact wording above the
// tier-shaped report and shows the deterministic interpretation line.
// Phase 2 additions: entry tracking line, "you also mentioned" line.

import type { InterpretedQuery } from "@/lib/query-intake-parser";
import { horizonHumanLabel } from "@/lib/query-intake-parser";
import { fmtRupee } from "@/lib/position-copy";

export interface ReflectiveBannerExtras {
  entry_price?: number | null;
  qty?: number | null;
  custom_question?: string | null;
}

export function ReflectiveBanner({
  interpretation, extras,
}: {
  interpretation: InterpretedQuery;
  extras?: ReflectiveBannerExtras;
}) {
  const { rawQuestion, interpretedType, interpretedSymbol, interpretedHorizon } = interpretation;
  const entry = extras?.entry_price;
  const qty = extras?.qty;
  const custom = extras?.custom_question?.trim();

  return (
    <section
      aria-label="Your question, preserved verbatim"
      className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 px-6 py-5 shadow-card"
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Your question</p>
      <blockquote className="mt-2 font-serif italic text-lg leading-relaxed text-foreground">
        &ldquo;{rawQuestion}&rdquo;
      </blockquote>
      <p className="mt-3 text-xs text-muted-foreground italic">
        Interpreted as: <span className="font-medium not-italic text-foreground/80">{interpretedType}</span>
        {" · "}
        <span className="font-mono not-italic text-foreground/80">{interpretedSymbol}</span>
        {" · "}
        <span className="not-italic">{horizonHumanLabel(interpretedHorizon)}</span>
      </p>
      {entry != null && Number.isFinite(entry) && entry > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Entry tracked: {fmtRupee(entry)} per share{qty != null && qty > 0 ? <> × {qty} units</> : null}
        </p>
      )}
      {custom && (
        <p className="mt-1 text-xs text-muted-foreground">
          You also mentioned: &lsquo;{custom}&rsquo;
        </p>
      )}
    </section>
  );
}
