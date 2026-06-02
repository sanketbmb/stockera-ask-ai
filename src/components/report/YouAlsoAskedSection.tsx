// Phase 3D — "You also asked" section.
// Renders 1-2 secondary answers below the primary report body. Hidden when
// nothing valid resolved. Uses semantic design tokens only.

import type { SecondaryAnswer } from "@/lib/secondary-composer";

const TYPE_LABEL: Record<SecondaryAnswer["type"], string> = {
  explain_metric: "Concept",
  key_risks: "Risks",
  reentry_clarification: "Re-entry",
  news_clarification: "News",
  alternatives_same_sector: "Alternatives",
};

export function YouAlsoAskedSection({
  answers,
}: {
  answers: SecondaryAnswer[] | null | undefined;
}) {
  if (!answers || answers.length === 0) return null;

  return (
    <section
      aria-label="You also asked"
      className="mx-auto w-full max-w-5xl px-4 md:px-6 py-6"
    >
      <header className="mb-3 flex items-baseline gap-2">
        <h2 className="font-display text-xl text-foreground">You also asked</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          deterministic · derived from your question
        </span>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {answers.map((a, i) => (
          <article
            key={`${a.type}-${i}`}
            className="rounded-2xl border border-border bg-card/70 px-5 py-4 shadow-card"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider rounded border border-border bg-muted/40 px-1.5 py-0.5 text-muted-foreground">
                {TYPE_LABEL[a.type]}
              </span>
              {a.status === "fallback" && (
                <span className="font-mono text-[10px] uppercase tracking-wider rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                  honest fallback
                </span>
              )}
            </div>
            <h3 className="mt-2 font-display text-base text-foreground">{a.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{a.body}</p>
            <p className="mt-3 font-mono text-[10px] text-muted-foreground">
              source: {String(a.provenance.source ?? "—")}
              {a.provenance.concept_canonical
                ? <> · concept: {String(a.provenance.concept_canonical)}</>
                : null}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
