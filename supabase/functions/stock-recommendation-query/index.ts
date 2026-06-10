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

    // Step 4 — apply filters
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

    // Step 5 — sort: composite_score DESC nulls last, then symbol ASC
    filtered.sort((a, b) => {
      const as = a.composite_score as number | null;
      const bs = b.composite_score as number | null;
      if (as == null && bs == null) {
        return (a.symbol as string).localeCompare(b.symbol as string);
      }
      if (as == null) return 1;
      if (bs == null) return -1;
      if (bs !== as) return bs - as;
      return (a.symbol as string).localeCompare(b.symbol as string);
    });

    // Step 6 — limit
    const limited = filtered.slice(0, stockCount);

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

    return json({ ...baseResponse, stocks });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
