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

interface StockOut {
  ticker: string;
  exchange: string;
  sector: string | null;
  verdict: "include";
  composite_score: number | null;
  batch_id: string;
  generated_at: string;
  data_completeness: {
    cmp: false;
    technicals: false;
    zones: false;
    fundamentals: false;
    news: false;
  };
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

    // Step 3 — sector/industry lookup via stock_master
    const symbols = Array.from(new Set(auditRows.map((r) => r.symbol as string)));
    const { data: masterRows, error: masterErr } = await supabase
      .from("stock_master")
      .select("symbol, sector, industry, market_cap_rs, cap_band")
      .in("symbol", symbols);

    if (masterErr) {
      return json({ ok: false, error: masterErr.message }, 500);
    }
    const masterBySymbol = new Map<string, { sector: string | null }>();
    for (const m of masterRows ?? []) {
      if (!masterBySymbol.has(m.symbol as string)) {
        masterBySymbol.set(m.symbol as string, { sector: (m.sector as string | null) ?? null });
      }
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

    const closesBySymbol = new Map<string, number[]>();
    for (const row of liqRows ?? []) {
      const sym = row.symbol as string;
      const close = Number(row.close);
      if (!Number.isFinite(close) || close <= 0) continue;
      const arr = closesBySymbol.get(sym) ?? [];
      if (arr.length < 20) arr.push(close);
      closesBySymbol.set(sym, arr);
    }

    function realizedVol(closesDesc: number[] | undefined): number | null {
      if (!closesDesc || closesDesc.length < 3) return null;
      // closesDesc is newest-first; build chronological return series
      const asc = [...closesDesc].reverse();
      const rets: number[] = [];
      for (let i = 1; i < asc.length; i++) {
        const prev = asc[i - 1];
        const cur = asc[i];
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
