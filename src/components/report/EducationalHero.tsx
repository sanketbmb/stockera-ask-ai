// Phase 3C — Educational hero block. No verdict, no ring, no price.
// Renders concept name + one-line definition + difficulty + trust label.

import { GraduationCap, BookOpen } from "lucide-react";
import type { EducationalReportPayload } from "@/lib/educational-context";

const DIFFICULTY_TONE: Record<EducationalReportPayload["difficulty"], string> = {
  Beginner: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Intermediate: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  Advanced: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

export function EducationalHero({ payload }: { payload: EducationalReportPayload }) {
  return (
    <section className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 px-6 py-6 shadow-card">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
        <BookOpen className="h-3.5 w-3.5" />
        <span>Concept Brief · Educational only</span>
      </div>
      <h1 className="mt-2 font-display text-3xl md:text-4xl leading-tight text-foreground">
        {payload.concept_short_name}
      </h1>
      <p className="mt-2 text-sm md:text-base text-muted-foreground leading-relaxed">
        {payload.one_line_definition}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider ${DIFFICULTY_TONE[payload.difficulty]}`}
        >
          <GraduationCap className="h-3 w-3" />
          {payload.difficulty}
        </span>
        <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Stockera Learning Library
        </span>
      </div>
    </section>
  );
}
