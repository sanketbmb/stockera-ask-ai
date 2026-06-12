// Phase 2E — Background fundamentals sync (FinEdge)
// Reads universe_override_symbols, fetches company-profile via finedge-fetch,
// upserts public.fundamentals_cache. Cap band derived from market cap in INR.

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

function capBand(mcap: number | null): string | null {
  if (mcap == null || !Number.isFinite(mcap) || mcap <= 0) return null;
  if (mcap >= 200_000_000_000) return "large";
  if (mcap >= 50_000_000_000) return "mid";
  return "small";
}

function pickNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}
function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

async function callFinEdge(endpoint: string, symbol: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/finedge-fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ endpoint, symbol }),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try { body = text ? JSON.parse(text) : {}; } catch { /* */ }
    if (!res.ok || body.success !== true) return null;
    return (body.data as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const startedAt = new Date().toISOString();
  async function logTelemetry(args: { status: string; processed: number; errors_count: number; details?: Record<string, unknown>; error_message?: string }): Promise<void> {
    try {
      const finishedAt = new Date().toISOString();
      await fetch(`${SUPABASE_URL}/rest/v1/cron_run_log`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, Prefer: "return=minimal" },
        body: JSON.stringify({
          function_name: "sync-fundamentals-finedge",
          status: args.status,
          started_at: startedAt,
          finished_at: finishedAt,
          error_message: args.error_message ?? null,
          metrics: { status: args.status, processed: args.processed, errors_count: args.errors_count, details: args.details ?? {}, ran_at: finishedAt },
        }),
      }).catch(() => null);
    } catch { /* swallow */ }
  }
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });


    const { data: cfgRows } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_key, config_value")
      .in("config_key", ["finedge_api_enabled", "universe_override_symbols", "universe_override_enabled"]);
    const cfg = new Map<string, unknown>();
    for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value);

    if (cfg.get("finedge_api_enabled") !== true) {
      return json({ ok: true, skipped: "finedge_api_enabled=false", symbols_updated: 0, errors: [] });
    }
    if (cfg.get("universe_override_enabled") !== true) {
      return json({ ok: true, skipped: "universe_override_enabled=false", symbols_updated: 0, errors: [] });
    }
    const rawSymbols = (cfg.get("universe_override_symbols") as unknown[] | undefined) ?? [];
    // Normalize: config items may be either strings or {symbol, exchange} objects.
    const symbols: Array<{ symbol: string; exchange: string }> = [];
    const seenKey = new Set<string>();
    for (const item of rawSymbols) {
      let s: string | null = null;
      let ex: string = "NSE";
      if (typeof item === "string") s = item;
      else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        if (typeof o.symbol === "string") s = o.symbol;
        if (typeof o.exchange === "string") ex = o.exchange;
      }
      if (!s) continue;
      const k = `${s}|${ex}`;
      if (seenKey.has(k)) continue;
      seenKey.add(k);
      symbols.push({ symbol: s, exchange: ex });
    }
    if (symbols.length === 0) {
      return json({ ok: true, symbols_updated: 0, errors: ["no override symbols"] });
    }

    const errors: Array<{ symbol: string; reason: string }> = [];
    let updated = 0;
    const nowIso = new Date().toISOString();

    for (const { symbol: sym, exchange: ex } of symbols) {
      // Try company-profile for sector/industry, ratios for market cap.
      const profile = await callFinEdge("company-profile", sym);
      const ratios = await callFinEdge("ratios", sym);

      // FinEdge nests results in unpredictable shapes — extract defensively.
      const profileObj = (profile?.data ?? profile ?? {}) as Record<string, unknown>;
      const ratiosObj = (ratios?.data ?? ratios ?? {}) as Record<string, unknown>;

      const sector = pickStr(
        profileObj.sector, profileObj.Sector,
        (profileObj.companyProfile as Record<string, unknown> | undefined)?.sector,
      );
      const industry = pickStr(
        profileObj.industry, profileObj.Industry,
        (profileObj.companyProfile as Record<string, unknown> | undefined)?.industry,
      );
      let mcap = pickNum(
        profileObj.marketCap, profileObj.market_cap, profileObj.MarketCap,
        ratiosObj.marketCap, ratiosObj.market_cap,
        (profileObj.companyProfile as Record<string, unknown> | undefined)?.marketCap,
      );
      // FinEdge often returns market cap in INR crores; normalize to rupees if value is suspiciously small.
      if (mcap != null && mcap > 0 && mcap < 10_000_000) {
        // likely "in crores" — convert to rupees
        mcap = mcap * 10_000_000;
      }
      const band = capBand(mcap);

      if (sector == null && industry == null && mcap == null) {
        errors.push({ symbol: sym, reason: "no_fields_extracted" });
        continue;
      }

      const { error: upErr } = await supabase
        .from("fundamentals_cache")
        .upsert(
          {
            symbol: sym, exchange: ex,
            sector, industry,
            market_cap_rs: mcap, cap_band: band,
            source: "finedge", as_of: nowIso, updated_at: nowIso,
          },
          { onConflict: "symbol,exchange" },
        );
      if (upErr) {
        errors.push({ symbol: sym, reason: `upsert_failed: ${upErr.message}` });
        continue;
      }
      updated++;
    }

    // Telemetry — mirror shape used by sync-ltp-dhan / sync-news-marketaux.
    try {
      await supabase
        .from("stock_picker_runtime_config")
        .upsert(
          {
            config_key: "last_sync_fundamentals_finedge",
            kind: "operational",
            config_value: {
              ok: true,
              symbols_updated: updated,
              errors_count: errors.length,
              ran_at: new Date().toISOString(),
            },
          },
          { onConflict: "config_key" },
        );
    } catch { /* telemetry best-effort */ }

    return json({ ok: true, symbols_updated: updated, errors });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
