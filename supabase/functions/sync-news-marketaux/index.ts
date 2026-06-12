// Phase 2F — Background news sync (Marketaux), with ticker/company-name fallback + telemetry.
// Tries Marketaux symbols=.NS, then symbols=.BO, then entity_types=equity & search=<company>.
// Stops at the first attempt that yields items. Inserts only real items.

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

function normalizeCompany(name: string): string {
  // Marketaux "search" works best with a short, lowercased phrase; trim suffixes.
  return name
    .toLowerCase()
    .replace(/\b(ltd\.?|limited|services|servic|serv)\b/g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();
}

async function callMarketaux(params: Record<string, string>): Promise<NewsItem[]> {
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
        symbols: params.symbols, // may be undefined
        params: {
          limit: 5,
          language: "en",
          ...(params.search ? { search: params.search } : {}),
          ...(params.entity_types ? { entity_types: params.entity_types } : {}),
          ...(params.countries ? { countries: params.countries } : {}),
        },
      }),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try { body = text ? JSON.parse(text) : {}; } catch { /* */ }
    if (!res.ok || body.success !== true) return [];
    const data = body.data as Record<string, unknown> | undefined;
    const items = (data?.data as Array<Record<string, unknown>> | undefined) ?? [];
    const mapped: NewsItem[] = [];
    for (const it of items.slice(0, 5)) {
      const title = typeof it.title === "string" ? it.title.trim() : "";
      const url = typeof it.url === "string" ? it.url : null;
      const published = typeof it.published_at === "string" ? it.published_at : null;
      if (!title || !published) continue;
      const src = typeof it.source === "string" ? it.source : "marketaux";
      mapped.push({ headline: title, url, published_at: published, source: src });
    }
    return mapped;
  } catch {
    return [];
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
          function_name: "sync-news-marketaux",
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
      .in("config_key", ["marketaux_api_enabled", "universe_override_symbols", "universe_override_enabled"]);
    const cfg = new Map<string, unknown>();
    for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value);

    if (cfg.get("marketaux_api_enabled") !== true) {
      return json({ ok: true, skipped: "marketaux_api_enabled=false", symbols_inserted: 0, attempts: [], errors: [] });
    }
    if (cfg.get("universe_override_enabled") !== true) {
      return json({ ok: true, skipped: "universe_override_enabled=false", symbols_inserted: 0, attempts: [], errors: [] });
    }
    const symbols = parseOverrideSymbols(cfg.get("universe_override_symbols")).map((e) => e.symbol);
    if (symbols.length === 0) {
      return json({ ok: true, symbols_inserted: 0, attempts: [], errors: ["no override symbols"] });
    }

    // Load company_name from stock_master (prefer NSE row).
    const { data: masters } = await supabase
      .from("stock_master")
      .select("symbol, exchange, company_name")
      .in("symbol", symbols);
    const companyMap = new Map<string, string>();
    for (const m of masters ?? []) {
      const sym = m.symbol as string;
      const cn = (m.company_name as string) ?? "";
      if (!cn) continue;
      if (m.exchange === "NSE" || !companyMap.has(sym)) companyMap.set(sym, cn);
    }

    const errors: Array<{ symbol: string; reason: string }> = [];
    const attemptsOut: Array<Record<string, unknown>> = [];
    let inserted = 0;

    for (const sym of symbols) {
      const tries: Array<{ label: string; params: Record<string, string> }> = [
        { label: "ticker_ns", params: { symbols: `${sym}.NS` } },
        { label: "ticker_bo", params: { symbols: `${sym}.BO` } },
      ];
      const company = companyMap.get(sym);
      if (company) {
        tries.push({
          label: "company_name",
          params: { search: normalizeCompany(company), entity_types: "equity", countries: "in" },
        });
      }

      const attemptLabels: string[] = [];
      let items: NewsItem[] = [];
      let queryUsed = "";
      for (const t of tries) {
        attemptLabels.push(t.label);
        const got = await callMarketaux(t.params);
        if (got.length > 0) {
          items = got;
          queryUsed = t.params.symbols ?? `search=${t.params.search}`;
          break;
        }
      }

      if (items.length === 0) {
        errors.push({ symbol: sym, reason: "no_articles_from_marketaux_after_fallbacks" });
        attemptsOut.push({
          symbol: sym,
          query_used: null,
          attempts: attemptLabels,
          inserted_count: 0,
          reason_if_zero: "no_articles_from_marketaux_after_fallbacks",
        });
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
      const { data: ins, error: upErr } = await supabase
        .from("news_cache")
        .upsert(rows, { onConflict: "symbol,url,published_at", ignoreDuplicates: true })
        .select("id");
      if (upErr) {
        errors.push({ symbol: sym, reason: `upsert_failed: ${upErr.message}` });
        attemptsOut.push({
          symbol: sym,
          query_used: queryUsed,
          attempts: attemptLabels,
          inserted_count: 0,
          reason_if_zero: `upsert_failed: ${upErr.message}`,
        });
        continue;
      }
      const insertedHere = (ins ?? []).length;
      inserted += insertedHere;
      attemptsOut.push({
        symbol: sym,
        query_used: queryUsed,
        attempts: attemptLabels,
        inserted_count: insertedHere,
        reason_if_zero: null,
      });
    }

    await supabase.from("stock_picker_runtime_config").upsert(
      {
        config_key: "last_sync_news_marketaux",
        kind: "operational",
        config_value: { ok: true, symbols_inserted: inserted, errors_count: errors.length, ran_at: ranAt },
        description: "Last sync-news-marketaux run summary",
        updated_at: ranAt,
      },
      { onConflict: "config_key" },
    );

    await logTelemetry({
      status: errors.length === 0 ? "ok" : (inserted === 0 ? "error" : "partial"),
      processed: inserted,
      errors_count: errors.length,
      details: { errors_sample: errors.slice(0, 10) },
    });
    return json({ ok: true, symbols_inserted: inserted, attempts: attemptsOut, errors });
  } catch (e) {
    await logTelemetry({ status: "error", processed: 0, errors_count: 1, error_message: String(e) });
    return json({ ok: false, error: String(e) }, 500);
  }
});
