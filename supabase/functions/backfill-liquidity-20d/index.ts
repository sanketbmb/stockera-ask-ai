// Phase 2W — W-C
// Backfill stock_picker_liquidity_20d for override-universe symbols using
// last-20-trading-day rows from stock_picker_ohlcv_history. Idempotent
// (unique key symbol, exchange, record_date, data_snapshot_at; we use a
// constant snapshot tag so re-runs collide and skip).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const SNAPSHOT_TAG = "1970-01-01T00:00:00Z"; // constant -> ON CONFLICT DO NOTHING

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Phase 2S.3-FIX-F: optional explicit source. Body may pass either
    // { source: "snapshot", snapshot_id?: string } to backfill from the
    // active universe snapshot, or { pairs: [{symbol,exchange}, ...] }.
    // Default falls back to universe_override_symbols (legacy behavior).
    let universe: Array<{ symbol: string; exchange: string }> = [];
    let sourceLabel = "override";
    let bodyJson: Record<string, unknown> = {};
    try {
      bodyJson = (await req.json()) as Record<string, unknown>;
    } catch { /* no body */ }

    if (Array.isArray(bodyJson.pairs)) {
      universe = (bodyJson.pairs as Array<{ symbol: string; exchange: string }>);
      sourceLabel = "explicit_pairs";
    } else if (bodyJson.source === "snapshot") {
      let snapshotId = typeof bodyJson.snapshot_id === "string" ? bodyJson.snapshot_id : null;
      if (!snapshotId) {
        const { data: actCfg } = await supabase
          .from("stock_picker_runtime_config")
          .select("config_value")
          .eq("config_key", "active_universe_snapshot_id")
          .maybeSingle();
        snapshotId = (actCfg?.config_value ?? null) as string | null;
      }
      if (!snapshotId) {
        const { data: latest } = await supabase
          .from("stock_picker_universe_snapshot")
          .select("id").order("created_at", { ascending: false }).limit(1);
        snapshotId = (latest?.[0]?.id ?? null) as string | null;
      }
      if (!snapshotId) return json({ ok: false, error: "no_snapshot_resolved" }, 400);
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: page, error: pErr } = await supabase
          .from("stock_picker_universe_snapshot_member")
          .select("symbol,exchange")
          .eq("universe_snapshot_id", snapshotId)
          .order("symbol", { ascending: true })
          .range(from, from + PAGE - 1);
        if (pErr) return json({ ok: false, error: `snapshot_read: ${pErr.message}` }, 500);
        if (!page || page.length === 0) break;
        for (const r of page) universe.push({ symbol: String(r.symbol), exchange: String(r.exchange) });
        if (page.length < PAGE) break;
        from += PAGE;
      }
      sourceLabel = `snapshot:${snapshotId}`;
    } else {
      const { data: cfg } = await supabase
        .from("stock_picker_runtime_config")
        .select("config_value")
        .eq("config_key", "universe_override_symbols")
        .maybeSingle();
      universe = (cfg?.config_value ?? []) as Array<{ symbol: string; exchange: string }>;
    }

    if (!Array.isArray(universe) || universe.length === 0) {
      return json({ ok: false, error: "no_universe_symbols", source: sourceLabel }, 400);
    }

    // Dedupe by symbol+exchange
    const seen = new Set<string>();
    const pairs = universe.filter((p) => {
      const k = `${p.symbol}|${p.exchange}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return !!p.symbol && !!p.exchange;
    });


    // FIX-I-PREWARM: skip pairs already at >=20 fresh liquidity rows.
    // Coverage probe paginated to avoid PostgREST 1000-row silent cap.
    const skipCovered = bodyJson.skip_covered !== false;
    let skippedCovered = 0;
    let workPairs = pairs;
    if (skipCovered) {
      const PAGE = 1000;
      let from = 0;
      const counts = new Map<string, number>();
      while (true) {
        const { data: page, error } = await supabase
          .from("stock_picker_liquidity_20d")
          .select("symbol,exchange")
          .eq("fetch_status", "ok")
          .order("symbol", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) return json({ ok: false, error: `coverage_probe: ${error.message}` }, 500);
        if (!page || page.length === 0) break;
        for (const r of page) {
          const k = `${r.symbol}|${r.exchange}`;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        if (page.length < PAGE) break;
        from += PAGE;
      }
      const covered = new Set<string>();
      for (const [k, c] of counts) if (c >= 20) covered.add(k);
      workPairs = pairs.filter((p) => {
        if (covered.has(`${p.symbol}|${p.exchange}`)) { skippedCovered++; return false; }
        return true;
      });
    }

    const maxRuntimeMs = typeof bodyJson.max_runtime_ms === "number"
      ? Math.max(5000, Math.floor(bodyJson.max_runtime_ms))
      : 100000;
    const t0 = Date.now();

    const errors: Array<{ symbol: string; reason: string }> = [];
    let processed = 0;
    let insertedTotal = 0;
    let timedOut = false;



    for (const { symbol, exchange } of workPairs) {
      if (Date.now() - t0 > maxRuntimeMs) { timedOut = true; break; }
      processed++;
      const { data: rows, error: histErr } = await supabase
        .from("stock_picker_ohlcv_history")
        .select("symbol, exchange, record_date, close, volume")
        .eq("symbol", symbol)
        .eq("exchange", exchange)
        .order("record_date", { ascending: false })
        .limit(20);
      if (histErr) {
        errors.push({ symbol, reason: `history_read: ${histErr.message}` });
        continue;
      }
      if (!rows || rows.length === 0) {
        errors.push({ symbol, reason: "no_history_rows" });
        continue;
      }

      const payload = rows
        .filter((r) => r.close != null && r.volume != null && r.record_date)
        .map((r) => {
          const close = Number(r.close);
          const volume = Number(r.volume);
          return {
            symbol: r.symbol,
            exchange: r.exchange,
            record_date: r.record_date as string,
            close,
            volume,
            turnover_rs: close * volume,
            adv_20d: null,
            adt_20d_rs: null,
            fetch_status: "ok",
            data_snapshot_at: SNAPSHOT_TAG,
            source_response_hash: null,
          };
        });
      if (payload.length === 0) continue;

      const { error: upErr, count } = await supabase
        .from("stock_picker_liquidity_20d")
        .upsert(payload, {
          onConflict: "symbol,exchange,record_date,data_snapshot_at",
          ignoreDuplicates: true,
          count: "exact",
        });
      if (upErr) {
        errors.push({ symbol, reason: `upsert: ${upErr.message}` });
        continue;
      }
      insertedTotal += count ?? 0;
    }

    try {
      await supabase
        .from("stock_picker_runtime_config")
        .upsert(
          {
            config_key: "last_backfill_liquidity_20d",
            kind: "operational",
            config_value: {
              ok: true,
              source: sourceLabel,
              universe_pairs: pairs.length,
              symbols_processed: processed,
              rows_inserted: insertedTotal,
              errors_count: errors.length,
              timed_out: timedOut,
              ran_at: new Date().toISOString(),
            },
          },
          { onConflict: "config_key" },
        );
    } catch { /* best effort */ }

    return json({
      ok: true,
      source: sourceLabel,
      universe_pairs: pairs.length,
      work_pairs: workPairs.length,
      skipped_already_covered: skippedCovered,
      symbols_processed: processed,
      rows_inserted: insertedTotal,
      timed_out: timedOut,
      elapsed_ms: Date.now() - t0,
      errors_count: errors.length,
      errors: errors.slice(0, 20),
    });

  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
