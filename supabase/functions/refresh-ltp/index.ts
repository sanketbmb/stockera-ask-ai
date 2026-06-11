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

    // Phase 2V.2 — work set = ai_reports last 24h (NSE) UNION universe_override_symbols
    const work = new Map<string, { symbol: string; exchange: string }>();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent, error: recentErr } = await supabase
      .from("ai_reports")
      .select("stock_symbol")
      .gte("created_at", since)
      .not("stock_symbol", "is", null)
      .limit(500);
    if (recentErr) return json({ success: false, error: recentErr.message }, 500);
    for (const r of recent ?? []) {
      const sym = (r as { stock_symbol: string }).stock_symbol;
      if (!sym) continue;
      const key = `${sym}|NSE`;
      if (!work.has(key)) work.set(key, { symbol: sym, exchange: "NSE" });
    }

    const { data: cfgRow } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_value")
      .eq("config_key", "universe_override_symbols")
      .maybeSingle();
    const cfgVal = cfgRow?.config_value;
    if (Array.isArray(cfgVal)) {
      for (const item of cfgVal as Array<{ symbol?: string; exchange?: string }>) {
        if (!item?.symbol) continue;
        const ex = (item.exchange || "NSE").toUpperCase();
        const key = `${item.symbol}|${ex}`;
        if (!work.has(key)) work.set(key, { symbol: item.symbol, exchange: ex });
      }
    }

    if (work.size === 0) {
      return json({ success: true, refreshed: 0, reason: "no work" });
    }

    const allSymbols = Array.from(new Set(Array.from(work.values()).map((w) => w.symbol)));
    const { data: masters, error: masterErr } = await supabase
      .from("stock_master")
      .select("symbol, exchange, dhan_security_id, segment")
      .in("symbol", allSymbols);
    if (masterErr) return json({ success: false, error: masterErr.message }, 500);

    // Prefer master rows with segment ending in _EQ per (symbol, exchange).
    const masterByKey = new Map<string, { symbol: string; exchange: string; segment: string | null; dhan_security_id: string }>();
    for (const m of (masters ?? []) as Array<{ symbol: string; exchange: string | null; segment: string | null; dhan_security_id: string }>) {
      if (!m.dhan_security_id || !m.exchange) continue;
      const key = `${m.symbol}|${m.exchange}`;
      const existing = masterByKey.get(key);
      const prefer = (m.segment || "").endsWith("_EQ");
      const existingPrefer = existing && (existing.segment || "").endsWith("_EQ");
      if (!existing || (prefer && !existingPrefer)) {
        masterByKey.set(key, { symbol: m.symbol, exchange: m.exchange, segment: m.segment, dhan_security_id: m.dhan_security_id });
      }
    }

    const tasks: Array<{ symbol: string; exchange: string; securityId: string; segment: string }> = [];
    for (const w of work.values()) {
      const m = masterByKey.get(`${w.symbol}|${w.exchange}`);
      if (!m) continue;
      const seg = w.exchange === "BSE" ? "BSE_EQ" : "NSE_EQ";
      tasks.push({ symbol: w.symbol, exchange: w.exchange, securityId: m.dhan_security_id, segment: seg });
    }

    let ok = 0, fail = 0;
    const nowIso = new Date().toISOString();
    const BATCH = 8;
    for (let i = 0; i < tasks.length; i += BATCH) {
      const slice = tasks.slice(i, i + BATCH);
      const results = await Promise.all(
        slice.map(async (t) => {
          const ltp = await fetchDhanLtp(t.securityId, t.segment);
          return { symbol: t.symbol, exchange: t.exchange, ltp };
        }),
      );
      const upserts = results
        .filter((r) => r.ltp !== null)
        .map((r) => ({
          symbol: r.symbol,
          exchange: r.exchange,
          ltp: r.ltp!,
          source: "dhan_live",
          fetched_at: nowIso,
          as_of: nowIso,
        }));
      ok += upserts.length;
      fail += results.length - upserts.length;
      if (upserts.length > 0) {
        const { error: upErr } = await supabase.from("ltp_cache").upsert(upserts, { onConflict: "symbol" });
        if (upErr) console.error("ltp_cache upsert error:", upErr.message);

        const historyRows = upserts.map((u) => ({
          symbol: u.symbol, ltp: u.ltp, source: "dhan_live", recorded_at: u.fetched_at,
        }));
        const { error: histErr } = await supabase.from("ltp_history").insert(historyRows);
        if (histErr) console.error("ltp_history insert error:", histErr.message);
      }
    }

    // Audit log
    await supabase.from("cron_run_log").insert({
      job_name: "refresh-ltp-every-minute",
      status: fail === 0 ? "ok" : (ok === 0 ? "error" : "partial"),
      rows_affected: ok,
      details: { failed: fail, total: tasks.length, work_set_size: work.size },
    });

    return json({ success: true, refreshed: ok, failed: fail, total: tasks.length });
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
