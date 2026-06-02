// Phase 3C — Deterministic Educational composer.
// Pure function. No LLM, no network, no fabrication.
// Mirrors the pattern of sector-context.ts.

import {
  GLOSSARY,
  type GlossaryEntry,
  type DifficultyTag,
} from "@/content/educational-glossary";

export interface EducationalReportPayload {
  schema_version: "v1_educational";
  concept_canonical: string;
  concept_short_name: string;
  difficulty: DifficultyTag;
  one_line_definition: string;

  sections: {
    what_it_means: string;
    why_it_matters: string | null;
    how_to_read: string | null;
    formula: string | null;
    worked_example_pending: boolean;
    appears_in: string[];
    common_mistake: string | null;
    related: string[];
  };

  audit_footer: {
    engine_version: "v1_educational";
    engine_source: "glossary_library";
    concept_canonical: string;
    difficulty: DifficultyTag;
    generated_at: string; // ISO timestamp, set by the freezer
    library_version: "v1.0";
  };
}

export function composeEducationalReport(canonical: string, generatedAt: string): EducationalReportPayload {
  const entry: GlossaryEntry | undefined = GLOSSARY[canonical];
  if (!entry) {
    // The server fn should never call this without a valid canonical;
    // throw so the failure surfaces in audit_events rather than silently
    // returning fabricated content.
    throw new Error(`composeEducationalReport: unknown concept "${canonical}"`);
  }

  return {
    schema_version: "v1_educational",
    concept_canonical: entry.canonical,
    concept_short_name: entry.short_name,
    difficulty: entry.difficulty,
    one_line_definition: entry.one_line_definition,
    sections: {
      what_it_means: entry.what_it_means,
      why_it_matters: entry.why_it_matters ?? null,
      how_to_read: entry.how_to_read ?? null,
      formula: entry.formula ?? null,
      worked_example_pending: true,
      appears_in: entry.appears_in.slice(0, 6),
      common_mistake: entry.common_mistake ?? null,
      related: entry.related.slice(0, 5),
    },
    audit_footer: {
      engine_version: "v1_educational",
      engine_source: "glossary_library",
      concept_canonical: entry.canonical,
      difficulty: entry.difficulty,
      generated_at: generatedAt,
      library_version: "v1.0",
    },
  };
}
