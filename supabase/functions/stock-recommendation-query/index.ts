// stock-recommendation-query — Phase 2F query API
//
// Reads SP-1 verified survivors from stock_picker_pick_audit for the latest
// completed live batch and shapes them for the recommendation engine UI.
// Read-only. No fabricated scores, no external APIs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { currentRegulatoryStamp } from "../_shared/stock-picker/regulatory-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALL_SECTORS = "All Sectors";
const ALL_INDICES = "All Indices";

interface RequestBody {
  horizon: "intraday" | "short" | "medium" | "long";
  risk_profile: "conservative" | "moderate" | "aggressive" | "ultra";
  sector: string;
  index: string;
  stock_count: number;
  is_pro: boolean;
}

interface DataCompleteness {
  cmp: boolean;
  technicals: boolean;
  zones: boolean;
  fundamentals: boolean;
  news: boolean;
}

interface CmpBlock {
  value: number | null;
  as_of: string | null;
  fetched_at: string | null;
  source:
    | "dhan_live"
    | "dhan_close"
    | "dhan_cache_stale"
    | "liquidity_20d_close"
    | null;
  label: "LIVE" | "CLOSE" | "CACHE" | "EOD FALLBACK" | null;
  stale_minutes: number | null;
  window_phase: "open" | "post_close" | "pre_open" | "weekend";
  refresh_attempted: boolean;
}

interface TechnicalsBlock {
  sma_20d: number | null;
  high_20d: number | null;
  low_20d: number | null;
  pct_change_20d: number | null;
  realized_vol_20d: number | null;
  sample_size: number;
}

interface FundamentalsBlock {
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  market_cap_rs: number | null;
  cap_band: string | null;
  lot_size: number | null;
  tick_size: number | null;
  regulatory_flags: {
    is_asm: boolean | null;
    is_gsm: boolean | null;
    is_t2t: boolean | null;
    is_suspended: boolean | null;
    pledged_pct: number | null;
  };
}

interface BuyZoneBlock {
  lower: number | null;
  upper: number | null;
}

interface NewsItemOut {
  headline: string;
  url: string | null;
  source: string;
  published_at: string;
}

interface ZoneMeta {
  version: "zone_v2";
  v_used: number;
  stop_pct: number;
  target_pct: number;
  rr_actual: number;
  stop_source: "vol_based" | "structural_tighten" | "min_floor";
  profile: string;
}

interface StockOut {
  ticker: string;
  exchange: string;
  sector: string | null;
  verdict: "include";
  composite_score: number | null;
  composite_score_preview: number | null;
  batch_id: string;
  generated_at: string;
  cmp: CmpBlock;
  technicals: TechnicalsBlock;
  fundamentals: FundamentalsBlock;
  buy_zone: BuyZoneBlock;
  target: number | null;
  stop_loss: number | null;
  zone_meta: ZoneMeta | null;
  news: NewsItemOut[];
  data_completeness: DataCompleteness;
  pending: string[];
  cache_health: {
    cmp_fresh: boolean;
    fundamentals_fresh: boolean;
    news_fresh: boolean;
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Phase 2V — Market-window helper (IST). Returns one of:
//   "open"        — Mon-Fri, 09:15-15:30 IST
//   "post_close"  — Mon-Fri, after 15:30 IST (same trading day)
//   "pre_open"    — Mon-Fri, before 09:15 IST
//   "weekend"     — Sat/Sun
function marketWindowPhase(now: Date = new Date()): "open" | "post_close" | "pre_open" | "weekend" {
  // IST = UTC + 5:30
  const istMs = now.getTime() + (5 * 60 + 30) * 60 * 1000;
  const ist = new Date(istMs);
  const dow = ist.getUTCDay(); // 0=Sun..6=Sat in IST frame
  if (dow === 0 || dow === 6) return "weekend";
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const OPEN = 9 * 60 + 15;
  const CLOSE = 15 * 60 + 30;
  if (minutes < OPEN) return "pre_open";
  if (minutes <= CLOSE) return "open";
  return "post_close";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const horizon = body.horizon;
  const risk_profile = body.risk_profile;
  const sector = body.sector ?? ALL_SECTORS;
  const indexName = body.index ?? ALL_INDICES;
  // Phase 2X.1 (F1): widened cap 5 → 10 to expose more of the audited survivor pool.
  const stockCount = Math.max(1, Math.min(10, Number(body.stock_count) || 1));

  const generatedAt = new Date().toISOString();
  // Phase 2U — surface SEBI RA stamp from runtime_config (no module-scope cache).
  let regulatoryStamp;
  try {
    const s = await currentRegulatoryStamp();
    regulatoryStamp = {
      firm_legal_name: s.firm_legal_name,
      sebi_reg_no: s.sebi_reg_no,
      regulatory_status_at_generation: s.regulatory_status_at_generation,
    };
  } catch (e) {
    return json({ ok: false, error: `regulatory_stamp_unavailable: ${String(e)}` }, 500);
  }

  const baseResponse = {
    ok: true as const,
    horizon,
    risk_profile,
    sector,
    index: indexName,
    generated_at: generatedAt,
    data_completeness: "sp1_only" as const,
    regulatory_stamp: regulatoryStamp,
  };

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Step 1 — latest completed live batch
    const { data: batchRows, error: batchErr } = await supabase
      .from("stock_picker_batch_rejection")
      .select("batch_id")
      .eq("batch_type", "live")
      .eq("batch_state", "completed")
      .order("run_at", { ascending: false })
      .limit(1);

    if (batchErr) {
      return json({ ok: false, error: batchErr.message }, 500);
    }
    if (!batchRows || batchRows.length === 0) {
      return json({ ...baseResponse, stocks: [], note: "no_completed_batch" });
    }
    const batchId = batchRows[0].batch_id as string;

    // Step 2 — include rows for that batch
    const { data: auditRows, error: auditErr } = await supabase
      .from("stock_picker_pick_audit")
      .select("symbol, exchange, verdict, composite_score, generated_at, batch_id")
      .eq("batch_id", batchId)
      .eq("verdict", "include");

    if (auditErr) {
      return json({ ok: false, error: auditErr.message }, 500);
    }
    if (!auditRows || auditRows.length === 0) {
      return json({ ...baseResponse, stocks: [], note: "no_survivors_match_filter" });
    }

    // Step 3 — fundamentals lookup via stock_master (collapse multi-row dupes;
    // prefer first non-null per field; never invent missing values).
    const symbols = Array.from(new Set(auditRows.map((r) => r.symbol as string)));
    const { data: masterRows, error: masterErr } = await supabase
      .from("stock_master")
      .select(
        "symbol, company_name, sector, industry, market_cap_rs, cap_band, lot_size, tick_size, is_asm, is_gsm, is_t2t, is_suspended, pledged_pct",
      )
      .in("symbol", symbols);

    if (masterErr) {
      return json({ ok: false, error: masterErr.message }, 500);
    }

    interface MasterAgg {
      company_name: string | null;
      sector: string | null;
      industry: string | null;
      market_cap_rs: number | null;
      cap_band: string | null;
      lot_size: number | null;
      tick_size: number | null;
      is_asm: boolean | null;
      is_gsm: boolean | null;
      is_t2t: boolean | null;
      is_suspended: boolean | null;
      pledged_pct: number | null;
    }
    const masterBySymbol = new Map<string, MasterAgg>();
    function preferNonNull<T>(prev: T | null, next: T | null | undefined): T | null {
      if (prev !== null && prev !== undefined) return prev;
      return (next ?? null) as T | null;
    }
    for (const m of masterRows ?? []) {
      const sym = m.symbol as string;
      const cur: MasterAgg = masterBySymbol.get(sym) ?? {
        company_name: null,
        sector: null,
        industry: null,
        market_cap_rs: null,
        cap_band: null,
        lot_size: null,
        tick_size: null,
        is_asm: null,
        is_gsm: null,
        is_t2t: null,
        is_suspended: null,
        pledged_pct: null,
      };
      cur.company_name = preferNonNull(cur.company_name, m.company_name as string | null);
      cur.sector = preferNonNull(cur.sector, m.sector as string | null);
      cur.industry = preferNonNull(cur.industry, m.industry as string | null);
      cur.market_cap_rs = preferNonNull(cur.market_cap_rs, m.market_cap_rs as number | null);
      cur.cap_band = preferNonNull(cur.cap_band, m.cap_band as string | null);
      cur.lot_size = preferNonNull(cur.lot_size, m.lot_size as number | null);
      cur.tick_size = preferNonNull(cur.tick_size, m.tick_size as number | null);
      cur.is_asm = preferNonNull(cur.is_asm, m.is_asm as boolean | null);
      cur.is_gsm = preferNonNull(cur.is_gsm, m.is_gsm as boolean | null);
      cur.is_t2t = preferNonNull(cur.is_t2t, m.is_t2t as boolean | null);
      cur.is_suspended = preferNonNull(cur.is_suspended, m.is_suspended as boolean | null);
      cur.pledged_pct = preferNonNull(cur.pledged_pct, m.pledged_pct as number | null);
      masterBySymbol.set(sym, cur);
    }

    // Index membership set (latest as_of_date per symbol+exchange for index)
    let indexMemberSet: Set<string> | null = null;
    if (indexName !== ALL_INDICES) {
      const { data: memRows, error: memErr } = await supabase
        .from("stock_index_membership")
        .select("symbol, exchange, as_of_date")
        .eq("index_name", indexName)
        .in("symbol", symbols)
        .order("as_of_date", { ascending: false });

      if (memErr) {
        return json({ ok: false, error: memErr.message }, 500);
      }
      indexMemberSet = new Set<string>();
      for (const r of memRows ?? []) {
        indexMemberSet.add(`${r.symbol}|${r.exchange}`);
      }
    }

    // Step 4 — apply sector/index filters
    const filtered = auditRows.filter((r) => {
      const sym = r.symbol as string;
      const exch = r.exchange as string;
      const masterSector = masterBySymbol.get(sym)?.sector ?? null;

      if (sector !== ALL_SECTORS) {
        if (masterSector !== sector) return false;
      }
      if (indexMemberSet) {
        if (!indexMemberSet.has(`${sym}|${exch}`)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      return json({ ...baseResponse, stocks: [], note: "no_survivors_match_filter" });
    }

    // Step 4b — Phase 2B risk-tier engine.
    // Available real signals on current dataset: 20d close history from
    // stock_picker_liquidity_20d. composite_score, cap_band, market_cap_rs are
    // NULL for the active 3-symbol dev override universe, so we derive a
    // deterministic, explainable per-symbol risk metric = realized daily-return
    // standard deviation over up-to-20 most recent closes. Higher = riskier.
    const filteredSymbols = Array.from(new Set(filtered.map((r) => r.symbol as string)));
    const liqRows: Array<{ symbol: string; record_date: string; close: number }> = [];
    {
      const LIQ_PAGE = 1000;
      let liqFrom = 0;
      while (true) {
        const { data: page, error: liqErr } = await supabase
          .from("stock_picker_liquidity_20d")
          .select("symbol, record_date, close")
          .eq("fetch_status", "ok")
          .in("symbol", filteredSymbols)
          .order("symbol", { ascending: true })
          .order("record_date", { ascending: false })
          .range(liqFrom, liqFrom + LIQ_PAGE - 1);
        if (liqErr) {
          return json({ ok: false, error: liqErr.message }, 500);
        }
        if (!page || page.length === 0) break;
        liqRows.push(...(page as typeof liqRows));
        if (page.length < LIQ_PAGE) break;
        liqFrom += LIQ_PAGE;
      }
    }

    interface CloseRow { close: number; record_date: string }
    const closesBySymbol = new Map<string, CloseRow[]>();
    for (const row of liqRows ?? []) {
      const sym = row.symbol as string;
      const close = Number(row.close);
      const record_date = String(row.record_date);
      if (!Number.isFinite(close) || close <= 0) continue;
      const arr = closesBySymbol.get(sym) ?? [];
      if (arr.length < 20) arr.push({ close, record_date });
      closesBySymbol.set(sym, arr);
    }

    function realizedVol(rowsDesc: CloseRow[] | undefined): number | null {
      if (!rowsDesc || rowsDesc.length < 3) return null;
      const asc = [...rowsDesc].reverse();
      const rets: number[] = [];
      for (let i = 1; i < asc.length; i++) {
        const prev = asc[i - 1].close;
        const cur = asc[i].close;
        if (prev > 0) rets.push((cur - prev) / prev);
      }
      if (rets.length < 2) return null;
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const variance = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (rets.length - 1);
      return Math.sqrt(Math.max(0, variance));
    }

    const volBySymbol = new Map<string, number | null>();
    for (const sym of filteredSymbols) {
      volBySymbol.set(sym, realizedVol(closesBySymbol.get(sym)));
    }

    // Phase 2E — fetch optional real-time LTP cache (TTL-gated), fundamentals
    // cache (merged into stock_master), and news cache (top 3 per symbol).
    // All three are populated by background sync functions (sync-ltp-dhan,
    // sync-fundamentals-finedge, sync-news-marketaux); this function NEVER
    // calls external providers in the request path.
    const { data: cacheCfgRows } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_key, config_value")
      .in("config_key", [
        "ltp_cache_ttl_seconds",
        "fundamentals_cache_ttl_seconds",
        "news_cache_ttl_seconds",
      ]);
    let ltpTtlSec = 60;
    let fundTtlSec = 86400;
    let newsTtlSec = 1800;
    for (const r of cacheCfgRows ?? []) {
      const v = Number(r.config_value);
      if (!Number.isFinite(v) || v <= 0) continue;
      if (r.config_key === "ltp_cache_ttl_seconds") ltpTtlSec = v;
      else if (r.config_key === "fundamentals_cache_ttl_seconds") fundTtlSec = v;
      else if (r.config_key === "news_cache_ttl_seconds") newsTtlSec = v;
    }
    const nowMs = Date.now();

    // Phase 2V.2 — picker is a pure consumer of public.ltp_cache. No inline
    // calls to sync-ltp-dhan or Dhan from the request path. Freshness gate
    // for CACHE label is driven by runtime_config ltp_freshness_max_minutes
    // (default 5). Resolution priority:
    //   1) dhan_close (frozen post-bell snapshot) -> label CLOSE
    //   2) dhan_live  + fresh (<= maxMin)         -> label LIVE
    //   3) dhan_live  + stale                     -> label CACHE
    //   4) liquidity_20d latest close (fallback)  -> label EOD FALLBACK
    const { data: freshCfgRow } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_value")
      .eq("config_key", "ltp_freshness_max_minutes")
      .maybeSingle();
    let ltpFreshMaxMin = 5;
    if (freshCfgRow?.config_value != null) {
      const n = Number(freshCfgRow.config_value);
      if (Number.isFinite(n) && n > 0) ltpFreshMaxMin = n;
    }

    const { data: ltpRows } = await supabase
      .from("ltp_cache")
      .select("symbol, ltp, fetched_at, as_of, source")
      .in("symbol", filteredSymbols);
    const ltpBySymbol = new Map<string, { ltp: number; fetched_at: string; source: string | null }>();
    const ltpFreshSet = new Set<string>();
    for (const r of ltpRows ?? []) {
      const v = Number(r.ltp);
      if (!Number.isFinite(v) || v <= 0) continue;
      const ts = (r.as_of as string | null) ?? (r.fetched_at as string | null);
      if (!ts) continue;
      const sym = r.symbol as string;
      ltpBySymbol.set(sym, {
        ltp: v,
        fetched_at: ts,
        source: (r.source as string | null) ?? null,
      });
      const ageSec = (nowMs - new Date(ts).getTime()) / 1000;
      if (Number.isFinite(ageSec) && ageSec >= 0 && ageSec <= ltpTtlSec) {
        ltpFreshSet.add(sym);
      }
    }
    const cmpWindowPhase = marketWindowPhase();
    const refreshedSet = new Set<string>(); // Phase 2V.2: picker no longer refreshes inline; always false.

    const { data: fundRows } = await supabase
      .from("fundamentals_cache")
      .select("symbol, sector, industry, market_cap_rs, cap_band, as_of")
      .in("symbol", filteredSymbols);
    const fundCacheBySymbol = new Map<string, {
      sector: string | null; industry: string | null;
      market_cap_rs: number | null; cap_band: string | null;
      as_of: string | null;
    }>();
    for (const r of fundRows ?? []) {
      fundCacheBySymbol.set(r.symbol as string, {
        sector: (r.sector as string | null) ?? null,
        industry: (r.industry as string | null) ?? null,
        market_cap_rs: r.market_cap_rs == null ? null : Number(r.market_cap_rs),
        cap_band: (r.cap_band as string | null) ?? null,
        as_of: (r.as_of as string | null) ?? null,
      });
    }

    const { data: newsRows } = await supabase
      .from("news_cache")
      .select("symbol, headline, url, source, published_at, inserted_at")
      .in("symbol", filteredSymbols)
      .order("published_at", { ascending: false });

    // MASTER FIX — 30-day news freshness cutoff. Headlines older than 30 days
    // are excluded entirely; the UI renders "No recent news in our window"
    // when nothing survives the cutoff, instead of surfacing stale 3-year-old
    // items from the cache.
    const NEWS_CUTOFF_MS = 30 * 24 * 60 * 60 * 1000;
    const newsCutoffTs = Date.now() - NEWS_CUTOFF_MS;

    const newsBySymbol = new Map<string, NewsItemOut[]>();
    const newsLatestInsertedBySymbol = new Map<string, string>();
    for (const r of newsRows ?? []) {
      const sym = r.symbol as string;
      const publishedAt = r.published_at as string | null;
      if (!publishedAt) continue;
      const pubMs = new Date(publishedAt).getTime();
      if (!Number.isFinite(pubMs) || pubMs < newsCutoffTs) continue;
      const ins = (r.inserted_at as string | null) ?? null;
      if (ins && !newsLatestInsertedBySymbol.has(sym)) {
        // rows are ordered by published_at desc; track first-seen inserted_at as proxy.
        newsLatestInsertedBySymbol.set(sym, ins);
      } else if (ins) {
        const prev = newsLatestInsertedBySymbol.get(sym)!;
        if (new Date(ins).getTime() > new Date(prev).getTime()) {
          newsLatestInsertedBySymbol.set(sym, ins);
        }
      }
      const arr = newsBySymbol.get(sym) ?? [];
      if (arr.length >= 3) continue;
      arr.push({
        headline: r.headline as string,
        url: (r.url as string | null) ?? null,
        source: (r.source as string | null) ?? "marketaux",
        published_at: publishedAt,
      });
      newsBySymbol.set(sym, arr);
    }


    function round2(n: number): number {
      return Math.round(n * 100) / 100;
    }
    function round4(n: number): number {
      return Math.round(n * 10000) / 10000;
    }

    function buildCmp(sym: string): CmpBlock {
      const live = ltpBySymbol.get(sym);
      if (live) {
        const fetchedAt = live.fetched_at;
        const ageMin = (nowMs - new Date(fetchedAt).getTime()) / 60_000;
        const src = (live.source ?? "").toLowerCase();
        if (src === "dhan_close") {
          return {
            value: round2(live.ltp),
            as_of: fetchedAt,
            fetched_at: fetchedAt,
            source: "dhan_close",
            label: "CLOSE",
            stale_minutes: null,
            window_phase: cmpWindowPhase,
            refresh_attempted: false,
          };
        }
        // Treat any live-style source as dhan_live for label purposes.
        if (Number.isFinite(ageMin) && ageMin <= ltpFreshMaxMin) {
          return {
            value: round2(live.ltp),
            as_of: fetchedAt,
            fetched_at: fetchedAt,
            source: "dhan_live",
            label: "LIVE",
            stale_minutes: null,
            window_phase: cmpWindowPhase,
            refresh_attempted: false,
          };
        }
        return {
          value: round2(live.ltp),
          as_of: fetchedAt,
          fetched_at: fetchedAt,
          source: "dhan_cache_stale",
          label: "CACHE",
          stale_minutes: Math.max(0, Math.round(ageMin)),
          window_phase: cmpWindowPhase,
          refresh_attempted: false,
        };
      }
      const rows = closesBySymbol.get(sym);
      if (rows && rows.length > 0) {
        return {
          value: round2(rows[0].close),
          as_of: rows[0].record_date,
          fetched_at: rows[0].record_date,
          source: "liquidity_20d_close",
          label: "EOD FALLBACK",
          stale_minutes: null,
          window_phase: cmpWindowPhase,
          refresh_attempted: false,
        };
      }
      return {
        value: null,
        as_of: null,
        fetched_at: null,
        source: null,
        label: null,
        stale_minutes: null,
        window_phase: cmpWindowPhase,
        refresh_attempted: false,
      };
    }

    function buildTechnicals(sym: string, cmpValue: number | null): TechnicalsBlock {
      const rows = closesBySymbol.get(sym) ?? [];
      // MASTER FIX — graceful fallback when liquidity_20d history is empty
      // (e.g. ITI). If we have a displayed CMP, use it as the SMA/High/Low
      // anchor so the card shows real numbers instead of "Pending". Δ% and
      // realized vol remain null (cannot be computed without a window).
      if (rows.length === 0) {
        if (cmpValue != null) {
          return {
            sma_20d: round2(cmpValue),
            high_20d: round2(cmpValue),
            low_20d: round2(cmpValue),
            pct_change_20d: null,
            realized_vol_20d: null,
            sample_size: 0,
          };
        }
        return {
          sma_20d: null, high_20d: null, low_20d: null,
          pct_change_20d: null, realized_vol_20d: null, sample_size: 0,
        };
      }
      const closes = rows.map((r) => r.close);
      const sma = closes.reduce((a, b) => a + b, 0) / closes.length;
      const hi = Math.max(...closes);
      const lo = Math.min(...closes);
      // Phase 2V — pct_change uses the SAME CMP displayed on the card when
      // available; falls back to newest close in window if CMP is null.
      const newest = rows[0].close;
      const oldest = rows[rows.length - 1].close;
      const numerator = cmpValue != null ? cmpValue : newest;
      const pct = oldest > 0 ? ((numerator - oldest) / oldest) * 100 : null;
      const vol = volBySymbol.get(sym) ?? null;
      return {
        sma_20d: round2(sma),
        high_20d: round2(hi),
        low_20d: round2(lo),
        pct_change_20d: pct == null ? null : round2(pct),
        realized_vol_20d: vol == null ? null : round4(vol),
        sample_size: rows.length,
      };
    }

    function buildFundamentals(sym: string): FundamentalsBlock {
      const m = masterBySymbol.get(sym);
      const fc = fundCacheBySymbol.get(sym);
      // Merge: prefer stock_master, fall back to fundamentals_cache for nulls.
      return {
        company_name: m?.company_name ?? null,
        sector: m?.sector ?? fc?.sector ?? null,
        industry: m?.industry ?? fc?.industry ?? null,
        market_cap_rs: m?.market_cap_rs ?? fc?.market_cap_rs ?? null,
        cap_band: m?.cap_band ?? fc?.cap_band ?? null,
        lot_size: m?.lot_size ?? null,
        tick_size: m?.tick_size ?? null,
        regulatory_flags: {
          is_asm: m?.is_asm ?? null,
          is_gsm: m?.is_gsm ?? null,
          is_t2t: m?.is_t2t ?? null,
          is_suspended: m?.is_suspended ?? null,
          pledged_pct: m?.pledged_pct ?? null,
        },
      };

    }

    // Compute median volatility across this survivor set (symbols with a
    // computable vol). NULL-vol symbols are treated as "unknown risk" and
    // only included by permissive tiers.
    const volsKnown = filteredSymbols
      .map((s) => volBySymbol.get(s))
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      .sort((a, b) => a - b);

    function percentile(p: number): number | null {
      if (volsKnown.length === 0) return null;
      const idx = Math.min(volsKnown.length - 1, Math.floor(p * volsKnown.length));
      return volsKnown[idx];
    }
    const p50 = percentile(0.5);
    const p75 = percentile(0.75);

    type Tier = "conservative" | "moderate" | "aggressive" | "ultra";
    const tier = (risk_profile ?? "moderate") as Tier;

    // Tier filter: keep symbols whose realized vol satisfies the tier rule.
    // Always guarantee at least 1 symbol survives (fall back to lowest-vol
    // for restrictive tiers, or all for permissive).
    let tierFiltered = filtered.filter((r) => {
      const v = volBySymbol.get(r.symbol as string);
      if (tier === "ultra") return true;
      if (tier === "aggressive") return true; // permissive; ranking handles bias
      if (v == null) {
        // unknown risk: only ultra/aggressive accept it
        return false;
      }
      if (tier === "conservative") return p50 != null && v <= p50;
      if (tier === "moderate") return p75 != null && v <= p75;
      return true;
    });

    if (tierFiltered.length === 0) {
      // safety net: fall back to lowest-vol single name so the API still
      // returns a deterministic answer rather than empty.
      const lowest = [...filtered].sort((a, b) => {
        const va = volBySymbol.get(a.symbol as string) ?? Number.POSITIVE_INFINITY;
        const vb = volBySymbol.get(b.symbol as string) ?? Number.POSITIVE_INFINITY;
        return va - vb;
      });
      tierFiltered = lowest.slice(0, 1);
    }

    // Step 5 — tier-aware sort.
    //   conservative / moderate: realized vol ASC (stable first),
    //                            then composite_score DESC nulls last, then symbol ASC
    //   aggressive / ultra:      realized vol DESC (opportunity first),
    //                            then composite_score DESC nulls last, then symbol ASC
    const volDesc = tier === "aggressive" || tier === "ultra";
    tierFiltered.sort((a, b) => {
      const va = volBySymbol.get(a.symbol as string);
      const vb = volBySymbol.get(b.symbol as string);
      const vaN = va == null ? (volDesc ? -Infinity : Infinity) : va;
      const vbN = vb == null ? (volDesc ? -Infinity : Infinity) : vb;
      if (vaN !== vbN) return volDesc ? vbN - vaN : vaN - vbN;
      const as = a.composite_score as number | null;
      const bs = b.composite_score as number | null;
      if (as == null && bs != null) return 1;
      if (bs == null && as != null) return -1;
      if (as != null && bs != null && as !== bs) return bs - as;
      return (a.symbol as string).localeCompare(b.symbol as string);
    });

    // Step 6 — limit
    const limited = tierFiltered.slice(0, stockCount);

    // Phase 2V.2 — picker is a pure consumer of public.ltp_cache. The cache
    // is refreshed every minute during market hours by refresh-ltp and frozen
    // at 15:29 IST by snapshot-ltp-close. No inline Dhan calls happen here.


    // --- Phase 2D helpers (dev-preview math, deterministic, no fabrication) ---
    // Phase 2O — load tuning knobs fresh per request from runtime_config (no module-cache)
    type Knobs = {
      vol_clamp_min: number; vol_clamp_max: number; vol_default: number;
      buy_upper_factor: number; buy_lower_factor: number; buy_lower_floor_factor: number;
      target_vol_mult: number; target_high_factor: number;
      stop_vol_mult: number; stop_low_factor: number;
      w_vol: number; w_trend: number; w_mr: number;
    };
    const KNOB_DEFAULTS: Knobs = {
      vol_clamp_min: 0.005, vol_clamp_max: 0.05, vol_default: 0.02,
      buy_upper_factor: 0.25, buy_lower_factor: 1.25, buy_lower_floor_factor: 0.98,
      target_vol_mult: 3.0, target_high_factor: 1.02,
      stop_vol_mult: 3.0, stop_low_factor: 0.95,
      w_vol: 0.4, w_trend: 0.4, w_mr: 0.2,
    };
    const knobs: Knobs = { ...KNOB_DEFAULTS };
    {
      const profileOverrideKey = `profile_knobs_${risk_profile}`;
      const { data: cfgRows, error: cfgErr } = await supabase
        .from("stock_picker_runtime_config")
        .select("config_key, config_value")
        .in("config_key", [
          "zone_vol_clamp_min","zone_vol_clamp_max","zone_vol_default",
          "zone_buy_upper_factor","zone_buy_lower_factor","zone_buy_lower_floor_factor",
          "zone_target_vol_mult","zone_target_high_factor",
          "zone_stop_vol_mult","zone_stop_low_factor",
          "score_weight_vol","score_weight_trend","score_weight_mean_rev",
          profileOverrideKey,
        ]);
      const cfg = new Map<string, unknown>();
      if (!cfgErr && cfgRows) for (const r of cfgRows) cfg.set(r.config_key as string, r.config_value as unknown);
      const keyMap: Array<[keyof Knobs, string]> = [
        ["vol_clamp_min","zone_vol_clamp_min"],
        ["vol_clamp_max","zone_vol_clamp_max"],
        ["vol_default","zone_vol_default"],
        ["buy_upper_factor","zone_buy_upper_factor"],
        ["buy_lower_factor","zone_buy_lower_factor"],
        ["buy_lower_floor_factor","zone_buy_lower_floor_factor"],
        ["target_vol_mult","zone_target_vol_mult"],
        ["target_high_factor","zone_target_high_factor"],
        ["stop_vol_mult","zone_stop_vol_mult"],
        ["stop_low_factor","zone_stop_low_factor"],
        ["w_vol","score_weight_vol"],
        ["w_trend","score_weight_trend"],
        ["w_mr","score_weight_mean_rev"],
      ];
      for (const [field, key] of keyMap) {
        const raw = cfg.get(key);
        const n = typeof raw === "number" ? raw : (typeof raw === "string" ? Number(raw) : NaN);
        if (!cfg.has(key) || !Number.isFinite(n)) {
          console.warn(`phase2o: knob_missing ${key}`);
        } else {
          (knobs as Record<string, number>)[field] = n;
        }
      }
      // Phase 2Q — per-profile override (overrides any matching global knob for this request only)
      const profileOverrideRaw = cfg.get(profileOverrideKey);
      if (profileOverrideRaw && typeof profileOverrideRaw === "object" && !Array.isArray(profileOverrideRaw)) {
        const overrideMap: Array<[keyof Knobs, string]> = [
          ["vol_clamp_min","zone_vol_clamp_min"],
          ["vol_clamp_max","zone_vol_clamp_max"],
          ["vol_default","zone_vol_default"],
          ["buy_upper_factor","zone_buy_upper_factor"],
          ["buy_lower_factor","zone_buy_lower_factor"],
          ["buy_lower_floor_factor","zone_buy_lower_floor_factor"],
          ["target_vol_mult","zone_target_vol_mult"],
          ["target_high_factor","zone_target_high_factor"],
          ["stop_vol_mult","zone_stop_vol_mult"],
          ["stop_low_factor","zone_stop_low_factor"],
          ["w_vol","score_weight_vol"],
          ["w_trend","score_weight_trend"],
          ["w_mr","score_weight_mean_rev"],
        ];
        const ov = profileOverrideRaw as Record<string, unknown>;
        const appliedFields: string[] = [];
        for (const [field, key] of overrideMap) {
          const raw = ov[key];
          const n = typeof raw === "number" ? raw : (typeof raw === "string" ? Number(raw) : NaN);
          if (Number.isFinite(n)) {
            (knobs as Record<string, number>)[field] = n;
            appliedFields.push(key);
          }
        }
        console.log(`phase2q: profile_override_applied ${risk_profile} fields=${appliedFields.length} values=${JSON.stringify(knobs)}`);
      } else {
        console.log(`phase2q: profile_override_absent ${risk_profile} (using global knobs)`);
      }
    }


    function clamp(n: number, lo: number, hi: number): number {
      return Math.max(lo, Math.min(hi, n));
    }
    function effectiveVol(v: number | null): number {
      if (v == null || !Number.isFinite(v)) return knobs.vol_default;
      return clamp(v, knobs.vol_clamp_min, knobs.vol_clamp_max);
    }
    // === Phase 2Y.1 — Zone-math v2 (R-coupled, vol-scaled, capped) ===
    // Pure function. Read knobs ONCE per request below and pass via `z`.
    // Legacy knobs (target_high_factor, stop_low_factor, target_vol_mult,
    // stop_vol_mult, buy_*_factor) are no longer referenced by buildZones.
    type ZoneV2Knobs = {
      stop_k: number; rr_min: number; rr_default: number;
      max_stop_pct: number; min_stop_pct: number; max_target_pct: number;
      buy_zone_half_pct: number; v_clamp_min: number; v_clamp_max: number;
    };
    const ZONE_V2_DEFAULTS: ZoneV2Knobs = {
      stop_k: 1.5, rr_min: 1.5, rr_default: 2.0,
      max_stop_pct: 0.04, min_stop_pct: 0.01, max_target_pct: 0.12,
      buy_zone_half_pct: 0.005, v_clamp_min: 0.005, v_clamp_max: 0.05,
    };
    const zoneV2: ZoneV2Knobs = { ...ZONE_V2_DEFAULTS };
    {
      const v2ProfileKey = `profile_knobs_v2_${risk_profile}`;
      const { data: v2Rows, error: v2Err } = await supabase
        .from("stock_picker_runtime_config")
        .select("config_key, config_value")
        .in("config_key", ["zone_v2_globals", v2ProfileKey]);
      if (v2Err) console.warn(`phase2y1: zone_v2_knobs_read_error ${v2Err.message}`);
      const v2Map = new Map<string, Record<string, unknown>>();
      for (const r of v2Rows ?? []) {
        const v = (r as { config_value: unknown }).config_value;
        if (v && typeof v === "object" && !Array.isArray(v)) {
          v2Map.set((r as { config_key: string }).config_key, v as Record<string, unknown>);
        }
      }
      const applyKnobs = (src?: Record<string, unknown>) => {
        if (!src) return;
        for (const k of Object.keys(ZONE_V2_DEFAULTS) as Array<keyof ZoneV2Knobs>) {
          const raw = src[k];
          const n = typeof raw === "number" ? raw
            : (typeof raw === "string" ? Number(raw) : NaN);
          if (Number.isFinite(n)) (zoneV2 as Record<string, number>)[k as string] = n;
        }
      };
      applyKnobs(v2Map.get("zone_v2_globals"));
      applyKnobs(v2Map.get(v2ProfileKey)); // profile overrides win
      console.log(
        `phase2y1: zone_v2_knobs ${risk_profile} ${JSON.stringify(zoneV2)} ` +
        `globals_loaded=${v2Map.has("zone_v2_globals")} profile_loaded=${v2Map.has(v2ProfileKey)}`
      );
    }

    function buildZones(cmp: number | null, tech: TechnicalsBlock, z: ZoneV2Knobs, profile: string): {
      buy_zone: BuyZoneBlock; target: number | null; stop_loss: number | null;
      _meta: ZoneMeta | null;
    } {
      const nulls = () => ({
        buy_zone: { lower: null, upper: null },
        target: null, stop_loss: null, _meta: null,
      });
      if (cmp == null || !(cmp > 0)) return nulls();

      // 1) Volatility (realized_vol_20d only, clamped)
      const vRaw = tech.realized_vol_20d ?? 0.02;
      const v = Math.max(z.v_clamp_min, Math.min(z.v_clamp_max, vRaw));

      // 2) Entry anchor: buy_zone.upper == entry == CMP (single anchor for all bands)
      const entry = cmp;
      const buy_zone_upper = entry;
      const buy_zone_lower = entry * (1 - z.buy_zone_half_pct);

      // 3) Stop_pct: vol-scaled → capped at max → floored at min
      let stop_pct = z.stop_k * v;
      let stop_source: ZoneMeta["stop_source"] = "vol_based";
      if (stop_pct > z.max_stop_pct) stop_pct = z.max_stop_pct;
      if (stop_pct < z.min_stop_pct) { stop_pct = z.min_stop_pct; stop_source = "min_floor"; }
      let stop = entry * (1 - stop_pct);

      // 4) Structural floor (TIGHTEN-ONLY: only used if it RAISES the stop above the vol stop)
      let structural_used = false;
      if (tech.low_20d != null) {
        const structural_stop = tech.low_20d * 0.95;
        if (structural_stop > stop && structural_stop < entry) {
          stop = structural_stop;
          stop_pct = (entry - stop) / entry;
          structural_used = true;
        }
      }
      if (structural_used) stop_source = "structural_tighten";

      // 5) R (risk unit primitive)
      const R = entry - stop;
      if (!(R > 0)) return nulls();

      // 6) Target = entry + rr * R; rr_min is the floor
      const rr = Math.max(z.rr_min, z.rr_default);
      const target = entry + rr * R;
      const target_pct = (target - entry) / entry;

      // 7) Realism cap on target (rejects e.g. blown-out +27% targets)
      if (target_pct > z.max_target_pct) return nulls();

      // 8) Sanity gates
      if (!(target > entry)) return nulls();
      if (!(stop < entry)) return nulls();
      if (!(stop > 0)) return nulls();
      if (!(buy_zone_lower < buy_zone_upper)) return nulls();
      if (!(stop < buy_zone_lower)) return nulls();
      const rr_actual = (target - entry) / R;
      if (!(rr_actual + 1e-9 >= z.rr_min)) return nulls();

      return {
        buy_zone: { lower: round2(buy_zone_lower), upper: round2(buy_zone_upper) },
        target: round2(target),
        stop_loss: round2(stop),
        _meta: {
          version: "zone_v2",
          v_used: v,
          stop_pct,
          target_pct,
          rr_actual,
          stop_source,
          profile,
        },
      };
    }
    function previewComposite(cmp: number | null, tech: TechnicalsBlock): number | null {
      if (cmp == null) return null;
      const v = tech.realized_vol_20d;
      const volScore = v == null ? 50 : 100 * (1 - clamp(v / knobs.vol_clamp_max, 0, 1));
      const pct = tech.pct_change_20d;
      const trendScore = pct == null ? 50 : clamp(50 + pct * 2.5, 0, 100);
      let proxScore = 50;
      if (tech.sma_20d != null && tech.sma_20d > 0) {
        const dev = Math.abs(cmp - tech.sma_20d) / tech.sma_20d;
        proxScore = 100 * (1 - clamp(dev / 0.2, 0, 1));
      }
      const blended = knobs.w_vol * volScore + knobs.w_trend * trendScore + knobs.w_mr * proxScore;
      return Math.round(clamp(blended, 0, 100) * 10) / 10;
    }

    // Step 6b — Phase 2V.1 per-profile composite_score read-path gate.
    // Read all 4 per-profile persistence flags fresh per request (no cache).
    // Missing or non-strict-true => false (safe default).
    const persistKey = `composite_score_persist_${risk_profile}`;
    let persistEnabled = false;
    {
      const { data: flagRows, error: flagErr } = await supabase
        .from("stock_picker_runtime_config")
        .select("config_key, config_value")
        .in("config_key", [
          "composite_score_persist_conservative",
          "composite_score_persist_moderate",
          "composite_score_persist_aggressive",
          "composite_score_persist_ultra",
        ]);
      if (flagErr) {
        return json({ ok: false, error: `score_gate_flags_unavailable: ${flagErr.message}` }, 500);
      }
      const flagMap = new Map<string, unknown>();
      for (const row of flagRows ?? []) {
        flagMap.set(
          (row as { config_key: string }).config_key,
          (row as { config_value: unknown }).config_value,
        );
      }
      const raw = flagMap.get(persistKey);
      persistEnabled = raw === true ||
        (typeof raw === "string" && raw.trim().toLowerCase() === "true");
    }
    const scoreGate = {
      risk_profile,
      persistence_enabled: persistEnabled,
    };

    // Step 7 — shape (Phase 2C real fields + Phase 2D zones/composite preview).
    const stocks: StockOut[] = limited.map((r) => {
      const sym = r.symbol as string;
      const cmp = buildCmp(sym);
      const tech = buildTechnicals(sym, cmp.value);
      const fund = buildFundamentals(sym);
      const zones = buildZones(cmp.value, tech, zoneV2, risk_profile);
      const compositePreview = previewComposite(cmp.value, tech);

      const cmpOk = cmp.value !== null;
      // MASTER FIX — lenient gate: any non-null SMA (incl. CMP-derived
      // fallback when history is empty) qualifies as "ready" so the card
      // shows real numbers. Δ% and Vol are reported as "—" when null.
      const techOk = tech.sma_20d !== null;
      const fundOk =
        fund.company_name !== null ||
        fund.sector !== null ||
        fund.industry !== null ||
        fund.market_cap_rs !== null ||
        fund.cap_band !== null;
      const zonesOk =
        zones.buy_zone.lower !== null &&
        zones.buy_zone.upper !== null &&
        zones.target !== null &&
        zones.stop_loss !== null;

      const pending: string[] = [];
      if (!cmpOk) pending.push("cmp");
      if (!techOk) pending.push("technicals");
      if (!zonesOk) {
        const missingZ: string[] = [];
        if (zones.buy_zone.lower === null || zones.buy_zone.upper === null) missingZ.push("buy_zone");
        if (zones.target === null) missingZ.push("target");
        if (zones.stop_loss === null) missingZ.push("stop_loss");
        pending.push("zones:" + missingZ.join(","));
      }
      if (!fundOk) pending.push("fundamentals");
      else {
        const missingFund: string[] = [];
        if (fund.sector === null) missingFund.push("sector");
        if (fund.industry === null) missingFund.push("industry");
        if (fund.market_cap_rs === null) missingFund.push("market_cap_rs");
        if (fund.cap_band === null) missingFund.push("cap_band");
        if (missingFund.length > 0) pending.push("fundamentals:" + missingFund.join(","));
      }
      const newsItems = newsBySymbol.get(sym) ?? [];
      const newsOk = newsItems.length > 0;
      if (!newsOk) pending.push("news");

      return {
        ticker: sym,
        exchange: r.exchange as string,
        sector: fund.sector,
        verdict: "include" as const,
        // persisted score from audit (Phase 2V.1: gated to null when persistence disabled for this profile)
        composite_score: persistEnabled ? ((r.composite_score as number | null) ?? null) : null,
        // dev-preview score (Phase 2V.1: gated to null when persistence disabled for this profile)
        composite_score_preview: persistEnabled ? compositePreview : null,
        batch_id: r.batch_id as string,
        generated_at: new Date(r.generated_at as string).toISOString(),
        cmp,
        technicals: tech,
        fundamentals: fund,
        buy_zone: zones.buy_zone,
        target: zones.target,
        stop_loss: zones.stop_loss,
        news: newsItems,
        data_completeness: {
          cmp: cmpOk,
          technicals: techOk,
          zones: zonesOk,
          fundamentals: fundOk,
          news: newsOk,
        },
        pending,
        cache_health: {
          cmp_fresh: cmp.label === "LIVE" || cmp.label === "CLOSE",
          fundamentals_fresh: (() => {
            const f = fundCacheBySymbol.get(sym);
            if (!f?.as_of) return false;
            return ((Date.now() - new Date(f.as_of).getTime()) / 1000) <= fundTtlSec;
          })(),
          news_fresh: (() => {
            const ins = newsLatestInsertedBySymbol.get(sym);
            if (!ins) return false;
            return ((Date.now() - new Date(ins).getTime()) / 1000) <= newsTtlSec;
          })(),
        },
      };

    });

    return json({
      ...baseResponse,
      score_gate: scoreGate,
      stocks,
      risk_engine: {
        signal: "realized_vol_20d_close",
        note:
          "composite_score / cap_band / market_cap_rs are NULL on current dev " +
          "universe; using realized daily-return stddev from up-to-20 most " +
          "recent closes as the deterministic risk metric.",
        median_vol: p50,
        p75_vol: p75,
        per_symbol_vol: Object.fromEntries(
          Array.from(volBySymbol.entries()).map(([k, v]) => [k, v]),
        ),
        tier_applied: tier,
      },
      zone_engine: {
        version: "phase-2d-dev-preview",
        buy_zone_formula:
          "upper = CMP*(1 - vc*0.25); lower = max(CMP*(1 - vc*1.25), low_20d*0.98); vc = clamp(realized_vol_20d, 0.005, 0.05), default 0.02",
        target_formula:
          "target = max(CMP*(1 + vc*3), high_20d*1.02); null if not strictly > buy_zone.upper",
        stop_loss_formula:
          "stop_loss = min(CMP*(1 - vc*3), low_20d*0.95); null if not strictly < buy_zone.lower",
        composite_score_formula:
          "0.4 * vol_score + 0.4 * trend_score + 0.2 * mean_reversion_proximity, range 0..100",
        disclaimer:
          "Dev-preview math only. NOT backtested. NOT persisted to stock_picker_pick_audit. composite_score_writes_enabled remains false.",
      },
      data_sources: {
        cmp: "ltp_cache (preferred) -> stock_picker_liquidity_20d latest close (fallback)",
        technicals: "derived from stock_picker_liquidity_20d closes (sma_20d, high_20d, low_20d, pct_change_20d, realized_vol_20d)",
        fundamentals: "stock_master (company_name, sector, industry, market_cap_rs, cap_band, lot_size, tick_size, regulatory flags)",
        zones: "derived in-response from CMP + technicals (Phase 2D dev-preview math)",
        news: "news_cache (populated by sync-news-marketaux background job)",
      },
      cache_health_meta: {
        ltp_ttl_seconds: ltpTtlSec,
        fundamentals_ttl_seconds: fundTtlSec,
        news_ttl_seconds: newsTtlSec,
      },
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
