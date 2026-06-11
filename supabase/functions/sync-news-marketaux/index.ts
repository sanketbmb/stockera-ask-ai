// Phase 2E — Background news sync (Marketaux)
// Reads universe_override_symbols, fetches news via marketaux-fetch,
// inserts up to 5 latest items per symbol into public.news_cache.
// Unique (symbol, url, published_at) handles dedupe.

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

interface NewsItem {
  headline: string;
  url: string | null;
  published_at: string;
  source: string;
}

async function fetchMarketauxFor(symbol: string): Promise<NewsItem[]> {
  // Try .NS variant (Indian listings); fallback to bare symbol.
  const variants = [`${symbol}.NS`, symbol];
  for (const sym of variants) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/marketaux-fetch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_KEY,
          authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          endpoint: "news/all",
          symbols: sym,
          params: { limit: 5, language: "en" },
        }),
      });
      const text = await res.text();
      let body: Record<string, unknown> = {};
      try { body = text ? JSON.parse(text) : {}; } catch { /* */ }
      if (!res.ok || body.success !== true) continue;
      const data = body.data as Record<string, unknown> | undefined;
      const items = (data?.data as Array<Record<string, unknown>> | undefined) ?? [];
      if (items.length === 0) continue;
      const mapped: NewsItem[] = [];
      for (const it of items.slice(0, 5)) {
        const title = typeof it.title === "string" ? it.title.trim() : "";
        const url = typeof it.url === "string" ? it.url : null;
        const published = typeof it.published_at === "string" ? it.published_at : null;
        if (!title || !published) continue;
        const src = typeof it.source === "string" ? it.source : "marketaux";
        mapped.push({ headline: title, url, published_at: published, source: src });
      }
      if (mapped.length > 0) return mapped;
    } catch { /* try next variant */ }
  }
  return [];
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
      .in("config_key", ["marketaux_api_enabled", "universe_override_symbols", "universe_override_enabled"]);
    const cfg = new Map<string, unknown>();
    for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value);

    if (cfg.get("marketaux_api_enabled") !== true) {
      return json({ ok: true, skipped: "marketaux_api_enabled=false", symbols_inserted: 0, dedup_skipped: 0, errors: [] });
    }
    if (cfg.get("universe_override_enabled") !== true) {
      return json({ ok: true, skipped: "universe_override_enabled=false", symbols_inserted: 0, dedup_skipped: 0, errors: [] });
    }
    const symbols = (cfg.get("universe_override_symbols") as string[] | undefined) ?? [];
    if (symbols.length === 0) {
      return json({ ok: true, symbols_inserted: 0, dedup_skipped: 0, errors: ["no override symbols"] });
    }

    const errors: Array<{ symbol: string; reason: string }> = [];
    let inserted = 0;
    let dedup = 0;
    const perSymbol: Record<string, number> = {};

    for (const sym of symbols) {
      const items = await fetchMarketauxFor(sym);
      if (items.length === 0) {
        errors.push({ symbol: sym, reason: "no_articles_returned" });
        perSymbol[sym] = 0;
        continue;
      }
      const rows = items.map((it) => ({
        symbol: sym,
        exchange: "NSE",
        headline: it.headline,
        url: it.url,
        source: it.source,
        published_at: it.published_at,
        category: null,
      }));
      // Use upsert on the unique key to soak up dedup without errors.
      const { data: ins, error: upErr } = await supabase
        .from("news_cache")
        .upsert(rows, { onConflict: "symbol,url,published_at", ignoreDuplicates: true })
        .select("id");
      if (upErr) {
        errors.push({ symbol: sym, reason: `upsert_failed: ${upErr.message}` });
        continue;
      }
      const insertedHere = (ins ?? []).length;
      inserted += insertedHere;
      dedup += rows.length - insertedHere;
      perSymbol[sym] = insertedHere;
    }

    return json({ ok: true, symbols_inserted: inserted, dedup_skipped: dedup, per_symbol: perSymbol, errors });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
