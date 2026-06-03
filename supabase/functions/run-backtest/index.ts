// deno-lint-ignore-file no-explicit-any
/**
 * run-backtest — Phase 4E backtest harness (MVP)
 *
 * Chunked self-invoking architecture:
 *   POST { action: "start" }                     → create run_id, kick off chunk 0
 *   POST { action: "chunk", run_id, chunk_idx }  → process N symbols, self-invoke next chunk
 *   POST { action: "status", run_id }            → read progress
 *
 * Each chunk processes CHUNK_SIZE symbols across all horizons × entry_dates.
 * Engine called via HTTP to compute-trade-plan with historical_as_of.
 * Forward-walk simulation uses the same candle series fetched once per symbol.
 *
 * Auth: x-cron-secret header (SEED_CRON_SECRET) OR service-role bearer.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("SEED_CRON_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Universe (mirrored from src/data/backtest-universe.ts; deno can't import .ts from /src cleanly) ──
const UNIVERSE: string[] = [
  "RELIANCE","TCS","HDFCBANK","ICICIBANK","INFY","HINDUNILVR","ITC","KOTAKBANK","LT","SBIN",
  "TATAPOWER","TATAMOTORS","SUZLON","TATASTEEL","BAJAJ-AUTO","PAYTM","ADANIENT","ADANIPORTS","GODREJCP","DABUR",
  "HAVELLS","BIOCON","MFSL","BANDHANBNK","PERSISTENT",
  "HFCL","IDEA","IDFCFIRSTB","YESBANK","RBLBANK","IRCTC","NMDC","GMRINFRA","RECLTD","PFC",
  "SAIL","NHPC","IRFC","BHEL","UNIONBANK",
  "AXISBANK","WIPRO","ONGC","MARUTI","NESTLEIND","SUNPHARMA","JSWSTEEL","DLF","COALINDIA","BHARTIARTL",
];

const HORIZONS = ["short-term", "medium-term", "long-term"] as const;
type Horizon = typeof HORIZONS[number];
const FORWARD_DAYS: Record<Horizon, number> = {
  "short-term": 60, "medium-term": 180, "long-term": 365,
};

const CHUNK_SIZE = 1;                 // symbols per chunk (one symbol fits in a single edge invocation)
const ENTRY_DATE_INTERVAL_DAYS = 60;  // calendar days between entry-date samples
const ENTRY_DATES_PER_HORIZON = 6;    // ~365d lookback / 60d
const ENTRY_HIT_TOLERANCE = 0.005;    // ±0.5% for single-mode entries

interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number; }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function authorized(req: Request): boolean {
  const cron = req.headers.get("x-cron-secret");
  if (CRON_SECRET && cron === CRON_SECRET) return true;
  const bearer = req.headers.get("authorization") ?? "";
  return bearer === `Bearer ${SERVICE_KEY}`;
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── Candle fetch (full series, once per symbol) ──
async function fetchAllCandles(symbol: string): Promise<Candle[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/finedge-fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ endpoint: "daily-quotes", symbol }),
  });
  const txt = await res.text();
  let body: any = {};
  try { body = txt ? JSON.parse(txt) : {}; } catch { /* */ }
  if (!res.ok || body.success !== true) throw new Error(`finedge ${res.status}: ${String(body.error ?? txt).slice(0,200)}`);
  const wrap = body.data as any;
  const inner = (wrap?.data ?? wrap) as any;
  const rows = (inner?.price ?? inner?.quotes ?? inner?.data) as unknown;
  if (!Array.isArray(rows)) throw new Error("finedge: no price array");
  const out: Candle[] = rows.map((r: any) => ({
    date: String(r.quote_date ?? r.date ?? ""),
    open: Number(r.open_price ?? r.open ?? 0),
    high: Number(r.high_price ?? r.high ?? 0),
    low:  Number(r.low_price  ?? r.low  ?? 0),
    close: Number(r.close_price ?? r.close ?? 0),
    volume: Number(r.volume ?? 0),
  })).filter((c) => c.date && c.close > 0);
  out.sort((a,b) => a.date.localeCompare(b.date));
  return out;
}

// ── Entry-date sampling: every 30d going back 365d, snapped to a trading day present in candles ──
function sampleEntryDates(allCandles: Candle[], count: number, intervalDays: number, forwardBuffer: number): string[] {
  if (allCandles.length < forwardBuffer + 30) return [];
  // Anchor: leave forwardBuffer trading days at the end for forward simulation.
  const usable = allCandles.slice(0, allCandles.length - forwardBuffer);
  if (usable.length < 30) return [];
  const lastIdx = usable.length - 1;
  const lastDate = new Date(usable[lastIdx].date + "T00:00:00Z").getTime();
  const targets: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(lastDate - i * intervalDays * 86400_000);
    const tStr = t.toISOString().slice(0, 10);
    // snap to nearest candle date <= target
    let found: string | null = null;
    for (let j = usable.length - 1; j >= 0; j--) {
      if (usable[j].date <= tStr) { found = usable[j].date; break; }
    }
    if (found && !targets.includes(found)) targets.push(found);
  }
  return targets;
}

// ── Call engine with historical_as_of ──
async function callEngine(symbol: string, horizon: Horizon, asOf: string): Promise<any | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/compute-trade-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ symbol, query_type: horizon, historical_as_of: asOf }),
    });
    const body = await res.json().catch(() => null);
    if (!body || body.success !== true) return null;
    return body;
  } catch { return null; }
}

// ── Forward simulation ──
type Outcome = "WIN_T1" | "WIN_T2" | "LOSS_SL" | "ENTRY_MISSED" | "TIMEOUT_NO_RESOLUTION";

interface SimResult {
  entry_hit: boolean; days_to_entry_hit: number | null;
  t1_hit: boolean; days_to_t1: number | null;
  t2_hit: boolean; days_to_t2: number | null;
  sl_hit_first: boolean;
  outcome: Outcome;
}

function simulate(
  forwardCandles: Candle[],
  preferredEntry: number,
  zoneLower: number | null,
  zoneUpper: number | null,
  t1: number | null,
  t2: number | null,
  sl: number | null,
): SimResult {
  // Entry condition: price touches [zoneLower, zoneUpper] (zone) OR within ±0.5% of preferred (single)
  const hasZone = zoneLower != null && zoneUpper != null && zoneUpper > zoneLower;
  const singleLo = preferredEntry * (1 - ENTRY_HIT_TOLERANCE);
  const singleHi = preferredEntry * (1 + ENTRY_HIT_TOLERANCE);
  const eLo = hasZone ? zoneLower! : singleLo;
  const eHi = hasZone ? zoneUpper! : singleHi;

  let entryHit = false, daysToEntry: number | null = null;
  let t1Hit = false, daysT1: number | null = null;
  let t2Hit = false, daysT2: number | null = null;
  let slFirst = false;

  for (let i = 0; i < forwardCandles.length; i++) {
    const c = forwardCandles[i];
    if (!entryHit) {
      if (c.low <= eHi && c.high >= eLo) {
        entryHit = true; daysToEntry = i + 1;
      } else continue;
    }
    // After entry: check SL / T1 / T2 in remaining bars (including same bar)
    if (sl != null && !t1Hit && !slFirst && c.low <= sl) {
      slFirst = true; break;
    }
    if (t1 != null && !t1Hit && c.high >= t1) {
      t1Hit = true; daysT1 = i + 1;
    }
    if (t2 != null && !t2Hit && c.high >= t2) {
      t2Hit = true; daysT2 = i + 1;
    }
    if (t1Hit && t2Hit) break;
  }

  let outcome: Outcome;
  if (!entryHit) outcome = "ENTRY_MISSED";
  else if (slFirst && !t1Hit) outcome = "LOSS_SL";
  else if (t2Hit) outcome = "WIN_T2";
  else if (t1Hit) outcome = "WIN_T1";
  else outcome = "TIMEOUT_NO_RESOLUTION";

  return {
    entry_hit: entryHit, days_to_entry_hit: daysToEntry,
    t1_hit: t1Hit, days_to_t1: daysT1,
    t2_hit: t2Hit, days_to_t2: daysT2,
    sl_hit_first: slFirst, outcome,
  };
}

// ── Process one symbol: fetch candles once, run all (horizon × entry_date) combos ──
async function processSymbol(runId: string, symbol: string): Promise<{ ok: number; errors: number }> {
  let okCount = 0, errCount = 0;
  let allCandles: Candle[] = [];
  try {
    allCandles = await fetchAllCandles(symbol);
  } catch (e) {
    // Record one DATA_ERROR row per horizon so we have lineage
    for (const horizon of HORIZONS) {
      await supa.from("backtest_results").insert({
        run_id: runId, symbol, horizon, entry_date: "1970-01-01",
        engine_version: "trade_plan_v3_regime_aware",
        outcome: "DATA_ERROR", error_detail: `fetch_candles_failed: ${String(e).slice(0,200)}`,
      });
      errCount++;
    }
    return { ok: 0, errors: errCount };
  }

  if (allCandles.length < 300) {
    for (const horizon of HORIZONS) {
      await supa.from("backtest_results").insert({
        run_id: runId, symbol, horizon, entry_date: "1970-01-01",
        engine_version: "trade_plan_v3_regime_aware",
        outcome: "DATA_ERROR", error_detail: `insufficient_history: ${allCandles.length} bars`,
      });
      errCount++;
    }
    return { ok: 0, errors: errCount };
  }

  for (const horizon of HORIZONS) {
    const fwd = FORWARD_DAYS[horizon];
    const entryDates = sampleEntryDates(allCandles, ENTRY_DATES_PER_HORIZON, ENTRY_DATE_INTERVAL_DAYS, fwd);
    for (const entryDate of entryDates) {
      const plan = await callEngine(symbol, horizon, entryDate);
      if (!plan) {
        await supa.from("backtest_results").insert({
          run_id: runId, symbol, horizon, entry_date: entryDate,
          engine_version: "trade_plan_v3_regime_aware",
          outcome: "DATA_ERROR", error_detail: "engine_call_failed",
        });
        errCount++;
        continue;
      }
      const levels = plan.levels ?? {};
      const strat = plan.entry_strategy ?? {};
      const pref = Number(strat.preferred_entry ?? levels.entry_zone ?? NaN);
      if (!Number.isFinite(pref)) {
        await supa.from("backtest_results").insert({
          run_id: runId, symbol, horizon, entry_date: entryDate,
          engine_version: plan.engine_version ?? "trade_plan_v3_regime_aware",
          regime: plan.regime ?? null,
          reasoning_code: strat.reasoning_code ?? null,
          entry_anchor: strat.entry_anchor ?? null,
          outcome: "DATA_ERROR", error_detail: "no_preferred_entry",
        });
        errCount++;
        continue;
      }

      const entryIdx = allCandles.findIndex((c) => c.date === entryDate);
      const forwardSlice = entryIdx >= 0 ? allCandles.slice(entryIdx + 1, entryIdx + 1 + fwd) : [];
      const sim = simulate(
        forwardSlice, pref,
        strat.entry_zone_lower ?? null, strat.entry_zone_upper ?? null,
        levels.target_1 ?? null, levels.target_2 ?? null, levels.stop_loss ?? null,
      );

      const { error: insertErr } = await supa.from("backtest_results").insert({
        run_id: runId, symbol, horizon, entry_date: entryDate,
        engine_version: plan.engine_version ?? "trade_plan_v3_regime_aware",
        regime: plan.regime ?? null,
        reasoning_code: strat.reasoning_code ?? null,
        entry_anchor: strat.entry_anchor ?? null,
        preferred_entry: pref,
        entry_zone_lower: strat.entry_zone_lower ?? null,
        entry_zone_upper: strat.entry_zone_upper ?? null,
        target_1: levels.target_1 ?? null,
        target_2: levels.target_2 ?? null,
        stop_loss: levels.stop_loss ?? null,
        entry_hit: sim.entry_hit,
        days_to_entry_hit: sim.days_to_entry_hit,
        t1_hit: sim.t1_hit, days_to_t1: sim.days_to_t1,
        t2_hit: sim.t2_hit, days_to_t2: sim.days_to_t2,
        sl_hit_first: sim.sl_hit_first,
        outcome: sim.outcome,
      });
      if (insertErr) { errCount++; console.error("insert err", insertErr.message); }
      else okCount++;
    }
  }
  return { ok: okCount, errors: errCount };
}

// ── Aggregate stats after run completes ──
async function finalizeRun(runId: string) {
  const { data: rows } = await supa.from("backtest_results").select("*").eq("run_id", runId);
  if (!rows) return;

  const valid = rows.filter((r: any) => r.outcome !== "DATA_ERROR");
  const dataErr = rows.length - valid.length;
  const n = valid.length || 1;
  const entryHit = valid.filter((r: any) => r.entry_hit).length;
  const t1 = valid.filter((r: any) => r.t1_hit).length;
  const t2 = valid.filter((r: any) => r.t2_hit).length;
  const sl = valid.filter((r: any) => r.sl_hit_first).length;
  const timeout = valid.filter((r: any) => r.outcome === "TIMEOUT_NO_RESOLUTION").length;

  const groupBy = (key: string) => {
    const g: Record<string, { n: number; entry: number; t1: number; t2: number; sl: number }> = {};
    for (const r of valid) {
      const k = String((r as any)[key] ?? "null");
      g[k] ??= { n: 0, entry: 0, t1: 0, t2: 0, sl: 0 };
      g[k].n++;
      if (r.entry_hit) g[k].entry++;
      if (r.t1_hit) g[k].t1++;
      if (r.t2_hit) g[k].t2++;
      if (r.sl_hit_first) g[k].sl++;
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(g)) {
      out[k] = {
        n: v.n,
        entry_hit_rate: +(v.entry / v.n).toFixed(3),
        t1_hit_rate: +(v.t1 / v.n).toFixed(3),
        t2_hit_rate: +(v.t2 / v.n).toFixed(3),
        sl_hit_rate: +(v.sl / v.n).toFixed(3),
      };
    }
    return out;
  };

  await supa.from("backtest_run_summary").update({
    completed_cases: valid.length,
    data_error_cases: dataErr,
    entry_hit_rate: +(entryHit / n).toFixed(3),
    t1_hit_rate: +(t1 / n).toFixed(3),
    t2_hit_rate: +(t2 / n).toFixed(3),
    sl_hit_rate: +(sl / n).toFixed(3),
    timeout_rate: +(timeout / n).toFixed(3),
    breakdown_by_horizon: groupBy("horizon"),
    breakdown_by_regime: groupBy("regime"),
    breakdown_by_reasoning_code: groupBy("reasoning_code"),
    status: "completed",
    finished_at: new Date().toISOString(),
  }).eq("run_id", runId);
}

// ── Self-invocation for next chunk ──
async function invokeNextChunk(runId: string, nextIdx: number) {
  // fire-and-forget; do not await to avoid blocking the response
  fetch(`${SUPABASE_URL}/functions/v1/run-backtest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "x-cron-secret": CRON_SECRET,
    },
    body: JSON.stringify({ action: "chunk", run_id: runId, chunk_idx: nextIdx }),
  }).catch(() => { /* fire and forget */ });
}

// ── Handlers ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (!authorized(req)) return json({ success: false, error: "UNAUTHORIZED" }, 401);

  const body = await req.json().catch(() => ({})) as any;
  const action = body.action ?? "start";

  if (action === "status") {
    const { data, error } = await supa.from("backtest_run_summary").select("*").eq("run_id", body.run_id).maybeSingle();
    if (error) return json({ success: false, error: error.message }, 500);
    return json({ success: true, run: data });
  }

  if (action === "start") {
    const runId = crypto.randomUUID();
    const totalCases = UNIVERSE.length * HORIZONS.length * ENTRY_DATES_PER_HORIZON;
    const { error } = await supa.from("backtest_run_summary").insert({
      run_id: runId,
      engine_version: "trade_plan_v3_regime_aware",
      universe_size: UNIVERSE.length,
      total_cases: totalCases,
      status: "running",
      next_chunk_index: 0,
      config: { chunk_size: CHUNK_SIZE, entry_dates_per_horizon: ENTRY_DATES_PER_HORIZON, horizons: HORIZONS },
    });
    if (error) return json({ success: false, error: error.message }, 500);
    invokeNextChunk(runId, 0);
    return json({ success: true, run_id: runId, total_cases: totalCases, message: "Run started; poll status." });
  }

  if (action === "chunk") {
    const runId: string = body.run_id;
    const chunkIdx: number = body.chunk_idx ?? 0;
    const startSym = chunkIdx * CHUNK_SIZE;
    const endSym = Math.min(startSym + CHUNK_SIZE, UNIVERSE.length);
    if (startSym >= UNIVERSE.length) {
      await finalizeRun(runId);
      return json({ success: true, message: "All chunks complete; run finalized.", run_id: runId });
    }
    const symbols = UNIVERSE.slice(startSym, endSym);
    console.log(`[run-backtest] run=${runId} chunk=${chunkIdx} symbols=${symbols.join(",")}`);
    let chunkOk = 0, chunkErr = 0;
    for (const sym of symbols) {
      try {
        const { ok, errors } = await processSymbol(runId, sym);
        chunkOk += ok; chunkErr += errors;
      } catch (e) {
        console.error(`symbol ${sym} crashed`, e);
        chunkErr++;
      }
    }
    await supa.from("backtest_run_summary").update({ next_chunk_index: chunkIdx + 1 }).eq("run_id", runId);
    if (endSym < UNIVERSE.length) {
      invokeNextChunk(runId, chunkIdx + 1);
      return json({ success: true, chunk_idx: chunkIdx, processed: symbols, ok: chunkOk, errors: chunkErr, next: chunkIdx + 1 });
    } else {
      await finalizeRun(runId);
      return json({ success: true, chunk_idx: chunkIdx, processed: symbols, ok: chunkOk, errors: chunkErr, message: "Final chunk; run finalized." });
    }
  }

  return json({ success: false, error: "UNKNOWN_ACTION" }, 400);
});
