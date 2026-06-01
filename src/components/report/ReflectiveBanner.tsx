// Reflective banner — preserves the user's exact wording above the
// tier-shaped report and shows the deterministic interpretation line.
// No LLM, no emoji, PDF-safe (no motion dependency).

import type { InterpretedQuery } from "@/lib/query-intake-parser";
import { horizonHumanLabel } from "@/lib/query-intake-parser";

export function ReflectiveBanner({ interpretation }: { interpretation: InterpretedQuery }) {
  const { rawQuestion, interpretedType, interpretedSymbol, interpretedHorizon } = interpretation;
  return (
    <section
      aria-label="Your question, preserved verbatim"
      className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 px-6 py-5 shadow-card"
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Your question</p>
      <blockquote className="mt-2 font-serif italic text-lg leading-relaxed text-foreground">
        &ldquo;{rawQuestion}&rdquo;
      </blockquote>
      <p className="mt-3 text-xs text-muted-foreground">
        Interpreted as: <span className="font-medium text-foreground/80">{interpretedType}</span>
        {" · "}
        <span className="font-mono text-foreground/80">{interpretedSymbol}</span>
        {" · "}
        <span>{horizonHumanLabel(interpretedHorizon)}</span>
      </p>
    </section>
  );
}
