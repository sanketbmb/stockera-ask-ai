/**
 * refresh-ltp — pg_cron-callable LTP refresher.
 *
 * Iterates the most recently queried symbols (from ai_reports in the last 24h),
 * calls dhan-fetch /ltp for each, and upserts public.ltp_cache.
 *
 * Intended cadence: every minute during NSE market hours (09:15–15:30 IST, Mon–Fri).
 * Skips silently outside market hours.
 *
 * Auth: protected by Supabase apikey header (anon or service-role both accepted).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NSE_HOLIDAYS_2026 = new Set<string>([
  "2026-01-26", "2026-03-03", "2026-03-19", "2026-04-03", "2026-04-14",
  "2026-05-01", "2026-05-27", "2026-08-15", "2026-09-17", "2026-10-02",
  "2026-10-21", "2026-11-25", "2026-12-25",
]);

function marketOpen(): { open: boolean; reason: string } {
  const now = new Date();
  const istMs = now.getTime() + (5 * 60 + 30) * 60_000;
  const ist = new Date(istMs);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return { open: false, reason: "weekend" };
  const dateStr = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
  if (NSE_HOLIDAYS_2026.has(dateStr)) return { open: false, reason: "holiday" };
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (mins < 9 * 60 + 15 || mins > 15 * 60 + 30) return { open: false, reason: "closed" };
  return { open: true, reason: "open" };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface MasterRow {
  symbol: string;
  dhan_security_id: string;
  segment: string | null;
}

async function fetchDhanLtp(securityId: string, segment: string): Promise<number | null> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/dhan-fetch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ endpoint: "ltp", securityId, exchangeSegment: segment }),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) : {}; } catch { /* */ }
  if (!res.ok || body.success !== true) return null;
  const data = body.data as Record<string, unknown> | undefined;
  const inner = data?.data as Record<string, unknown> | undefined;
  const seg = inner?.[segment] as Record<string, unknown> | undefined;
  const node = seg?.[securityId] as Record<string, unknown> | undefined;
  const ltp = node?.last_price ?? node?.ltp ?? node?.lastPrice;
  return typeof ltp === "number" && ltp > 0 ? ltp : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";
    const mkt = marketOpen();
    if (!mkt.open && !force) {
      return json({ success: true, skipped: true, reason: mkt.reason });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Symbols queried in last 24h — bounded set, scales with real usage
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent, error: recentErr } = await supabase
      .from("ai_reports")
      .select("stock_symbol")
      .gte("created_at", since)
      .not("stock_symbol", "is", null)
      .limit(500);
    if (recentErr) return json({ success: false, error: recentErr.message }, 500);

    const symbols = Array.from(new Set((recent ?? []).map((r) => (r as { stock_symbol: string }).stock_symbol).filter(Boolean)));
    if (symbols.length === 0) {
      return json({ success: true, refreshed: 0, reason: "no recent symbols" });
    }

    const { data: masters, error: masterErr } = await supabase
      .from("stock_master")
      .select("symbol, dhan_security_id, segment")
      .in("symbol", symbols);
    if (masterErr) return json({ success: false, error: masterErr.message }, 500);

    const rows = (masters ?? []) as MasterRow[];
    let ok = 0, fail = 0;
    const nowIso = new Date().toISOString();
    // Throttle in small batches to avoid Dhan rate limit
    const BATCH = 8;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const results = await Promise.all(
        slice.map(async (m) => {
          const seg = (m.segment === "BSE_EQ" ? "BSE_EQ" : "NSE_EQ");
          const ltp = await fetchDhanLtp(m.dhan_security_id, seg);
          return { symbol: m.symbol, ltp };
        }),
      );
      const upserts = results
        .filter((r) => r.ltp !== null)
        .map((r) => ({ symbol: r.symbol, ltp: r.ltp!, source: "dhan", fetched_at: nowIso }));
      ok += upserts.length;
      fail += results.length - upserts.length;
      if (upserts.length > 0) {
        const { error: upErr } = await supabase.from("ltp_cache").upsert(upserts, { onConflict: "symbol" });
        if (upErr) console.error("ltp_cache upsert error:", upErr.message);

        // Append to ltp_history (7-day retention, cleaned by cleanup-ltp-history-daily cron)
        const historyRows = upserts.map((u) => ({
          symbol: u.symbol, ltp: u.ltp, source: u.source, recorded_at: u.fetched_at,
        }));
        const { error: histErr } = await supabase.from("ltp_history").insert(historyRows);
        if (histErr) console.error("ltp_history insert error:", histErr.message);
      }
    }

    // Audit log
    const { error: logErr } = await supabase.from("cron_run_log").insert({
      job_name: "refresh-ltp-every-minute",
      status: fail === 0 ? "ok" : (ok === 0 ? "error" : "partial"),
      rows_affected: ok,
      details: { failed: fail, total: rows.length, symbols_considered: symbols.length },
    });
    if (logErr) console.error("cron_run_log insert error:", logErr.message);

    return json({ success: true, refreshed: ok, failed: fail, total: rows.length });
  } catch (e) {
    console.error("refresh-ltp error:", e);
    try {
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await supabase.from("cron_run_log").insert({
        job_name: "refresh-ltp-every-minute",
        status: "error",
        rows_affected: 0,
        details: { error: String(e) },
      });
    } catch { /* swallow */ }
    return json({ success: false, error: String(e) }, 500);
  }
});
