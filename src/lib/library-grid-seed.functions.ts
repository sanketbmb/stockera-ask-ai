// LIB-HOTFIX-V3 — Anonymous library grid restricted to seed owner rows.
// Logged-out visitors must see ONLY reports owned by the seed account
// (Rishi: 23987140-2740-4628-af1b-6d9a8816e2f5). Ownership is not stored on
// library_items directly; we resolve it via source_table/source_id →
// queries.user_id (or answers.query_id → queries.user_id). Uses supabaseAdmin
// to bypass per-row RLS variance; SAFE projection only (no PII, no video urls,
// no raw_query_text, no user_id/email/phone/user_metadata).
import { createServerFn } from "@tanstack/react-start";
import type { LibraryGridRow } from "./library-grid-all.functions";

const SEED_OWNER_UID = "23987140-2740-4628-af1b-6d9a8816e2f5";
const LIB_COLS =
  "id, kind, source_table, source_id, symbol, symbol_exchange, title, verdict, sector, analyst_id, body_excerpt, published_at, is_public, is_tombstoned";

export const listLibraryGridForSeed = createServerFn({ method: "GET" }).handler(
  async (): Promise<LibraryGridRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) All query ids owned by the seed account.
    const { data: qs, error: qErr } = await supabaseAdmin
      .from("queries")
      .select("id")
      .eq("user_id", SEED_OWNER_UID);
    if (qErr) throw new Error(qErr.message);
    const queryIds = (qs ?? []).map((r) => r.id as string);
    if (queryIds.length === 0) return [];

    // 2) Answer ids that belong to those queries (for source_table='answers').
    const { data: ans, error: aErr } = await supabaseAdmin
      .from("answers")
      .select("id")
      .in("query_id", queryIds);
    if (aErr) throw new Error(aErr.message);
    const answerIds = (ans ?? []).map((r) => r.id as string);

    // 3) Fetch matching library_items in two parallel queries, then merge.
    const [byQ, byA] = await Promise.all([
      supabaseAdmin
        .from("library_items")
        .select(LIB_COLS)
        .eq("is_tombstoned", false)
        .eq("source_table", "queries")
        .in("source_id", queryIds),
      answerIds.length > 0
        ? supabaseAdmin
            .from("library_items")
            .select(LIB_COLS)
            .eq("is_tombstoned", false)
            .eq("source_table", "answers")
            .in("source_id", answerIds)
        : Promise.resolve({ data: [], error: null as null }),
    ]);
    if (byQ.error) throw new Error(byQ.error.message);
    if (byA.error) throw new Error(byA.error.message);

    const merged = [
      ...((byQ.data ?? []) as LibraryGridRow[]),
      ...((byA.data ?? []) as LibraryGridRow[]),
    ];
    merged.sort((a, b) => {
      const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
      const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
      return tb - ta;
    });
    return merged.slice(0, 200);
  },
);
