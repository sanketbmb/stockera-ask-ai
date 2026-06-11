// stock-recommendation-query — Phase 2F query API
//
// Reads SP-1 verified survivors from stock_picker_pick_audit for the latest
// completed live batch and shapes them for the recommendation engine UI.
// Read-only. No fabricated scores, no external APIs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  source: "ltp_cache" | "liquidity_20d_close" | null;
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

interface StockOut {
  ticker: string;
  exchange: string;
  sector: string | null;
  verdict: "include";
  composite_score: number | null;
  batch_id: string;
  generated_at: string;
  cmp: CmpBlock;
  technicals: TechnicalsBlock;
  fundamentals: FundamentalsBlock;
  data_completeness: DataCompleteness;
  pending: string[];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  const stockCount = Math.max(1, Math.min(5, Number(body.stock_count) || 1));

  const generatedAt = new Date().toISOString();
  const baseResponse = {
    ok: true as const,
    horizon,
    risk_profile,
    sector,
    index: indexName,
    generated_at: generatedAt,
    data_completeness: "sp1_only" as const,
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
    const { data: liqRows, error: liqErr } = await supabase
      .from("stock_picker_liquidity_20d")
      .select("symbol, record_date, close")
      .in("symbol", filteredSymbols)
      .order("symbol", { ascending: true })
      .order("record_date", { ascending: false });

    if (liqErr) {
      return json({ ok: false, error: liqErr.message }, 500);
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

    // Phase 2C — fetch optional real-time LTP cache (may be empty); use as
    // primary CMP source when present, otherwise fall back to latest close.
    const { data: ltpRows } = await supabase
      .from("ltp_cache")
      .select("symbol, ltp, fetched_at, source")
      .in("symbol", filteredSymbols);
    const ltpBySymbol = new Map<string, { ltp: number; fetched_at: string; source: string | null }>();
    for (const r of ltpRows ?? []) {
      const v = Number(r.ltp);
      if (Number.isFinite(v) && v > 0) {
        ltpBySymbol.set(r.symbol as string, {
          ltp: v,
          fetched_at: String(r.fetched_at),
          source: (r.source as string | null) ?? null,
        });
      }
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
        return { value: round2(live.ltp), as_of: live.fetched_at, source: "ltp_cache" };
      }
      const rows = closesBySymbol.get(sym);
      if (rows && rows.length > 0) {
        return {
          value: round2(rows[0].close),
          as_of: rows[0].record_date,
          source: "liquidity_20d_close",
        };
      }
      return { value: null, as_of: null, source: null };
    }

    function buildTechnicals(sym: string): TechnicalsBlock {
      const rows = closesBySymbol.get(sym) ?? [];
      if (rows.length === 0) {
        return {
          sma_20d: null, high_20d: null, low_20d: null,
          pct_change_20d: null, realized_vol_20d: null, sample_size: 0,
        };
      }
      const closes = rows.map((r) => r.close);
      const sma = closes.reduce((a, b) => a + b, 0) / closes.length;
      const hi = Math.max(...closes);
      const lo = Math.min(...closes);
      const newest = rows[0].close;
      const oldest = rows[rows.length - 1].close;
      const pct = oldest > 0 ? ((newest - oldest) / oldest) * 100 : null;
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
      return {
        company_name: m?.company_name ?? null,
        sector: m?.sector ?? null,
        industry: m?.industry ?? null,
        market_cap_rs: m?.market_cap_rs ?? null,
        cap_band: m?.cap_band ?? null,
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

    // Step 7 — shape
    const stocks: StockOut[] = limited.map((r) => ({
      ticker: r.symbol as string,
      exchange: r.exchange as string,
      sector: masterBySymbol.get(r.symbol as string)?.sector ?? null,
      verdict: "include",
      composite_score: (r.composite_score as number | null) ?? null,
      batch_id: r.batch_id as string,
      generated_at: new Date(r.generated_at as string).toISOString(),
      data_completeness: {
        cmp: false,
        technicals: false,
        zones: false,
        fundamentals: false,
        news: false,
      },
    }));

    return json({
      ...baseResponse,
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
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
