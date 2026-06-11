// Phase 2E — Background LTP sync (Dhan)
// Reads universe_override_symbols from runtime_config, fetches LTP via dhan-fetch,
// upserts public.ltp_cache. Isolated from user request path.

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
      return json({ ok: true, skipped: "dhan_api_enabled=false", symbols_updated: 0, errors: [] });
    }
    if (cfg.get("universe_override_enabled") !== true) {
      return json({ ok: true, skipped: "universe_override_enabled=false", symbols_updated: 0, errors: [] });
    }
    const symbols = (cfg.get("universe_override_symbols") as string[] | undefined) ?? [];
    if (symbols.length === 0) {
      return json({ ok: true, symbols_updated: 0, errors: ["no override symbols"] });
    }

    const { data: masters, error: mErr } = await supabase
      .from("stock_master")
      .select("symbol, dhan_security_id, segment")
      .in("symbol", symbols)
      .eq("segment", "NSE_EQ");
    if (mErr) return json({ ok: false, error: mErr.message }, 500);

    const errors: Array<{ symbol: string; reason: string }> = [];
    let updated = 0;
    const nowIso = new Date().toISOString();

    for (const m of masters ?? []) {
      const sym = m.symbol as string;
      const secId = String(m.dhan_security_id);
      const ltp = await fetchDhanLtp(secId, "NSE_EQ");
      if (ltp == null) {
        errors.push({ symbol: sym, reason: "dhan_fetch_returned_null" });
        continue;
      }
      const { error: upErr } = await supabase
        .from("ltp_cache")
        .upsert(
          { symbol: sym, exchange: "NSE", ltp, as_of: nowIso, source: "dhan", fetched_at: nowIso, updated_at: nowIso },
          { onConflict: "symbol" },
        );
      if (upErr) {
        errors.push({ symbol: sym, reason: `upsert_failed: ${upErr.message}` });
        continue;
      }
      updated++;
    }

    return json({ ok: true, symbols_updated: updated, errors });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
