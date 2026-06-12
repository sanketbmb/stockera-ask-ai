// Phase 2X.4 — Fundamentals sync: FinEdge primary + Twelve Data fallback (equities only).
// Reads universe_override_symbols (object-shape tolerant), per-symbol error capture,
// idempotent skip if updated within 24h, runtime cap, cron_run_log telemetry.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWELVE_DATA_API_KEY = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";

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

function parseOverrideSymbols(raw: unknown): Array<{ symbol: string; exchange: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ symbol: string; exchange: string }> = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let s: string | null = null;
    let ex = "NSE";
    if (typeof item === "string") s = item;
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.symbol === "string") s = o.symbol;
      if (typeof o.exchange === "string") ex = o.exchange;
    }
    if (!s) continue;
    const k = `${s}|${ex}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ symbol: s, exchange: ex });
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FinEdgeResult {
  status: "ok" | "miss";
  sector: string | null;
  industry: string | null;
  mcap: number | null;
  reason: string | null;
  http_status: number | null;
}

async function callFinEdgeRaw(endpoint: string, symbol: string): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
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
    const upstreamStatus = typeof body.status === "number" ? (body.status as number) : res.status;
    const success = body.success === true && res.ok;
    return { ok: success, status: upstreamStatus, data: success ? ((body.data as Record<string, unknown>) ?? null) : null };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

async function tryFinEdge(symbol: string): Promise<FinEdgeResult> {
  const profile = await callFinEdgeRaw("company-profile", symbol);
  await sleep(150);
  const ratios = await callFinEdgeRaw("ratios", symbol);

  // Honest auth/rate-limit/404 detection
  if (profile.status === 401 || ratios.status === 401) {
    return { status: "miss", sector: null, industry: null, mcap: null, reason: "finedge_auth", http_status: 401 };
  }
  if (profile.status === 429 || ratios.status === 429) {
    return { status: "miss", sector: null, industry: null, mcap: null, reason: "finedge_rate_limit", http_status: 429 };
  }
  if (!profile.ok && !ratios.ok) {
    const code = profile.status || ratios.status || 0;
    if (code === 404) return { status: "miss", sector: null, industry: null, mcap: null, reason: "finedge_404", http_status: 404 };
    return { status: "miss", sector: null, industry: null, mcap: null, reason: `finedge_unknown_${code}`, http_status: code };
  }

  const profileObj = (profile.data ?? {}) as Record<string, unknown>;
  const ratiosObj = (ratios.data ?? {}) as Record<string, unknown>;
  const profileInner = (profileObj.data ?? profileObj.companyProfile ?? profileObj) as Record<string, unknown>;
  const ratiosInner = (ratiosObj.data ?? ratiosObj) as Record<string, unknown>;

  const sector = pickStr(profileInner.sector, profileInner.Sector, (profileObj as Record<string, unknown>).sector);
  const industry = pickStr(profileInner.industry, profileInner.Industry, (profileObj as Record<string, unknown>).industry);
  let mcap = pickNum(
    profileInner.marketCap, profileInner.market_cap, profileInner.MarketCap,
    ratiosInner.marketCap, ratiosInner.market_cap,
    (profileObj as Record<string, unknown>).marketCap,
  );
  if (mcap != null && mcap > 0 && mcap < 10_000_000) mcap = mcap * 10_000_000;

  if (sector == null && industry == null && mcap == null) {
    return { status: "miss", sector: null, industry: null, mcap: null, reason: "finedge_no_fields", http_status: 200 };
  }
  return { status: "ok", sector, industry, mcap, reason: null, http_status: 200 };
}

interface TwelveDataResult {
  status: "ok" | "miss";
  sector: string | null;
  industry: string | null;
  mcap: number | null;
  reason: string | null;
}

// USD→INR conversion is non-trivial; the spec says if unit ambiguous, write NULL.
// Twelve Data returns market_capitalization in the LISTING currency. For .NS / .BO
// listings, that is INR. We accept the value as-is for those suffixes only.
async function tryTwelveData(symbol: string, exchange: string): Promise<TwelveDataResult> {
  if (!TWELVE_DATA_API_KEY) {
    return { status: "miss", sector: null, industry: null, mcap: null, reason: "twelvedata_no_key" };
  }
  const suffix = exchange === "BSE" ? "BSE" : "NSE";
  const tdSymbol = `${symbol}.${suffix}`;
  const profileUrl = `https://api.twelvedata.com/profile?symbol=${encodeURIComponent(tdSymbol)}&apikey=${encodeURIComponent(TWELVE_DATA_API_KEY)}`;
  const statsUrl = `https://api.twelvedata.com/statistics?symbol=${encodeURIComponent(tdSymbol)}&apikey=${encodeURIComponent(TWELVE_DATA_API_KEY)}`;

  let sector: string | null = null;
  let industry: string | null = null;
  let mcap: number | null = null;
  let httpFatal: string | null = null;

  try {
    const pRes = await fetch(profileUrl);
    if (pRes.status === 401 || pRes.status === 403) httpFatal = "twelvedata_auth";
    else if (pRes.status === 429) httpFatal = "twelvedata_rate_limit";
    else {
      const pBody = await pRes.json().catch(() => ({} as Record<string, unknown>));
      if (pBody && typeof pBody === "object") {
        const o = pBody as Record<string, unknown>;
        // Twelve Data error shape: { code, message, status: "error" }
        if (o.status === "error") {
          const code = typeof o.code === "number" ? o.code : 0;
          if (code === 404) httpFatal = "twelvedata_404";
        } else {
          sector = pickStr(o.sector, o.Sector);
          industry = pickStr(o.industry, o.Industry);
        }
      }
    }
  } catch { /* swallow, treated as miss below */ }

  if (httpFatal && httpFatal !== "twelvedata_404") {
    return { status: "miss", sector: null, industry: null, mcap: null, reason: httpFatal };
  }

  await sleep(300);

  try {
    const sRes = await fetch(statsUrl);
    if (sRes.status !== 401 && sRes.status !== 403 && sRes.status !== 429) {
      const sBody = await sRes.json().catch(() => ({} as Record<string, unknown>));
      if (sBody && typeof sBody === "object") {
        const o = sBody as Record<string, unknown>;
        if (o.status !== "error") {
          // statistics shape: { statistics: { valuations_metrics: { market_capitalization: N }, ... } }
          const stats = (o.statistics as Record<string, unknown> | undefined) ?? o;
          const vm = (stats?.valuations_metrics as Record<string, unknown> | undefined) ?? {};
          mcap = pickNum(
            (vm as Record<string, unknown>).market_capitalization,
            (stats as Record<string, unknown>).market_capitalization,
            (o as Record<string, unknown>).market_capitalization,
          );
          // For .NS/.BO listings the currency is INR. If exchange is anything else we can't trust unit.
          if (mcap != null && suffix !== "NSE" && suffix !== "BSE") {
            mcap = null;
          }
        }
      }
    }
  } catch { /* swallow */ }

  if (sector == null && industry == null && mcap == null) {
    return { status: "miss", sector: null, industry: null, mcap: null, reason: "twelvedata_no_fields" };
  }
  return { status: "ok", sector, industry, mcap, reason: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

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

    const reqBody = await req.json().catch(() => ({} as Record<string, unknown>));
    const force = reqBody?.force === true;

    const { data: cfgRows } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_key, config_value")
      .in("config_key", [
        "finedge_api_enabled",
        "universe_override_symbols",
        "universe_override_enabled",
        "fundamentals_finedge_primary_enabled",
        "fundamentals_twelvedata_fallback_enabled",
        "fundamentals_max_runtime_ms",
      ]);
    const cfg = new Map<string, unknown>();
    for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value);

    if (cfg.get("finedge_api_enabled") !== true || cfg.get("fundamentals_finedge_primary_enabled") !== true) {
      return json({ ok: true, skipped: "finedge_disabled", processed: 0, errors_count: 0 });
    }
    if (cfg.get("universe_override_enabled") !== true) {
      return json({ ok: true, skipped: "universe_override_enabled=false", processed: 0, errors_count: 0 });
    }
    const tdFallbackEnabled = cfg.get("fundamentals_twelvedata_fallback_enabled") === true;
    const maxRuntimeMs = typeof cfg.get("fundamentals_max_runtime_ms") === "number"
      ? (cfg.get("fundamentals_max_runtime_ms") as number) : 60000;

    const symbols = parseOverrideSymbols(cfg.get("universe_override_symbols"));
    if (symbols.length === 0) {
      return json({ ok: true, processed: 0, errors_count: 0, details: { reason: "no override symbols" } });
    }

    // Inline cleanliness gate: only equities with dhan_security_id, not suspended, equity type/segment,
    // exclude bonds/etf patterns. Pull stock_master once.
    const { data: masters } = await supabase
      .from("stock_master")
      .select("symbol, exchange, type, segment, dhan_security_id, is_suspended, company_name")
      .in("symbol", symbols.map((s) => s.symbol));
    const masterKey = new Map<string, Record<string, unknown>>();
    for (const m of masters ?? []) masterKey.set(`${m.symbol}|${m.exchange}`, m as Record<string, unknown>);

    const isCleanEquity = (sym: string, ex: string): { ok: boolean; reason?: string } => {
      const m = masterKey.get(`${sym}|${ex}`);
      if (!m) return { ok: true }; // no master row — don't block, just call vendor
      if (m.is_suspended === true) return { ok: false, reason: "suspended" };
      if (m.dhan_security_id == null || String(m.dhan_security_id) === "") return { ok: false, reason: "no_dhan_security_id" };
      const typ = String(m.type ?? "").toUpperCase();
      const seg = String(m.segment ?? "").toUpperCase();
      if (typ && !["EQUITY", "EQ", "STOCK", ""].includes(typ)) return { ok: false, reason: `non_equity_type:${typ}` };
      if (seg && !["E", "EQ", "NSE_EQ", "BSE_EQ", "EQUITY", ""].includes(seg)) return { ok: false, reason: `non_equity_segment:${seg}` };
      const name = String(m.company_name ?? "").toLowerCase();
      if (/\b(bond|etf|sgb|gilt|liquidbees|debenture|ncd)\b/.test(name)) return { ok: false, reason: "bond_or_etf_pattern" };
      return { ok: true };
    };

    // Idempotent skip if updated_at within 24h (unless force).
    const cutoffIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("fundamentals_cache")
      .select("symbol, exchange, sector, market_cap_rs, updated_at")
      .in("symbol", symbols.map((s) => s.symbol));
    const freshKey = new Set<string>();
    for (const r of existing ?? []) {
      const k = `${r.symbol}|${r.exchange}`;
      if (!force && r.updated_at && (r.updated_at as string) > cutoffIso && r.sector != null && r.market_cap_rs != null) {
        freshKey.add(k);
      }
    }

    const attempts: Array<Record<string, unknown>> = [];
    const stillMissing: string[] = [];
    let finedgeOk = 0;
    let finedgeMissed = 0;
    let twelveRecovered = 0;
    let processed = 0;
    let pendingCount = 0;
    let earlyExit = false;

    for (const { symbol: sym, exchange: ex } of symbols) {
      const key = `${sym}|${ex}`;
      if (freshKey.has(key)) {
        attempts.push({ symbol: sym, exchange: ex, source: "cache", status: "fresh_skip" });
        continue;
      }
      const cleanliness = isCleanEquity(sym, ex);
      if (!cleanliness.ok) {
        attempts.push({ symbol: sym, exchange: ex, source: "none", status: "skipped_unclean", reason: cleanliness.reason });
        continue;
      }
      if (Date.now() - startedMs > maxRuntimeMs) {
        pendingCount++;
        earlyExit = true;
        attempts.push({ symbol: sym, exchange: ex, source: "none", status: "pending_runtime_cap" });
        continue;
      }

      // PRIMARY: FinEdge — NSE form first, BSE if 404/not-found.
      let fe = await tryFinEdge(sym);
      if (fe.status === "miss" && fe.reason === "finedge_404" && ex === "NSE") {
        await sleep(250);
        const bseTry = await tryFinEdge(sym); // FinEdge symbol is exchange-agnostic; retry once
        if (bseTry.status === "ok") fe = bseTry;
      }
      await sleep(250);

      let finalSector: string | null = null;
      let finalIndustry: string | null = null;
      let finalMcap: number | null = null;
      let source: "finedge" | "twelve_data" | "none" = "none";

      if (fe.status === "ok") {
        finalSector = fe.sector;
        finalIndustry = fe.industry;
        finalMcap = fe.mcap;
        source = "finedge";
        finedgeOk++;
        attempts.push({
          symbol: sym, exchange: ex, source: "finedge", status: "ok",
          missing_fields: [
            finalSector == null ? "sector" : null,
            finalIndustry == null ? "industry" : null,
            finalMcap == null ? "market_cap" : null,
          ].filter((x) => x !== null),
        });
      } else {
        finedgeMissed++;
        const feAttempt: Record<string, unknown> = {
          symbol: sym, exchange: ex, source: "finedge", status: "miss",
          reason: fe.reason, http_status: fe.http_status,
        };

        if (tdFallbackEnabled) {
          const td = await tryTwelveData(sym, ex);
          await sleep(300);
          if (td.status === "ok") {
            finalSector = td.sector;
            finalIndustry = td.industry;
            finalMcap = td.mcap;
            source = "twelve_data";
            twelveRecovered++;
            feAttempt.fallback = { source: "twelve_data", status: "ok" };
          } else {
            feAttempt.fallback = { source: "twelve_data", status: "miss", reason: td.reason };
            stillMissing.push(`${sym}/${ex}`);
          }
        } else {
          stillMissing.push(`${sym}/${ex}`);
        }
        attempts.push(feAttempt);
      }

      if (source !== "none") {
        const nowIso = new Date().toISOString();
        const { error: upErr } = await supabase
          .from("fundamentals_cache")
          .upsert(
            {
              symbol: sym, exchange: ex,
              sector: finalSector, industry: finalIndustry,
              market_cap_rs: finalMcap, cap_band: capBand(finalMcap),
              source, as_of: nowIso, updated_at: nowIso,
            },
            { onConflict: "symbol,exchange" },
          );
        if (upErr) {
          attempts.push({ symbol: sym, exchange: ex, source, status: "upsert_failed", reason: upErr.message });
        } else {
          processed++;
        }
      }
    }

    const errorsCount = stillMissing.length;
    const status = earlyExit ? "partial" : (errorsCount === 0 ? "ok" : (processed === 0 ? "error" : "partial"));

    try {
      await supabase.from("stock_picker_runtime_config").upsert(
        {
          config_key: "last_sync_fundamentals_finedge",
          kind: "operational",
          config_value: {
            ok: true, processed, errors_count: errorsCount,
            finedge_ok: finedgeOk, twelve_data_recovered: twelveRecovered,
            still_missing: stillMissing.length, ran_at: new Date().toISOString(),
          },
        },
        { onConflict: "config_key" },
      );
    } catch { /* best-effort */ }

    await logTelemetry({
      status,
      processed,
      errors_count: errorsCount,
      details: {
        finedge_ok: finedgeOk,
        finedge_missed: finedgeMissed,
        twelve_data_recovered: twelveRecovered,
        still_missing: stillMissing.length,
        missing_symbols: stillMissing,
        pending_runtime_cap: pendingCount,
        attempts_sample: attempts.slice(0, 20),
      },
    });

    return json({
      ok: true, status, processed, errors_count: errorsCount,
      details: {
        finedge_ok: finedgeOk, finedge_missed: finedgeMissed,
        twelve_data_recovered: twelveRecovered, still_missing: stillMissing.length,
        missing_symbols: stillMissing, pending_runtime_cap: pendingCount,
      },
    });
  } catch (e) {
    await logTelemetry({ status: "error", processed: 0, errors_count: 1, error_message: String(e) });
    return json({ ok: false, error: String(e) }, 500);
  }
});
