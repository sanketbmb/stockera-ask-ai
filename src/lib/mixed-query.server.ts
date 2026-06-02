// Phase 3D — Lazy mixed-query composer used by all three freeze server fns.
// Server-only: reads/writes queries.secondary_* via the admin client.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseSecondaryAsks } from "@/lib/secondary-asks-parser";
import {
  composeSecondaryAnswers,
  type ReportKind,
  type SecondaryAnswer,
} from "@/lib/secondary-composer";

export interface MixedQueryMeta {
  version: 1;
  parser_version: "deterministic_v1";
  signature: string;
  unsupported_flags: string[];
  clarification_needed: boolean;
  composed_at: string;
}

interface QueryRowForMixed {
  id: string;
  query_text: string | null;
  custom_question: string | null;
  query_type: string | null;
  secondary_answers: unknown;
  mixed_query_meta: unknown;
}

interface FreezeRowMinimal {
  id: string;
  query_text?: string | null;
  custom_question?: string | null;
  query_type?: string | null;
  secondary_answers?: unknown;
  mixed_query_meta?: unknown;
}

/**
 * Resolve mixed-query secondaries for a query row. Reuses persisted answers
 * when the signature matches; otherwise parses, composes, persists, and
 * emits an audit event. Failures are non-fatal — returns empty array.
 */
export async function ensureSecondaryAnswers(args: {
  row: FreezeRowMinimal;
  reportKind: ReportKind;
  primaryPayload: Record<string, unknown> | null;
  actorId: string;
}): Promise<{ answers: SecondaryAnswer[]; meta: MixedQueryMeta | null }> {
  const { row, reportKind, primaryPayload, actorId } = args;

  const rawText = [row.query_text ?? "", row.custom_question ?? ""].filter(Boolean).join(" \n ");
  const primaryIntent = row.query_type ?? null;
  const parsed = parseSecondaryAsks(rawText, primaryIntent);

  // Cache hit: signature matches a persisted artifact.
  const persistedMeta = (row.mixed_query_meta ?? null) as MixedQueryMeta | null;
  if (
    persistedMeta &&
    persistedMeta.signature === parsed.signature &&
    Array.isArray(row.secondary_answers)
  ) {
    return {
      answers: row.secondary_answers as SecondaryAnswer[],
      meta: persistedMeta,
    };
  }

  // Compose fresh.
  const answers = composeSecondaryAnswers({
    asks: parsed.secondary_asks,
    reportKind,
    primaryPayload,
  });

  const meta: MixedQueryMeta = {
    version: 1,
    parser_version: parsed.parser_version,
    signature: parsed.signature,
    unsupported_flags: parsed.unsupported_flags,
    clarification_needed: parsed.unsupported_flags.length > 0,
    composed_at: new Date().toISOString(),
  };

  // Persist (non-fatal).
  try {
    const { error } = await supabaseAdmin
      .from("queries")
      .update({
        secondary_asks: JSON.parse(JSON.stringify(parsed.secondary_asks)),
        secondary_answers: JSON.parse(JSON.stringify(answers)),
        mixed_query_meta: JSON.parse(JSON.stringify(meta)),
      } as never)
      .eq("id", row.id);
    if (error) console.warn("[mixed-query] persist failed (non-fatal):", error);
  } catch (e) {
    console.warn("[mixed-query] persist threw (non-fatal):", (e as Error).message);
  }

  // Audit (non-fatal, fire-and-forget).
  void supabaseAdmin
    .from("audit_events")
    .insert({
      event_type: "mixed_query_composed",
      actor_id: actorId,
      resource_type: "query",
      resource_id: row.id,
      payload: {
        report_kind: reportKind,
        signature: meta.signature,
        parser_version: meta.parser_version,
        secondary_ask_types: parsed.secondary_asks.map((a) => a.type),
        unsupported_flags: parsed.unsupported_flags,
        credit_action: "noop_dev_mode_mixed_query",
      },
    })
    .then(({ error }) => {
      if (error) console.warn("[mixed-query] audit failed:", error);
    });

  return { answers, meta };
}

export type { SecondaryAnswer } from "@/lib/secondary-composer";

// Expose row column list for SELECTs (single source of truth).
export const MIXED_QUERY_SELECT_COLS = "secondary_asks, secondary_answers, mixed_query_meta";

// Type helper for the row shape the composer needs.
export type { QueryRowForMixed };
