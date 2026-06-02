// Phase 3C — Educational report freeze/read server fn.
// Mirrors freeze-report.functions.ts and sector-report.functions.ts but for
// query_type === "educational". On first call: resolves canonical concept,
// composes deterministic payload from the glossary, freezes into
// queries.ai_report. On subsequent calls: reads the frozen artifact directly.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  composeEducationalReport,
  type EducationalReportPayload,
} from "@/lib/educational-context";
import { resolveConcept, suggestConcepts } from "@/lib/concept-alias-map";
import { meteringFor } from "@/lib/credit-metering";
import { ensureSecondaryAnswers, type SecondaryAnswer } from "@/lib/mixed-query.server";

const Input = z.object({
  queryId: z.string().uuid(),
  forceRefresh: z.boolean().optional(),
});

export type EducationalFreezeResult =
  | {
      ok: true;
      payload: EducationalReportPayload;
      served_from_cache: boolean;
      frozen_at: string;
      secondary_answers: SecondaryAnswer[];
    }
  | {
      ok: false;
      code: "CONCEPT_NOT_RESOLVED";
      raw_input: string | null;
      suggestions: string[];
    };

export const freezeOrReadEducationalReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }): Promise<EducationalFreezeResult> => {
    const { userId } = context;

    const { data: row, error: readErr } = await supabaseAdmin
      .from("queries")
      .select(
        "id, user_id, query_type, engine_version, ai_report, frozen_at, query_text, custom_question, concept_canonical, educational_difficulty, router_meta, secondary_asks, secondary_answers, mixed_query_meta",
      )
      .eq("id", data.queryId)
      .single();
    if (readErr || !row) throw new Error(`Query not found: ${readErr?.message ?? data.queryId}`);
    if (row.user_id !== userId) throw new Error("Not authorized to read this report");
    if (row.query_type !== "educational") {
      throw new Error("freezeOrReadEducationalReport only handles educational records");
    }

    // ── Cache hit ──
    if (!data.forceRefresh && row.ai_report && row.frozen_at) {
      const cached = row.ai_report as unknown as EducationalReportPayload;
      if (cached?.schema_version === "v1_educational") {
        const { answers } = await ensureSecondaryAnswers({
          row: row as never,
          reportKind: "educational",
          primaryPayload: cached as unknown as Record<string, unknown>,
          actorId: userId,
        });
        return {
          ok: true,
          payload: cached,
          served_from_cache: true,
          frozen_at: row.frozen_at as string,
          secondary_answers: answers,
        };
      }
    }

    // ── Resolve canonical concept ──
    // Priority: persisted concept_canonical -> query_text -> custom_question.
    const candidates: string[] = [];
    if (row.concept_canonical) candidates.push(row.concept_canonical as string);
    if (row.query_text) candidates.push(row.query_text as string);
    if (row.custom_question) candidates.push(row.custom_question as string);

    let resolvedCanonical: string | null = null;
    for (const c of candidates) {
      const r = resolveConcept(c);
      if (r) {
        resolvedCanonical = r.canonical;
        break;
      }
    }

    if (!resolvedCanonical) {
      return {
        ok: false,
        code: "CONCEPT_NOT_RESOLVED",
        raw_input: candidates[0] ?? null,
        suggestions: suggestConcepts(candidates[0] ?? "", 5),
      };
    }

    // ── Compose + freeze ──
    const frozenAt = new Date().toISOString();
    const payload = composeEducationalReport(resolvedCanonical, frozenAt);
    const decision = meteringFor("post_query_educational");

    const { error: updErr } = await supabaseAdmin
      .from("queries")
      .update({
        ai_report: JSON.parse(JSON.stringify(payload)),
        frozen_at: frozenAt,
        report_artifact_status: "frozen",
        engine_version: "v1_educational",
        engine_source: "glossary_library",
        concept_canonical: payload.concept_canonical,
        educational_difficulty: payload.difficulty,
        status: "ai_answered",
      } as never)
      .eq("id", row.id);
    if (updErr) console.warn("[freezeOrReadEducationalReport] persist failed (non-fatal):", updErr);

    await supabaseAdmin
      .from("audit_events")
      .insert({
        event_type: "educational_report_frozen",
        actor_id: userId,
        resource_type: "query",
        resource_id: row.id,
        payload: {
          concept_canonical: payload.concept_canonical,
          difficulty: payload.difficulty,
          frozen_at: frozenAt,
          metering_mode: decision.metering_mode,
          credit_action: decision.credit_action,
          engine_version: "v1_educational",
          engine_source: "glossary_library",
          library_version: payload.audit_footer.library_version,
        },
      })
      .then(({ error }) => {
        if (error) console.warn("[freezeOrReadEducationalReport] audit failed:", error);
      });

    const { answers: secondaryAnswers } = await ensureSecondaryAnswers({
      row: row as never,
      reportKind: "educational",
      primaryPayload: payload as unknown as Record<string, unknown>,
      actorId: userId,
    });

    return { ok: true, payload, served_from_cache: false, frozen_at: frozenAt, secondary_answers: secondaryAnswers };
  });
