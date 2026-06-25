// @ts-nocheck
// Stockera library-symbol — L4a backend.
// POST /library-symbol { symbol, kind?, limit? }
// Returns per-symbol public library data: counts (over the FULL public
// non-tombstoned set for the symbol), a limited list of items, and a
// deterministic FAQ list. No LLM, no ranking — symbol is the filter.
//
// Response shape mirrors src/types/library-symbol.ts (SymbolLibraryResponse).
// Types are intentionally duplicated here so this Deno edge runtime does not
// depend on the Vite app bundle.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "*";

const CORS = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Kind = "all" | "report" | "video" | "community_query";
const ALLOWED_KINDS: Kind[] = ["all", "report", "video", "community_query"];
const VERDICTS_FOR_FAQ = new Set(["HOLD", "BUY", "AVERAGE", "EXIT", "PARTIAL_EXIT", "WAIT"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const rawSymbol = (body?.symbol ?? "").toString().trim();
    if (!rawSymbol) return json({ error: "empty_symbol" }, 400);
    if (rawSymbol.length > 80) return json({ error: "symbol_too_long" }, 400);

    let limit = Number.isFinite(body?.limit) ? Math.floor(body.limit) : 24;
    if (!Number.isFinite(limit)) limit = 24;
    limit = Math.max(1, Math.min(100, limit));

    const kindIn = (body?.kind ?? "all") as Kind;
    const kind: Kind = ALLOWED_KINDS.includes(kindIn) ? kindIn : "all";

    // Step 2 — normalize
    const { data: normRow } = await admin.rpc("fn_normalize_symbol", { raw: rawSymbol });
    const normalized: string | null =
      typeof normRow === "string" && normRow.length > 0 ? normRow : null;

    if (!normalized) {
      return json({
        input_symbol: rawSymbol,
        normalized_symbol: null,
        counts: { all: 0, reports: 0, videos: 0, community: 0 },
        items: [],
        faq_questions: [],
      });
    }

    // Step 3 — fetch limited rows
    let q = admin
      .from("library_items")
      .select(
        "id, kind, source_id, source_table, symbol, symbol_exchange, title, verdict, sector, analyst_id, body_excerpt, view_count, published_at",
      )
      .eq("is_public", true)
      .eq("is_tombstoned", false)
      .eq("symbol", normalized)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("view_count", { ascending: false })
      .limit(limit);
    if (kind !== "all") q = q.eq("kind", kind);
    const { data: rows, error: rowsErr } = await q;
    if (rowsErr) throw rowsErr;
    const items = (rows ?? []) as Array<any>;

    // Step 4 — enrich answer-backed rows with parent query_id
    const answerIds = items
      .filter((r) => r.source_table === "answers")
      .map((r) => r.source_id as string);
    const answerToQuery = new Map<string, string | null>();
    if (answerIds.length > 0) {
      const { data: aRows } = await admin
        .from("answers")
        .select("id, query_id")
        .in("id", answerIds);
      (aRows ?? []).forEach((r: { id: string; query_id: string | null }) => {
        answerToQuery.set(r.id, r.query_id ?? null);
      });
    }

    // Step 5 — enrich analyst data
    const analystIds = Array.from(
      new Set(items.map((r) => r.analyst_id).filter((x): x is string => !!x)),
    );
    const analystMap = new Map<string, { name: string | null; sebi: string | null }>();
    if (analystIds.length > 0) {
      const { data: apRows } = await admin
        .from("analyst_profiles")
        .select("id, display_name, sebi_reg_number")
        .in("id", analystIds);
      (apRows ?? []).forEach(
        (r: { id: string; display_name: string | null; sebi_reg_number: string | null }) => {
          analystMap.set(r.id, { name: r.display_name, sebi: r.sebi_reg_number });
        },
      );
    }

    const enrichedItems = items.map((r) => {
      const related_query_id =
        r.source_table === "queries"
          ? (r.source_id as string)
          : r.source_table === "answers"
            ? (answerToQuery.get(r.source_id) ?? null)
            : null;
      const a = r.analyst_id ? analystMap.get(r.analyst_id) : undefined;
      return {
        id: r.id,
        kind: r.kind,
        source_id: r.source_id,
        source_table: r.source_table,
        related_query_id,
        symbol: r.symbol,
        symbol_exchange: r.symbol_exchange,
        title: r.title,
        verdict: r.verdict,
        sector: r.sector,
        analyst_id: r.analyst_id,
        analyst_name: a?.name ?? null,
        analyst_sebi_reg_number: a?.sebi ?? null,
        body_excerpt: r.body_excerpt,
        view_count: r.view_count ?? 0,
        published_at: r.published_at,
      };
    });

    // Step 6 — counts over FULL public non-tombstoned set for this symbol
    const { data: allKindRows, error: cntErr } = await admin
      .from("library_items")
      .select("kind, verdict")
      .eq("is_public", true)
      .eq("is_tombstoned", false)
      .eq("symbol", normalized);
    if (cntErr) throw cntErr;
    const fullSet = (allKindRows ?? []) as Array<{ kind: string; verdict: string | null }>;
    const counts = {
      all: fullSet.length,
      reports: fullSet.filter((r) => r.kind === "report").length,
      videos: fullSet.filter((r) => r.kind === "video").length,
      community: fullSet.filter((r) => r.kind === "community_query").length,
    };

    // Step 7 — deterministic FAQ
    const faq_questions: string[] = [];
    if (fullSet.length > 0) {
      const seen = new Set<string>();
      const push = (s: string) => {
        if (!seen.has(s)) {
          seen.add(s);
          faq_questions.push(s);
        }
      };
      push(`Should I buy ${normalized} now?`);
      if (fullSet.some((r) => r.kind === "report")) {
        push(`What is the latest analyst view on ${normalized}?`);
      }
      if (fullSet.some((r) => r.kind === "video")) {
        push(`Are there expert videos on ${normalized}?`);
      }
      if (fullSet.some((r) => r.verdict && VERDICTS_FOR_FAQ.has(r.verdict))) {
        push(`What are investors asking about ${normalized}?`);
      }
    }

    return json({
      input_symbol: rawSymbol,
      normalized_symbol: normalized,
      counts,
      items: enrichedItems,
      faq_questions: faq_questions.slice(0, 4),
    });
  } catch (_e) {
    return json(
      {
        error: "library_symbol_failed",
        message: "Unable to load symbol library right now.",
      },
      500,
    );
  }
});
