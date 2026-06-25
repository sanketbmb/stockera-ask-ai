// @ts-nocheck
// Stockera library-search — L3a backend.
// POST /library-search { q, limit?, kinds?, symbol? }
// Delegates content ranking to public.fn_library_search(text,int) RPC.
// Returns grouped results { stocks, reports, videos, community, analysts, total_found }.
//
// NOTE: Response shape mirrors src/types/library-search.ts (SearchResponse).
// Types are intentionally duplicated here rather than cross-imported from src/
// to keep the Deno edge runtime independent of the Vite app bundle.
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

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

    // Q-STOCKS (only if q looks tickerish).
    // TODO(L4): symbol_aliases.exchange column — currently hardcoded 'NSE'.
    const stocksPromise: Promise<Array<{ symbol: string; exchange: "NSE" | "BSE" | null }>> =
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
            const out: Array<{ symbol: string; exchange: "NSE" | "BSE" | null }> = [];
            (aliasR.data ?? []).forEach((r: { canonical_symbol: string }) => {
              if (r.canonical_symbol && !seen.has(r.canonical_symbol)) {
                seen.add(r.canonical_symbol);
                out.push({ symbol: r.canonical_symbol, exchange: "NSE" });
              }
            });
            (libR.data ?? []).forEach((r: { symbol: string; symbol_exchange: string | null }) => {
              if (r.symbol && !seen.has(r.symbol)) {
                seen.add(r.symbol);
                out.push({
                  symbol: r.symbol,
                  exchange: (r.symbol_exchange as "NSE" | "BSE" | null) ?? "NSE",
                });
              }
            });
            return out.slice(0, 3);
          })()
        : Promise.resolve([]);

    // Q-CONTENT — delegate ranking to the RPC.
    const contentPromise = (async () => {
      const { data, error } = await admin.rpc("fn_library_search", { q, limit_n: 30 });
      if (error) throw error;
      return (data ?? []) as Array<any>;
    })();

    const [stocks, contentRows] = await Promise.all([stocksPromise, contentPromise]);

    // total_found reflects full RPC row count BEFORE per-group truncation.
    const total = contentRows.length;

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
