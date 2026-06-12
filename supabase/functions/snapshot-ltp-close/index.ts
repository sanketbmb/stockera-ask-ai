/**
 * snapshot-ltp-close — Phase 2V.3
 *
 * Idempotent micro-batch worker for the daily 15:29-15:30 IST NSE close
 * snapshot. Each invocation:
 *   1. Builds the bounded equities work set (ai_reports last 24h UNION
 *      universe_override_symbols).
 *   2. Filters out (symbol, exchange) pairs already stamped 'dhan_close'
 *      in ltp_cache today (IST).
 *   3. Processes up to ltp_close_snapshot_batch_size PENDING symbols,
 *      capped by ltp_close_snapshot_max_runtime_ms wall-clock budget.
 *   4. Upserts ltp_cache + ltp_history with source='dhan_close'.
 *   5. Logs to cron_run_log using the existing (function_name, metrics)
 *      schema.
 *
 * Multiple cron firings inside the 15:29-15:30 IST window cover the full
 * universe across Supabase's per-trace outbound HTTP cap.
 *
 * No fabrication: if Dhan returns nothing for a symbol, ltp_cache is left
 * untouched and the symbol remains PENDING for the next invocation.
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

interface IstNow { date: string; minutes: number; weekday: number; }
function istNow(): IstNow {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60_000);
  const date = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
  return {
    date,
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
    weekday: ist.getUTCDay(),
  };
}

function classifyWindow(t: IstNow): { ok: boolean; phase: string } {
  if (t.weekday === 0 || t.weekday === 6) return { ok: false, phase: "weekend" };
  if (NSE_HOLIDAYS_2026.has(t.date)) return { ok: false, phase: "holiday" };
  // Tolerance: 15:28 -> 15:31 IST
  if (t.minutes < 15 * 60 + 28) return { ok: false, phase: "before_window" };
  if (t.minutes > 15 * 60 + 31) return { ok: false, phase: "after_window" };
  return { ok: true, phase: "close_window" };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchDhanLtp(securityId: string, segment: string): Promise<number | null> {
  try {
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
  } catch {
    return null;
  }
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
  const runStartedAt = new Date().toISOString();
  const runStartMs = Date.now();
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

    const t = istNow();
    const win = classifyWindow(t);
    if (!win.ok && !force) {
      return json({ ok: true, skipped: true, reason: win.phase, ran_at: runStartedAt });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // --- Runtime knobs ---
    const { data: cfgAll } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_key, config_value")
      .in("config_key", [
        "ltp_close_snapshot_batch_size",
        "ltp_close_snapshot_max_runtime_ms",
        "ltp_close_snapshot_inter_call_sleep_ms",
        "universe_override_symbols",
      ]);
    const cfgMap = new Map<string, unknown>();
    for (const r of cfgAll ?? []) cfgMap.set((r as { config_key: string }).config_key, (r as { config_value: unknown }).config_value);
    const asNum = (v: unknown, dflt: number) => {
      if (typeof v === "number") return v;
      if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
      return dflt;
    };
    const batchSize = Math.max(1, asNum(cfgMap.get("ltp_close_snapshot_batch_size"), 8));
    const maxRuntimeMs = Math.max(2000, asNum(cfgMap.get("ltp_close_snapshot_max_runtime_ms"), 25000));
    const interSleepMs = Math.max(0, asNum(cfgMap.get("ltp_close_snapshot_inter_call_sleep_ms"), 300));

    // --- Build work set ---
    const work = new Map<string, WorkItem>(); // `${symbol}|${exchange}`
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
    const override = cfgMap.get("universe_override_symbols");
    if (Array.isArray(override)) {
      for (const item of override as Array<{ symbol?: string; exchange?: string }>) {
        if (!item?.symbol) continue;
        const ex = (item.exchange || "NSE").toUpperCase();
        const key = `${item.symbol}|${ex}`;
        if (!work.has(key)) work.set(key, { symbol: item.symbol, exchange: ex });
      }
    }

    if (work.size === 0) {
      await supabase.from("cron_run_log").insert({
        function_name: "snapshot-ltp-close",
        status: "ok",
        started_at: runStartedAt,
        finished_at: new Date().toISOString(),
        metrics: {
          processed: 0,
          remaining_pending: 0,
          errors_count: 0,
          batch_size: batchSize,
          ist_window_phase: win.phase,
          run_started_at: runStartedAt,
          run_ended_at: new Date().toISOString(),
          invoked_by: invokedBy,
          forced: force,
          reason: "empty_work_set",
        },
      });
      return json({ ok: true, processed: 0, remaining_pending: 0, errors_count: 0, ran_at: runStartedAt });
    }

    // --- Determine already-stamped today (IST) ---
    // IST date boundary in UTC: today_ist 00:00 IST = (today_ist - 1day) 18:30 UTC
    const istMidnightUtc = new Date(`${t.date}T00:00:00+05:30`).toISOString();
    const symbolsArr = Array.from(new Set(Array.from(work.values()).map((w) => w.symbol)));
    const { data: stamped } = await supabase
      .from("ltp_cache")
      .select("symbol, exchange, fetched_at, source")
      .in("symbol", symbolsArr)
      .eq("source", "dhan_close")
      .gte("fetched_at", istMidnightUtc);
    const stampedKeys = new Set<string>();
    for (const r of stamped ?? []) {
      const row = r as { symbol: string; exchange: string };
      stampedKeys.add(`${row.symbol}|${row.exchange}`);
    }

    // PENDING (sorted deterministically)
    const pending = Array.from(work.values())
      .filter((w) => !stampedKeys.has(`${w.symbol}|${w.exchange}`))
      .sort((a, b) => (a.symbol === b.symbol ? a.exchange.localeCompare(b.exchange) : a.symbol.localeCompare(b.symbol)));

    if (pending.length === 0) {
      await supabase.from("cron_run_log").insert({
        function_name: "snapshot-ltp-close",
        status: "ok",
        started_at: runStartedAt,
        finished_at: new Date().toISOString(),
        metrics: {
          processed: 0,
          remaining_pending: 0,
          errors_count: 0,
          batch_size: batchSize,
          ist_window_phase: win.phase,
          run_started_at: runStartedAt,
          run_ended_at: new Date().toISOString(),
          work_set_size: work.size,
          invoked_by: invokedBy,
          forced: force,
          reason: "all_stamped_today",
        },
      });
      return json({ ok: true, processed: 0, remaining_pending: 0, errors_count: 0, ran_at: runStartedAt });
    }

    const slice = pending.slice(0, batchSize);

    // --- Resolve dhan_security_id from stock_master, prefer *_EQ segment ---
    const sliceSymbols = Array.from(new Set(slice.map((s) => s.symbol)));
    const { data: masters } = await supabase
      .from("stock_master")
      .select("symbol, exchange, segment, dhan_security_id")
      .in("symbol", sliceSymbols);
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
    const failureDetails: Array<{ symbol: string; exchange: string; reason: string }> = [];
    for (const w of slice) {
      const m = masterByKey.get(`${w.symbol}|${w.exchange}`);
      if (!m) {
        failureDetails.push({ symbol: w.symbol, exchange: w.exchange, reason: "no_master" });
        continue;
      }
      const seg = w.exchange === "BSE" ? "BSE_EQ" : "NSE_EQ";
      tasks.push({ symbol: w.symbol, exchange: w.exchange, securityId: m.dhan_security_id, segment: seg });
    }

    // --- Process tasks within wall-clock budget ---
    let processed = 0;
    let errorsCount = failureDetails.length;
    const PARALLEL = Math.min(8, batchSize);
    for (let i = 0; i < tasks.length; i += PARALLEL) {
      if (Date.now() - runStartMs > maxRuntimeMs) break;
      const chunk = tasks.slice(i, i + PARALLEL);
      const results = await Promise.all(chunk.map(async (tk) => {
        const ltp = await fetchDhanLtp(tk.securityId, tk.segment);
        return { ...tk, ltp };
      }));
      const nowIso = new Date().toISOString();
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
      for (const r of results) {
        if (r.ltp === null) {
          errorsCount += 1;
          failureDetails.push({ symbol: r.symbol, exchange: r.exchange, reason: "dhan_null" });
        }
      }
      if (upserts.length > 0) {
        const { error: upErr } = await supabase.from("ltp_cache").upsert(upserts, { onConflict: "symbol" });
        if (upErr) {
          console.error("ltp_cache upsert error:", upErr.message);
        } else {
          processed += upserts.length;
        }
        const historyRows = upserts.map((u) => ({
          symbol: u.symbol, ltp: u.ltp, source: "dhan_close", recorded_at: u.fetched_at,
        }));
        const { error: hErr } = await supabase.from("ltp_history").insert(historyRows);
        if (hErr) console.error("ltp_history insert error:", hErr.message);
      }
      if (i + PARALLEL < tasks.length && interSleepMs > 0) {
        await new Promise((r) => setTimeout(r, interSleepMs));
      }
    }

    const remainingPending = Math.max(0, pending.length - processed);
    const runEndedAt = new Date().toISOString();
    const status = errorsCount === 0 ? "ok" : (processed === 0 ? "error" : "partial");

    await supabase.from("cron_run_log").insert({
      function_name: "snapshot-ltp-close",
      status,
      started_at: runStartedAt,
      finished_at: runEndedAt,
      metrics: {
        processed,
        remaining_pending: remainingPending,
        errors_count: errorsCount,
        batch_size: batchSize,
        ist_window_phase: win.phase,
        run_started_at: runStartedAt,
        run_ended_at: runEndedAt,
        work_set_size: work.size,
        pending_total: pending.length,
        invoked_by: invokedBy,
        forced: force,
        details: failureDetails.slice(0, 50),
      },
    });

    return json({
      ok: true,
      processed,
      remaining_pending: remainingPending,
      errors_count: errorsCount,
      ran_at: runStartedAt,
    });
  } catch (e) {
    console.error("snapshot-ltp-close error:", e);
    try {
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await supabase.from("cron_run_log").insert({
        function_name: "snapshot-ltp-close",
        status: "error",
        started_at: runStartedAt,
        finished_at: new Date().toISOString(),
        error_message: String(e),
        metrics: { processed: 0, remaining_pending: -1, errors_count: 1 },
      });
    } catch { /* swallow */ }
    return json({ ok: false, error: String(e) }, 500);
  }
});
