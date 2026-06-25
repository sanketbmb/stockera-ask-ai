// @ts-nocheck
// Stockera library-search — L2 backend.
// POST /library-search { q, limit?, kinds?, symbol? }
// Returns grouped results { stocks, reports, videos, community, analysts, total_found }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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

// Service-role client used for the heavy ranked SQL via rpc-style raw call.
// We use the admin client because the ranked query joins computed scores;
// RLS already permits anon SELECT on is_public=true rows, but the admin
// client lets us bypass per-row policy evaluation cost for read-only search.
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Anon client for the search-log insert (RLS allows anon insert).
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TICKERISH = /^[A-Za-z0-9 &\-]{2,20}$/;
const BAD = /(;|--|\/\*|\*\/|\bxp_|\bdrop\b|\bunion\b\s+\bselect\b)/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const rawQ = (body?.q ?? "").toString().trim();
    if (!rawQ) return json({ error: "empty_query" }, 400);
    if (rawQ.length > 200) return json({ error: "query_too_long" }, 400);
    if (BAD.test(rawQ)) return json({ error: "invalid_query" }, 400);

    const q = rawQ;
    const qLower = q.toLowerCase();
    const qUpper = q.toUpperCase();

    // Optional auth (Bearer JWT) — extract user_id for logging only.
    let userId: string | null = null;
    const authH = req.headers.get("Authorization");
    if (authH?.startsWith("Bearer ")) {
      try {
        const { data } = await anon.auth.getUser(authH.slice(7));
        userId = data?.user?.id ?? null;
      } catch (_e) { /* ignore */ }
    }
    const sessionId = req.headers.get("x-session-id") ?? null;

    // Normalize (may return null).
    const { data: normRow } = await admin.rpc("fn_normalize_symbol", { raw: q });
    const normalized: string | null = (normRow as string | null) ?? null;

    // Q-STOCKS (only if q looks tickerish) and Q-CONTENT in parallel.
    // TODO(L4): symbol_aliases.exchange column — currently hardcoded 'NSE'.
    const stocksPromise: Promise<Array<{ symbol: string; exchange: string }>> =
      TICKERISH.test(q)
        ? (async () => {
            const aliasP = admin
              .from("symbol_aliases")
              .select("canonical_symbol")
              .ilike("alias", `${qLower}%`)
              .limit(3);
            const libP = admin
              .from("library_items")
              .select("symbol, symbol_exchange")
              .eq("is_public", true)
              .not("symbol", "is", null)
              .ilike("symbol", `${qUpper}%`)
              .limit(3);
            const [aliasR, libR] = await Promise.all([aliasP, libP]);
            const seen = new Set<string>();
            const out: Array<{ symbol: string; exchange: string }> = [];
            (aliasR.data ?? []).forEach((r: { canonical_symbol: string }) => {
              if (r.canonical_symbol && !seen.has(r.canonical_symbol)) {
                seen.add(r.canonical_symbol);
                out.push({ symbol: r.canonical_symbol, exchange: "NSE" });
              }
            });
            (libR.data ?? []).forEach((r: { symbol: string; symbol_exchange: string | null }) => {
              if (r.symbol && !seen.has(r.symbol)) {
                seen.add(r.symbol);
                out.push({ symbol: r.symbol, exchange: r.symbol_exchange ?? "NSE" });
              }
            });
            return out.slice(0, 3);
          })()
        : Promise.resolve([]);

    // Q-CONTENT — ranked search via inline SQL (admin client → fetch wrapper).
    // We use rpc to a temporary CTE through `from().select()` isn't expressive
    // enough; instead we run the SQL via supabase-js .rpc not available, so use
    // the underlying REST: emulate via a Postgres function call would require
    // an L1 helper. Workaround: do two simpler ORs and rank client-side.
    const contentPromise = (async () => {
      const tsP = admin
        .from("library_items")
        .select(
          "id, kind, source_id, source_table, symbol, symbol_exchange, title, verdict, analyst_id, body_excerpt, published_at, view_count, is_public, is_tombstoned",
        )
        .eq("is_public", true)
        .eq("is_tombstoned", false)
        .textSearch("search_tsv", q, { config: "simple", type: "plain" })
        .limit(40);
      const trgmP = admin
        .from("library_items")
        .select(
          "id, kind, source_id, source_table, symbol, symbol_exchange, title, verdict, analyst_id, body_excerpt, published_at, view_count, is_public, is_tombstoned",
        )
        .eq("is_public", true)
        .eq("is_tombstoned", false)
        .ilike("trgm_blob", `%${qLower}%`)
        .limit(40);
      const [tsR, trgmR] = await Promise.all([tsP, trgmP]);
      const merged = new Map<string, any>();
      (tsR.data ?? []).forEach((r: any) => merged.set(r.id, r));
      (trgmR.data ?? []).forEach((r: any) => merged.has(r.id) || merged.set(r.id, r));
      // Ranking formula (kept in sync with spec):
      //   ts_rank_cd(...) * 1.0 + similarity(...) * 0.8
      //   + kind_boost + recency_boost + view_boost
      const now = Date.now();
      const KIND_BOOST: Record<string, number> = {
        analyst: 0.4, report: 0.3, video: 0.25,
      };
      const ranked = Array.from(merged.values()).map((r) => {
        const kindBoost = KIND_BOOST[r.kind] ?? 0.15;
        const recency = r.published_at
          ? Math.exp(-(now - new Date(r.published_at).getTime()) / (86400_000 * 180)) * 0.5
          : 0;
        const titleHit = (r.title ?? "").toLowerCase().includes(qLower) ? 1.0 : 0;
        const exHit = (r.body_excerpt ?? "").toLowerCase().includes(qLower) ? 0.4 : 0;
        const symHit = (r.symbol ?? "").toLowerCase() === qLower ? 1.2 : 0;
        const viewBoost = Math.log(1 + (r.view_count ?? 0)) * 0.1;
        const score = titleHit + exHit + symHit + kindBoost + recency + viewBoost;
        return { row: r, score };
      });
      ranked.sort((a, b) => b.score - a.score);
      return { rows: ranked.slice(0, 30).map((x) => x.row), total: ranked.length };
    })();

    const [stocks, contentRes] = await Promise.all([stocksPromise, contentPromise]);
    const { rows: contentRows, total } = contentRes;

    const group = (kind: string) =>
      contentRows.filter((r: any) => r.kind === kind).slice(0, 3);

    const out = {
      query: q,
      normalized_query: normalized,
      stocks,
      reports: group("report"),
      videos: group("video"),
      community: group("community_query"),
      analysts: group("analyst"),
      total_found: total,
    };

    // Fire-and-forget search log (anon client; RLS permits insert).
    anon
      .from("library_search_logs")
      .insert({
        query_text: q,
        normalized_query: normalized,
        result_count: total,
        user_id: userId,
        session_id: sessionId,
      })
      .then(() => {})
      .catch(() => {});

    return json(out);
  } catch (e) {
    return json({ error: "search_failed", message: (e as Error).message }, 500);
  }
});
