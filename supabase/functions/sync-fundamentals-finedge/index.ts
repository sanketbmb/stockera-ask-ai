// Phase 2X.4c — Fundamentals sync: FinEdge primary + Twelve Data fallback (equities only).
// Adds serialized pacing, transient retry-with-backoff, idempotent fresh-skip, and
// http_status histogram telemetry on top of Phase 2X.4/2X.4b behavior.

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TRANSIENT = new Set([0, 429, 500, 502, 503, 504]);

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

interface FinEdgeResult {
  status: "ok" | "miss";
  sector: string | null;
  industry: string | null;
  mcap: number | null;
  reason: string | null;
  http_status: number;
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

async function tryFinEdgeOnce(symbol: string, sleepMs: number): Promise<FinEdgeResult> {
  const profile = await callFinEdgeRaw("company-profile", symbol);
  await sleep(sleepMs);
  const ratios = await callFinEdgeRaw("ratios", symbol);

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
  http_status: number;
}

async function tryTwelveDataOnce(symbol: string, exchange: string, sleepMs: number): Promise<TwelveDataResult> {
  if (!TWELVE_DATA_API_KEY) {
    return { status: "miss", sector: null, industry: null, mcap: null, reason: "twelvedata_no_key", http_status: 0 };
  }
  const suffix = exchange === "BSE" ? "BSE" : "NSE";
  const tdSymbol = `${symbol}.${suffix}`;
  const profileUrl = `https://api.twelvedata.com/profile?symbol=${encodeURIComponent(tdSymbol)}&apikey=${encodeURIComponent(TWELVE_DATA_API_KEY)}`;
  const statsUrl = `https://api.twelvedata.com/statistics?symbol=${encodeURIComponent(tdSymbol)}&apikey=${encodeURIComponent(TWELVE_DATA_API_KEY)}`;

  let sector: string | null = null;
  let industry: string | null = null;
  let mcap: number | null = null;
  let httpStatus = 200;

  try {
    const pRes = await fetch(profileUrl);
    httpStatus = pRes.status;
    if (pRes.status === 401 || pRes.status === 403) {
      return { status: "miss", sector: null, industry: null, mcap: null, reason: "twelvedata_auth", http_status: pRes.status };
    }
    if (pRes.status === 429) {
      return { status: "miss", sector: null, industry: null, mcap: null, reason: "twelvedata_rate_limit", http_status: 429 };
    }
    const pBody = await pRes.json().catch(() => ({} as Record<string, unknown>));
    if (pBody && typeof pBody === "object") {
      const o = pBody as Record<string, unknown>;
      if (o.status === "error") {
        const code = typeof o.code === "number" ? o.code : 0;
        if (code === 404) httpStatus = 404;
      } else {
        sector = pickStr(o.sector, o.Sector);
        industry = pickStr(o.industry, o.Industry);
      }
    }
  } catch {
    return { status: "miss", sector: null, industry: null, mcap: null, reason: "twelvedata_fetch_error", http_status: 0 };
  }

  await sleep(sleepMs);

  try {
    const sRes = await fetch(statsUrl);
    if (sRes.status === 401 || sRes.status === 403) {
      return { status: "miss", sector, industry, mcap: null, reason: "twelvedata_auth", http_status: sRes.status };
    }
    if (sRes.status === 429) {
      return { status: "miss", sector, industry, mcap: null, reason: "twelvedata_rate_limit", http_status: 429 };
    }
    const sBody = await sRes.json().catch(() => ({} as Record<string, unknown>));
    if (sBody && typeof sBody === "object") {
      const o = sBody as Record<string, unknown>;
      if (o.status !== "error") {
        const stats = (o.statistics as Record<string, unknown> | undefined) ?? o;
        const vm = (stats?.valuations_metrics as Record<string, unknown> | undefined) ?? {};
        mcap = pickNum(
          (vm as Record<string, unknown>).market_capitalization,
          (stats as Record<string, unknown>).market_capitalization,
          (o as Record<string, unknown>).market_capitalization,
        );
        if (mcap != null && suffix !== "NSE" && suffix !== "BSE") {
          mcap = null;
        }
      }
    }
  } catch {
    return { status: "miss", sector, industry, mcap: null, reason: "twelvedata_fetch_error", http_status: 0 };
  }

  if (sector == null && industry == null && mcap == null) {
    return { status: "miss", sector: null, industry: null, mcap: null, reason: "twelvedata_no_fields", http_status: httpStatus };
  }
  return { status: "ok", sector, industry, mcap, reason: null, http_status: httpStatus };
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
    const invokedBy = typeof reqBody?.invoked_by === "string" ? reqBody.invoked_by : null;

    const { data: cfgRows } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_key, config_value")
      .in("config_key", [
        "finedge_api_enabled",
        "universe_override_symbols",
        "universe_override_enabled",
        "active_universe_snapshot_id",
        "fundamentals_cursor_symbol",
        "fundamentals_per_tick_max",
        "fundamentals_finedge_primary_enabled",
        "fundamentals_twelvedata_fallback_enabled",
        "fundamentals_max_runtime_ms",
        "finedge_request_sleep_ms",
        "twelvedata_request_sleep_ms",
        "fundamentals_retry_max_attempts",
        "fundamentals_retry_backoff_ms",
        "fundamentals_skip_if_fresh_minutes",
      ]);
    const cfg = new Map<string, unknown>();
    for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value);

    if (cfg.get("finedge_api_enabled") !== true || cfg.get("fundamentals_finedge_primary_enabled") !== true) {
      return json({ ok: true, skipped: "finedge_disabled", processed: 0, errors_count: 0 });
    }
    const tdFallbackEnabled = cfg.get("fundamentals_twelvedata_fallback_enabled") === true;
    const num = (k: string, def: number): number => {
      const v = cfg.get(k);
      return typeof v === "number" && Number.isFinite(v) ? v : def;
    };
    const maxRuntimeMs = num("fundamentals_max_runtime_ms", 60000);
    const finedgeSleepMs = num("finedge_request_sleep_ms", 800);
    const twelveSleepMs = num("twelvedata_request_sleep_ms", 1500);
    const retryMaxAttempts = num("fundamentals_retry_max_attempts", 2);
    const retryBackoffMs = num("fundamentals_retry_backoff_ms", 2000);
    const freshMinutes = num("fundamentals_skip_if_fresh_minutes", 1440);
    const perTickMax = Math.max(1, num("fundamentals_per_tick_max", 40));

    // ---------- Universe resolver: snapshot primary, override fallback ----------
    type Sym = { symbol: string; exchange: string };
    let allSymbols: Sym[] = [];
    let universeMode: "active_snapshot" | "override_fallback" | "empty" = "empty";
    const snapshotIdRaw = cfg.get("active_universe_snapshot_id");
    const snapshotId = typeof snapshotIdRaw === "string" && snapshotIdRaw.length > 0 ? snapshotIdRaw : null;
    if (snapshotId) {
      const CHUNK = 1000;
      for (let from = 0; ; from += CHUNK) {
        const { data: rows, error: mErr } = await supabase
          .from("stock_picker_universe_snapshot_member")
          .select("symbol, exchange")
          .eq("universe_snapshot_id", snapshotId)
          .order("symbol", { ascending: true })
          .range(from, from + CHUNK - 1);
        if (mErr) break;
        if (!rows || rows.length === 0) break;
        for (const r of rows) {
          if (!r.symbol) continue;
          const ex = r.exchange === "BSE" ? "BSE" : "NSE";
          allSymbols.push({ symbol: r.symbol as string, exchange: ex });
        }
        if (rows.length < CHUNK) break;
      }
      if (allSymbols.length > 0) universeMode = "active_snapshot";
    }
    if (allSymbols.length === 0 && cfg.get("universe_override_enabled") === true) {
      const parsed = parseOverrideSymbols(cfg.get("universe_override_symbols"));
      if (parsed.length > 0) {
        allSymbols = parsed;
        universeMode = "override_fallback";
      }
    }
    if (allSymbols.length === 0) {
      await logTelemetry({
        status: "ok", processed: 0, errors_count: 0,
        details: { universe_mode: "empty", snapshot_id: snapshotId, members_total: 0, invoked_by: invokedBy },
      });
      return json({ ok: true, processed: 0, errors_count: 0, details: { reason: "empty universe", universe_mode: "empty", snapshot_id: snapshotId, invoked_by: invokedBy } });
    }

    // Sort ascending; apply rolling cursor + per-tick window.
    allSymbols.sort((a, b) => a.symbol.localeCompare(b.symbol));
    const membersTotal = allSymbols.length;
    const cursorRaw = cfg.get("fundamentals_cursor_symbol");
    const cursorStart: string | null = typeof cursorRaw === "string" && cursorRaw.length > 0 ? cursorRaw : null;
    let startIdx = 0;
    if (cursorStart) {
      const found = allSymbols.findIndex((s) => s.symbol > cursorStart);
      startIdx = found === -1 ? 0 : found;
    }
    let wrappedToStart = false;
    const symbols: Sym[] = [];
    for (let i = 0; i < perTickMax && i < membersTotal; i++) {
      let idx = startIdx + i;
      if (idx >= membersTotal) { idx -= membersTotal; wrappedToStart = true; }
      symbols.push(allSymbols[idx]);
    }

    const { data: masters } = await supabase
      .from("stock_master")
      .select("symbol, exchange, type, segment, dhan_security_id, is_suspended, company_name")
      .in("symbol", symbols.map((s) => s.symbol));
    const masterKey = new Map<string, Record<string, unknown>>();
    for (const m of masters ?? []) masterKey.set(`${m.symbol}|${m.exchange}`, m as Record<string, unknown>);

    const isCleanEquity = (sym: string, ex: string): { ok: boolean; reason?: string } => {
      const m = masterKey.get(`${sym}|${ex}`);
      if (!m) return { ok: true };
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

    // Idempotent fresh-skip window
    const freshCutoffIso = new Date(Date.now() - freshMinutes * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("fundamentals_cache")
      .select("symbol, exchange, sector, market_cap_rs, updated_at")
      .in("symbol", symbols.map((s) => s.symbol));
    const freshKey = new Set<string>();
    for (const r of existing ?? []) {
      const k = `${r.symbol}|${r.exchange}`;
      if (!force && r.updated_at && (r.updated_at as string) > freshCutoffIso && r.sector != null && r.market_cap_rs != null) {
        freshKey.add(k);
      }
    }

    const attempts: Array<Record<string, unknown>> = [];
    const stillMissing: string[] = [];
    const httpHistogram: Record<string, number> = {};
    const bumpHist = (code: number) => { const k = String(code); httpHistogram[k] = (httpHistogram[k] ?? 0) + 1; };

    let finedgeOk = 0;
    let finedgeMissed = 0;
    let twelveRecovered = 0;
    let processed = 0;
    let pendingCount = 0;
    let earlyExit = false;
    let retriesAttempted = 0;
    let retriesRecovered = 0;
    let skippedFresh = 0;

    // Strictly serial loop
    for (const { symbol: sym, exchange: ex } of symbols) {
      const key = `${sym}|${ex}`;
      try {
        if (freshKey.has(key)) {
          skippedFresh++;
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

        // === PRIMARY: FinEdge with transient retry ===
        let fe = await tryFinEdgeOnce(sym, finedgeSleepMs);
        bumpHist(fe.http_status);
        await sleep(finedgeSleepMs);
        let feRetries = 0;
        while (fe.status === "miss" && TRANSIENT.has(fe.http_status) && feRetries < retryMaxAttempts) {
          feRetries++;
          retriesAttempted++;
          await sleep(retryBackoffMs);
          fe = await tryFinEdgeOnce(sym, finedgeSleepMs);
          bumpHist(fe.http_status);
          await sleep(finedgeSleepMs);
          if (fe.status === "ok") { retriesRecovered++; break; }
        }

        let finalSector: string | null = null;
        let finalIndustry: string | null = null;
        let finalMcap: number | null = null;
        let source: "finedge" | "twelve_data" | "none" = "none";

        if (fe.status === "ok") {
          finalSector = fe.sector; finalIndustry = fe.industry; finalMcap = fe.mcap;
          source = "finedge";
          finedgeOk++;
          attempts.push({
            symbol: sym, exchange: ex, source: "finedge", status: "ok",
            retries: feRetries,
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
            reason: fe.reason, http_status: fe.http_status, retries: feRetries,
          };

          if (tdFallbackEnabled) {
            // === FALLBACK: Twelve Data with transient retry ===
            let td = await tryTwelveDataOnce(sym, ex, twelveSleepMs);
            bumpHist(td.http_status);
            await sleep(twelveSleepMs);
            let tdRetries = 0;
            while (td.status === "miss" && TRANSIENT.has(td.http_status) && tdRetries < retryMaxAttempts) {
              tdRetries++;
              retriesAttempted++;
              await sleep(retryBackoffMs);
              td = await tryTwelveDataOnce(sym, ex, twelveSleepMs);
              bumpHist(td.http_status);
              await sleep(twelveSleepMs);
              if (td.status === "ok") { retriesRecovered++; break; }
            }
            if (td.status === "ok") {
              finalSector = td.sector; finalIndustry = td.industry; finalMcap = td.mcap;
              source = "twelve_data";
              twelveRecovered++;
              feAttempt.fallback = { source: "twelve_data", status: "ok", retries: tdRetries };
            } else {
              feAttempt.fallback = { source: "twelve_data", status: "miss", reason: td.reason, http_status: td.http_status, retries: tdRetries };
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
      } catch (perSymErr) {
        attempts.push({ symbol: sym, exchange: ex, source: "none", status: "exception", reason: String(perSymErr) });
        stillMissing.push(`${sym}/${ex}`);
      }
    }

    const errorsCount = stillMissing.length;
    const status = earlyExit ? "partial" : (errorsCount === 0 ? "ok" : (processed === 0 ? "error" : "partial"));

    const cursorEnd: string | null = symbols.length > 0 ? symbols[symbols.length - 1].symbol : cursorStart;
    try {
      await supabase.from("stock_picker_runtime_config").upsert(
        { config_key: "fundamentals_cursor_symbol", kind: "operational", config_value: cursorEnd },
        { onConflict: "config_key" },
      );
    } catch { /* best-effort */ }

    try {
      await supabase.from("stock_picker_runtime_config").upsert(
        {
          config_key: "last_sync_fundamentals_finedge",
          kind: "operational",
          config_value: {
            ok: true, processed, errors_count: errorsCount,
            finedge_ok: finedgeOk, twelve_data_recovered: twelveRecovered,
            still_missing: stillMissing.length, ran_at: new Date().toISOString(),
            invoked_by: invokedBy,
            universe_mode: universeMode, members_total: membersTotal,
            members_seen: symbols.length, cursor_start: cursorStart,
            cursor_end: cursorEnd, wrapped_to_start: wrappedToStart,
          },
        },
        { onConflict: "config_key" },
      );
    } catch { /* best-effort */ }

    const details = {
      universe_mode: universeMode,
      snapshot_id: snapshotId,
      members_total: membersTotal,
      members_seen: symbols.length,
      cursor_start: cursorStart,
      cursor_end: cursorEnd,
      wrapped_to_start: wrappedToStart,
      finedge_ok: finedgeOk,
      finedge_missed: finedgeMissed,
      twelve_data_recovered: twelveRecovered,
      still_missing: stillMissing.length,
      missing_symbols: stillMissing,
      pending_runtime_cap: pendingCount,
      http_status_histogram: httpHistogram,
      retries_attempted: retriesAttempted,
      retries_recovered: retriesRecovered,
      skipped_fresh: skippedFresh,
      invoked_by: invokedBy,
      attempts_sample: attempts.slice(0, 20),
    };

    await logTelemetry({ status, processed, errors_count: errorsCount, details });

    return json({
      ok: true, status, processed, errors_count: errorsCount,
      details: {
        universe_mode: universeMode, snapshot_id: snapshotId,
        members_total: membersTotal, members_seen: symbols.length,
        cursor_start: cursorStart, cursor_end: cursorEnd,
        wrapped_to_start: wrappedToStart,
        finedge_ok: finedgeOk, finedge_missed: finedgeMissed,
        twelve_data_recovered: twelveRecovered, still_missing: stillMissing.length,
        missing_symbols: stillMissing, pending_runtime_cap: pendingCount,
        http_status_histogram: httpHistogram,
        retries_attempted: retriesAttempted,
        retries_recovered: retriesRecovered,
        skipped_fresh: skippedFresh,
        invoked_by: invokedBy,
      },
    });
  } catch (e) {
    await logTelemetry({ status: "error", processed: 0, errors_count: 1, error_message: String(e) });
    return json({ ok: false, error: String(e) }, 500);
  }
});
