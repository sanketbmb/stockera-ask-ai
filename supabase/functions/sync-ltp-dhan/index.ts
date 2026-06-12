// Phase 2F — Background LTP sync (Dhan), with NSE→BSE fallback + telemetry.
// Reads universe_override_symbols from runtime_config, looks up dhan_security_id
// per (symbol, exchange) from stock_master, fetches LTP via dhan-fetch, upserts
// public.ltp_cache, then writes operational telemetry into runtime_config.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function parseOverrideSymbols(raw: unknown): { symbol: string; exchange: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return { symbol: entry, exchange: "NSE" };
      if (entry && typeof entry === "object" &&
          typeof (entry as { symbol?: unknown }).symbol === "string" &&
          typeof (entry as { exchange?: unknown }).exchange === "string") {
        return { symbol: (entry as { symbol: string }).symbol, exchange: (entry as { exchange: string }).exchange };
      }
      return null;
    })
    .filter((e): e is { symbol: string; exchange: string } => e !== null);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const ranAt = new Date().toISOString();
  const startedAt = ranAt;
  async function logTelemetry(args: { status: string; processed: number; errors_count: number; details?: Record<string, unknown>; error_message?: string }): Promise<void> {
    try {
      const finishedAt = new Date().toISOString();
      await fetch(`${SUPABASE_URL}/rest/v1/cron_run_log`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, Prefer: "return=minimal" },
        body: JSON.stringify({
          function_name: "sync-ltp-dhan",
          status: args.status,
          started_at: startedAt,
          finished_at: finishedAt,
          error_message: args.error_message ?? null,
          metrics: { status: args.status, processed: args.processed, errors_count: args.errors_count, details: args.details ?? {}, ran_at: finishedAt },
        }),
      }).catch(() => null);
    } catch { /* swallow */ }
  }


  // Optional body filter: { symbols?: string[] } — restricts the run to a
  // subset of the universe (used by stock-recommendation-query for inline
  // refresh of survivor cards). Capped at 10 symbols.
  let filterSymbols: string[] | null = null;
  try {
    if (req.method === "POST") {
      const body = (await req.json().catch(() => null)) as { symbols?: unknown } | null;
      if (body && Array.isArray(body.symbols)) {
        const cleaned = body.symbols
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .map((s) => s.trim());
        filterSymbols = cleaned.slice(0, 10);
      }
    }
  } catch { /* ignore */ }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: cfgRows } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_key, config_value")
      .in("config_key", ["dhan_api_enabled", "universe_override_symbols", "universe_override_enabled"]);
    const cfg = new Map<string, unknown>();
    for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value);

    if (cfg.get("dhan_api_enabled") !== true) {
      return json({ ok: true, skipped: "dhan_api_enabled=false", symbols_updated: 0, attempts: [], errors: [] });
    }
    if (cfg.get("universe_override_enabled") !== true) {
      return json({ ok: true, skipped: "universe_override_enabled=false", symbols_updated: 0, attempts: [], errors: [] });
    }
    const parsedOverride = parseOverrideSymbols(cfg.get("universe_override_symbols"));
    const universe = parsedOverride.map((e) => e.symbol);
    let symbols = universe;
    if (filterSymbols && filterSymbols.length > 0) {
      const u = new Set(universe);
      symbols = filterSymbols.filter((s) => u.has(s));
    }
    if (symbols.length === 0) {
      return json({ ok: true, symbols_updated: 0, attempts: [], errors: ["no override symbols"], filter_applied: filterSymbols != null });
    }

    // Load all NSE+BSE rows; dedupe by (symbol, exchange) preferring segment NSE_EQ/BSE_EQ.
    const { data: masters, error: mErr } = await supabase
      .from("stock_master")
      .select("symbol, exchange, segment, dhan_security_id")
      .in("symbol", symbols)
      .in("exchange", ["NSE", "BSE"]);
    if (mErr) return json({ ok: false, error: mErr.message }, 500);

    // Map: symbol -> { NSE?: id, BSE?: id }
    const idMap = new Map<string, { NSE?: string; BSE?: string }>();
    for (const m of masters ?? []) {
      const sym = m.symbol as string;
      const ex = m.exchange as string;
      const seg = (m.segment as string) ?? "";
      const id = String(m.dhan_security_id);
      const cur = idMap.get(sym) ?? {};
      // Prefer canonical *_EQ segment; otherwise keep first seen.
      if (ex === "NSE" && (seg === "NSE_EQ" || cur.NSE == null)) cur.NSE = id;
      if (ex === "BSE" && (seg === "BSE_EQ" || cur.BSE == null)) cur.BSE = id;
      idMap.set(sym, cur);
    }

    const errors: Array<{ symbol: string; reason: string }> = [];
    const attempts: Array<Record<string, unknown>> = [];
    let updated = 0;
    const nowIso = new Date().toISOString();

    for (const sym of symbols) {
      const ids = idMap.get(sym);
      if (!ids || (!ids.NSE && !ids.BSE)) {
        errors.push({ symbol: sym, reason: "no_dhan_security_id_in_stock_master" });
        attempts.push({ symbol: sym, exchange: null, dhan_security_id_used: null, ltp_or_null: null, source: "dhan" });
        continue;
      }

      // Try NSE first, fall back to BSE.
      let ltp: number | null = null;
      let exUsed: "NSE" | "BSE" | null = null;
      let idUsed: string | null = null;
      if (ids.NSE) {
        idUsed = ids.NSE; exUsed = "NSE";
        ltp = await fetchDhanLtp(ids.NSE, "NSE_EQ");
      }
      if (ltp == null && ids.BSE) {
        idUsed = ids.BSE; exUsed = "BSE";
        ltp = await fetchDhanLtp(ids.BSE, "BSE_EQ");
      }

      attempts.push({
        symbol: sym,
        exchange: exUsed,
        dhan_security_id_used: idUsed,
        ltp_or_null: ltp,
        source: "dhan",
      });

      if (ltp == null) {
        errors.push({
          symbol: sym,
          reason: `dhan_returned_null (tried NSE id=${ids.NSE ?? "n/a"}${ids.BSE ? `, BSE id=${ids.BSE}` : ""})`,
        });
        continue;
      }

      const { error: upErr } = await supabase
        .from("ltp_cache")
        .upsert(
          { symbol: sym, exchange: exUsed!, ltp, as_of: nowIso, source: "dhan", fetched_at: nowIso, updated_at: nowIso },
          { onConflict: "symbol" },
        );
      if (upErr) {
        errors.push({ symbol: sym, reason: `upsert_failed: ${upErr.message}` });
        continue;
      }
      updated++;
    }

    // Telemetry — only for full-universe runs; partial inline refreshes
    // (filter_applied) must not overwrite the daily summary.
    if (!filterSymbols) {
      await supabase.from("stock_picker_runtime_config").upsert(
        {
          config_key: "last_sync_ltp_dhan",
          kind: "operational",
          config_value: { ok: true, symbols_updated: updated, errors_count: errors.length, ran_at: ranAt },
          description: "Last sync-ltp-dhan run summary",
          updated_at: ranAt,
        },
        { onConflict: "config_key" },
      );
    }

    await logTelemetry({
      status: errors.length === 0 ? "ok" : (updated === 0 ? "error" : "partial"),
      processed: updated,
      errors_count: errors.length,
      details: { filter_applied: filterSymbols != null, errors_sample: errors.slice(0, 10) },
    });
    return json({ ok: true, symbols_updated: updated, attempts, errors, filter_applied: filterSymbols != null });
  } catch (e) {
    await logTelemetry({ status: "error", processed: 0, errors_count: 1, error_message: String(e) });
    return json({ ok: false, error: String(e) }, 500);
  }
});
