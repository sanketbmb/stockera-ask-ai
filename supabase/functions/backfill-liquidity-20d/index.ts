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

    const { data: cfg } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_value")
      .eq("config_key", "universe_override_symbols")
      .maybeSingle();

    const universe = (cfg?.config_value ?? []) as Array<{
      symbol: string;
      exchange: string;
    }>;
    if (!Array.isArray(universe) || universe.length === 0) {
      return json({ ok: false, error: "no_override_symbols" }, 400);
    }

    // Dedupe by symbol+exchange
    const seen = new Set<string>();
    const pairs = universe.filter((p) => {
      const k = `${p.symbol}|${p.exchange}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return !!p.symbol && !!p.exchange;
    });

    const errors: Array<{ symbol: string; reason: string }> = [];
    let processed = 0;
    let insertedTotal = 0;

    for (const { symbol, exchange } of pairs) {
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
              symbols_processed: processed,
              rows_inserted: insertedTotal,
              errors_count: errors.length,
              ran_at: new Date().toISOString(),
            },
          },
          { onConflict: "config_key" },
        );
    } catch { /* best effort */ }

    return json({
      ok: true,
      symbols_processed: processed,
      rows_inserted: insertedTotal,
      errors,
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
