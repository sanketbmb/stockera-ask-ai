/**
 * snapshot-ltp-close — Phase 2V.2
 *
 * Runs at 15:29 IST on NSE trading days. Calls Dhan /marketfeed/ltp for the
 * bounded work set (ai_reports last 24h UNION universe_override_symbols) and
 * upserts ltp_cache rows with source='dhan_close'. If Dhan returns null for a
 * symbol, the existing row is left untouched (no fabrication).
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

function inCloseWindow(): { ok: boolean; reason: string } {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60_000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return { ok: false, reason: "weekend" };
  const dateStr = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
  if (NSE_HOLIDAYS_2026.has(dateStr)) return { ok: false, reason: "holiday" };
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  // 15:28 -> 15:31 IST tolerance window
  if (mins < 15 * 60 + 28 || mins > 15 * 60 + 31) return { ok: false, reason: "not_close_window" };
  return { ok: true, reason: "close_window" };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

interface WorkItem { symbol: string; exchange: string; }
interface MasterRow {
  symbol: string;
  exchange: string | null;
  segment: string | null;
  dhan_security_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    let force = false;
    let invokedBy = "cron";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && (body.force === 1 || body.force === true || body.force === "1")) force = true;
        if (body && typeof body.invoked_by === "string") invokedBy = body.invoked_by;
      } catch { /* empty body ok */ }
    }
    const url = new URL(req.url);
    if (url.searchParams.get("force") === "1") force = true;

    const win = inCloseWindow();
    if (!win.ok && !force) {
      return json({ success: true, skipped: true, reason: win.reason });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Build work set: ai_reports last 24h (NSE default) UNION universe_override_symbols
    const work = new Map<string, WorkItem>(); // key = `${symbol}|${exchange}`
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("ai_reports")
      .select("stock_symbol")
      .gte("created_at", since)
      .not("stock_symbol", "is", null)
      .limit(500);
    for (const r of recent ?? []) {
      const sym = (r as { stock_symbol: string }).stock_symbol;
      if (!sym) continue;
      const key = `${sym}|NSE`;
      if (!work.has(key)) work.set(key, { symbol: sym, exchange: "NSE" });
    }

    const { data: cfgRows } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_value")
      .eq("config_key", "universe_override_symbols")
      .maybeSingle();
    const cfgVal = cfgRows?.config_value;
    if (Array.isArray(cfgVal)) {
      for (const item of cfgVal as Array<{ symbol?: string; exchange?: string }>) {
        if (!item?.symbol) continue;
        const ex = (item.exchange || "NSE").toUpperCase();
        const key = `${item.symbol}|${ex}`;
        if (!work.has(key)) work.set(key, { symbol: item.symbol, exchange: ex });
      }
    }

    if (work.size === 0) {
      await supabase.from("cron_run_log").insert({
        job_name: "snapshot-ltp-close",
        status: "ok",
        rows_affected: 0,
        details: { reason: "empty_work_set", invoked_by: invokedBy, forced: force },
      });
      return json({ success: true, refreshed: 0, reason: "empty_work_set" });
    }

    const allSymbols = Array.from(new Set(Array.from(work.values()).map((w) => w.symbol)));
    const { data: masters } = await supabase
      .from("stock_master")
      .select("symbol, exchange, segment, dhan_security_id")
      .in("symbol", allSymbols);

    // Pick the best master row per (symbol, exchange): prefer segment ending in _EQ
    const masterByKey = new Map<string, MasterRow>();
    for (const m of (masters ?? []) as MasterRow[]) {
      if (!m.dhan_security_id || !m.exchange) continue;
      const key = `${m.symbol}|${m.exchange}`;
      const existing = masterByKey.get(key);
      const prefer = (m.segment || "").endsWith("_EQ");
      const existingPrefer = existing && (existing.segment || "").endsWith("_EQ");
      if (!existing || (prefer && !existingPrefer)) masterByKey.set(key, m);
    }

    const tasks: Array<{ symbol: string; exchange: string; securityId: string; segment: string }> = [];
    const noMaster: string[] = [];
    for (const w of work.values()) {
      const key = `${w.symbol}|${w.exchange}`;
      const m = masterByKey.get(key);
      if (!m) { noMaster.push(key); continue; }
      const seg = w.exchange === "BSE" ? "BSE_EQ" : "NSE_EQ";
      tasks.push({ symbol: w.symbol, exchange: w.exchange, securityId: m.dhan_security_id, segment: seg });
    }

    let ok = 0, fail = 0;
    const nowIso = new Date().toISOString();
    const BATCH = 8;
    for (let i = 0; i < tasks.length; i += BATCH) {
      const slice = tasks.slice(i, i + BATCH);
      const results = await Promise.all(slice.map(async (t) => {
        const ltp = await fetchDhanLtp(t.securityId, t.segment);
        return { ...t, ltp };
      }));
      const upserts = results
        .filter((r) => r.ltp !== null)
        .map((r) => ({
          symbol: r.symbol,
          exchange: r.exchange,
          ltp: r.ltp!,
          source: "dhan_close",
          fetched_at: nowIso,
          as_of: nowIso,
        }));
      ok += upserts.length;
      fail += results.length - upserts.length;
      if (upserts.length > 0) {
        const { error: upErr } = await supabase.from("ltp_cache").upsert(upserts, { onConflict: "symbol" });
        if (upErr) console.error("ltp_cache upsert error:", upErr.message);
        const historyRows = upserts.map((u) => ({
          symbol: u.symbol, ltp: u.ltp, source: "dhan_close", recorded_at: u.fetched_at,
        }));
        const { error: hErr } = await supabase.from("ltp_history").insert(historyRows);
        if (hErr) console.error("ltp_history insert error:", hErr.message);
      }
      // Phase 2V.2 — pace between batches to stay under upstream rate limits.
      if (i + BATCH < tasks.length) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    const status = fail === 0 ? "ok" : (ok === 0 ? "error" : "partial");
    await supabase.from("cron_run_log").insert({
      function_name: "snapshot-ltp-close",
      status,
      finished_at: new Date().toISOString(),
      metrics: {
        rows_affected: ok,
        failed: fail,
        total_tasks: tasks.length,
        work_set_size: work.size,
        no_master_keys: noMaster.slice(0, 20),
        invoked_by: invokedBy,
        forced: force,
        window_reason: win.reason,
      },
    });

    return json({
      success: true,
      rows_affected: ok,
      errors_count: fail,
      total_tasks: tasks.length,
      work_set_size: work.size,
      no_master_count: noMaster.length,
      status,
    });
  } catch (e) {
    console.error("snapshot-ltp-close error:", e);
    try {
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await supabase.from("cron_run_log").insert({
        job_name: "snapshot-ltp-close",
        status: "error",
        rows_affected: 0,
        details: { error: String(e) },
      });
    } catch { /* swallow */ }
    return json({ success: false, error: String(e) }, 500);
  }
});
