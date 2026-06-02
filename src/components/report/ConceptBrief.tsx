// Phase 3C — Structured concept brief sections. Each subsection renders
// only when source-backed content is present. No placeholders for missing
// sections (except the brief-approved "worked example coming in v1.1" card).

import type { EducationalReportPayload } from "@/lib/educational-context";

function SectionShell({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/70 px-6 py-5 shadow-card">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <h3 className="mt-1 font-display text-base text-foreground">{title}</h3>
      <div className="mt-3 text-sm text-foreground/85 leading-relaxed">{children}</div>
    </section>
  );
}

export function ConceptBrief({ payload }: { payload: EducationalReportPayload }) {
  const s = payload.sections;
  return (
    <div className="space-y-4">
      <SectionShell label="A · Definition" title="What it means">
        <p>{s.what_it_means}</p>
      </SectionShell>

      {s.why_it_matters && (
        <SectionShell label="B · Context" title="Why it matters">
          <p>{s.why_it_matters}</p>
        </SectionShell>
      )}

      {s.how_to_read && (
        <SectionShell label="C · Interpretation" title="How to read it">
          <p>{s.how_to_read}</p>
          {s.formula && (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground bg-muted/30 rounded-md px-3 py-2 border border-border/60 whitespace-pre-wrap">
              {s.formula}
            </p>
          )}
        </SectionShell>
      )}

      {s.worked_example_pending && (
        <SectionShell label="D · Example" title="Worked example">
          <p className="text-muted-foreground italic">
            A worked example with chart and numbers is being prepared for the v1.1 learning library update.
          </p>
        </SectionShell>
      )}

      {s.appears_in.length > 0 && (
        <SectionShell label="E · Inside Stockera" title="Where it appears in Stockera">
          <div className="flex flex-wrap gap-2">
            {s.appears_in.map((card) => (
              <span
                key={card}
                className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-[12px] text-foreground/90"
              >
                {card}
              </span>
            ))}
          </div>
        </SectionShell>
      )}

      {s.common_mistake && (
        <SectionShell label="F · Pitfall" title="Common mistake">
          <p>{s.common_mistake}</p>
        </SectionShell>
      )}

      {s.related.length > 0 && (
        <SectionShell label="G · Adjacent" title="Related concepts">
          <div className="flex flex-wrap gap-2">
            {s.related.map((r) => (
              <span
                key={r}
                className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[12px] text-primary"
              >
                {r}
              </span>
            ))}
          </div>
        </SectionShell>
      )}
    </div>
  );
}
