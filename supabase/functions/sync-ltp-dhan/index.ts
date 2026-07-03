// Phase 2F — Background LTP sync (Dhan), single-leg NSE-first/BSE-fallback.
// Reads universe_override_symbols from runtime_config, looks up canonical
// dhan_security_id per (symbol, segment) from stock_master (paginated to
// defeat PostgREST's silent 1000-row cap), fetches LTP via dhan-fetch with
// classified failures + Retry-After handling, upserts public.ltp_cache on
// the composite PK (symbol, exchange), and emits explicit telemetry counters.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---- Chunking / throttle knobs (writer-only; no DB / no UI impact) ----
const MASTER_CHUNK = 200;            // canonical stock_master pagination
const FULL_RUN_CHUNK = 50;           // symbols per Dhan batch
const INTER_CHUNK_PAUSE_MS = 800;    // pause between batches
const INTRA_CHUNK_PAUSE_MS = 0;      // no extra pause inside a batch

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

// Discriminated result for upstream failure classification.
type DhanFetchResult =
  | { kind: "ok"; ltp: number }
  | { kind: "dhan_null"; status: number; message: string | null }
  | { kind: "auth_error"; status: number; message: string | null }
  | { kind: "rate_limited"; retryAfterMs: number; status: number }
  | { kind: "fetch_error"; status: number; message: string };

function extractUpstreamMessage(body: Record<string, unknown>): string | null {
  const m = (body as { message?: unknown }).message
    ?? (body as { error?: unknown }).error
    ?? (body as { errorMessage?: unknown }).errorMessage;
  if (m == null) return null;
  return typeof m === "string" ? m : JSON.stringify(m);
}

async function fetchDhanLtp(securityId: string, segment: string): Promise<DhanFetchResult> {
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
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return { kind: "fetch_error", status: res.status, message: "non_json_response" };
    }

    const upstreamMsg = extractUpstreamMessage(body);
    if (res.status === 401 || res.status === 403) return { kind: "auth_error", status: res.status, message: upstreamMsg };
    if (res.status === 429) {
      const raHeader = res.headers.get("Retry-After");
      const raBody = (body as { retry_after?: unknown }).retry_after;
      const ra = Number(raHeader ?? raBody ?? 1);
      const retryAfterMs = Math.min(Math.max(500, (Number.isFinite(ra) ? ra : 1) * 1000), 5000);
      return { kind: "rate_limited", retryAfterMs, status: res.status };
    }
    if (res.status >= 500) return { kind: "fetch_error", status: res.status, message: upstreamMsg ?? `http_${res.status}` };
    if (!res.ok) return { kind: "fetch_error", status: res.status, message: upstreamMsg ?? `http_${res.status}` };

    if (body.success !== true) return { kind: "dhan_null", status: res.status, message: upstreamMsg };
    const data = body.data as Record<string, unknown> | undefined;
    const inner = data?.data as Record<string, unknown> | undefined;
    const seg = inner?.[segment] as Record<string, unknown> | undefined;
    const node = seg?.[securityId] as Record<string, unknown> | undefined;
    const ltp = node?.last_price ?? node?.ltp ?? node?.lastPrice;
    return typeof ltp === "number" && ltp > 0
      ? { kind: "ok", ltp }
      : { kind: "dhan_null", status: res.status, message: upstreamMsg };
  } catch (e) {
    return { kind: "fetch_error", status: 0, message: String(e) };
  }
}


async function fetchLtpWithRetry(id: string, seg: "NSE_EQ" | "BSE_EQ"): Promise<DhanFetchResult> {
  const r1 = await fetchDhanLtp(id, seg);
  if (r1.kind === "rate_limited") {
    await new Promise((r) => setTimeout(r, r1.retryAfterMs));
    return fetchDhanLtp(id, seg);
  }
  return r1;
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
      .in("config_key", [
        "dhan_api_enabled",
        "active_universe_snapshot_id",
        "universe_override_symbols",
        "universe_override_enabled",
        "sync_ltp_dhan_cursor",
      ]);
    const cfg = new Map<string, unknown>();
    for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value);

    // Rolling cursor: last processed composite pair-key `${symbol}|${exchange}`.
    // Applies only to unfiltered scheduled runs.
    const cursorRaw = cfg.get("sync_ltp_dhan_cursor");
    const cursorKey: string | null =
      cursorRaw && typeof cursorRaw === "object" && typeof (cursorRaw as { last_key?: unknown }).last_key === "string"
        ? (cursorRaw as { last_key: string }).last_key
        : null;

    if (cfg.get("dhan_api_enabled") !== true) {
      return json({ ok: true, skipped: "dhan_api_enabled=false", symbols_updated: 0, attempts: [], errors: [] });
    }

    // PRIMARY: active universe snapshot members (exact symbol+exchange+security_id).
    // FALLBACK: legacy override list (symbol-only), retained only if snapshot missing.
    type Member = { symbol: string; exchange: "NSE" | "BSE"; segment: "NSE_EQ" | "BSE_EQ"; dhan_security_id: string | null };
    let members: Member[] = [];
    let universeSource: "active_snapshot" | "override_fallback" = "active_snapshot";

    const snapshotIdRaw = cfg.get("active_universe_snapshot_id");
    const snapshotId = typeof snapshotIdRaw === "string" && snapshotIdRaw.length > 0 ? snapshotIdRaw : null;

    if (snapshotId) {
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: rows, error: mErr } = await supabase
          .from("stock_picker_universe_snapshot_member")
          .select("symbol, exchange, segment, dhan_security_id")
          .eq("universe_snapshot_id", snapshotId)
          .order("symbol", { ascending: true })
          .range(from, from + PAGE - 1);
        if (mErr) return json({ ok: false, error: `snapshot_read: ${mErr.message}` }, 500);
        if (!rows || rows.length === 0) break;
        for (const r of rows) {
          const ex = r.exchange === "NSE" || r.exchange === "BSE" ? r.exchange : null;
          const segRaw = String(r.segment ?? "");
          const seg: "NSE_EQ" | "BSE_EQ" | null =
            segRaw === "NSE_EQ" || segRaw === "BSE_EQ"
              ? segRaw
              : ex === "NSE" ? "NSE_EQ" : ex === "BSE" ? "BSE_EQ" : null;
          if (!ex || !seg || !r.symbol) continue;
          members.push({
            symbol: r.symbol as string,
            exchange: ex,
            segment: seg,
            dhan_security_id: r.dhan_security_id ? String(r.dhan_security_id) : null,
          });
        }
        if (rows.length < PAGE) break;
      }
    }

    if (members.length === 0) {
      universeSource = "override_fallback";
      const parsedOverride = parseOverrideSymbols(cfg.get("universe_override_symbols"));
      members = parsedOverride.map((e) => ({
        symbol: e.symbol,
        exchange: (e.exchange === "BSE" ? "BSE" : "NSE") as "NSE" | "BSE",
        segment: (e.exchange === "BSE" ? "BSE_EQ" : "NSE_EQ") as "NSE_EQ" | "BSE_EQ",
        dhan_security_id: null,
      }));
    }

    if (filterSymbols && filterSymbols.length > 0) {
      const keep = new Set(filterSymbols);
      members = members.filter((m) => keep.has(m.symbol));
    }

    if (members.length === 0) {
      return json({
        ok: true, symbols_updated: 0, attempts: [], errors: ["no universe members"],
        filter_applied: filterSymbols != null, universe_source: universeSource,
      });
    }

    const errors: Array<{ symbol: string; reason: string }> = [];
    const attempts: Array<Record<string, unknown>> = [];
    const http_400_samples: Array<{ symbol: string; exchange: string; security_id: string; status: number; message: string | null }> = [];
    let updated = 0;
    const counters = {
      symbols_seen: 0,
      attempted_count: 0,
      updated_count: 0,
      auth_error_count: 0,
      rate_limited_count: 0,
      dhan_null_count: 0,
      fetch_error_count: 0,
      missing_id_count: 0,
      nse_selected_count: 0,
      bse_selected_count: 0,
      nse_updated_count: 0,
      bse_updated_count: 0,
      master_fallback_used_count: 0,
      chunk_count: 0,
      fetch_error_by_status: {} as Record<string, number>,
    };

    // -------- Chunked one-call-per-symbol loop --------
    // Manual filtered runs (<=10 symbols) execute inline without chunk pauses.
    const chunkSize = filterSymbols ? members.length : FULL_RUN_CHUNK;
    let abortedAuth = false;

    outer: for (let i = 0; i < members.length; i += chunkSize) {
      counters.chunk_count++;
      const chunk = members.slice(i, i + chunkSize);
      for (const m of chunk) {
        counters.symbols_seen++;
        const sym = m.symbol;
        const exUsed: "NSE" | "BSE" = m.exchange;
        const seg: "NSE_EQ" | "BSE_EQ" = m.segment;
        let idUsed: string | null = m.dhan_security_id;

        if (exUsed === "NSE") counters.nse_selected_count++;
        else counters.bse_selected_count++;

        // Fallback only for exact (symbol, segment); no cross-exchange swap.
        if (!idUsed) {
          const { data: mstr } = await supabase
            .from("stock_master")
            .select("dhan_security_id")
            .eq("symbol", sym)
            .eq("segment", seg)
            .not("dhan_security_id", "is", null)
            .limit(1)
            .maybeSingle();
          if (mstr?.dhan_security_id) {
            idUsed = String(mstr.dhan_security_id);
            counters.master_fallback_used_count++;
          }
        }

        if (!idUsed) {
          counters.missing_id_count++;
          errors.push({ symbol: sym, reason: `no_dhan_security_id (${seg})` });
          attempts.push({ symbol: sym, exchange: exUsed, dhan_security_id_used: null, ltp_or_null: null, source: "dhan" });
          continue;
        }

        counters.attempted_count++;
        const r = await fetchLtpWithRetry(idUsed, seg);
        attempts.push({
          symbol: sym,
          exchange: exUsed,
          dhan_security_id_used: idUsed,
          ltp_or_null: r.kind === "ok" ? r.ltp : null,
          source: "dhan",
          kind: r.kind,
        });

        if (r.kind !== "ok") {
          const statusKey = String((r as { status?: number }).status ?? 0);
          counters.fetch_error_by_status[statusKey] = (counters.fetch_error_by_status[statusKey] ?? 0) + 1;
          if (r.kind === "auth_error")   counters.auth_error_count++;
          if (r.kind === "rate_limited") counters.rate_limited_count++;
          if (r.kind === "dhan_null")    counters.dhan_null_count++;
          if (r.kind === "fetch_error")  counters.fetch_error_count++;
          if ((r as { status?: number }).status === 400 && http_400_samples.length < 20) {
            http_400_samples.push({
              symbol: sym, exchange: exUsed, security_id: idUsed, status: 400,
              message: (r as { message?: string | null }).message ?? null,
            });
          }
          const upstreamMsg = (r as { message?: string | null }).message ?? null;
          errors.push({ symbol: sym, reason: `${r.kind} status=${statusKey} (${seg} id=${idUsed})${upstreamMsg ? ` msg=${upstreamMsg}` : ""}` });
          if (counters.auth_error_count >= 3) { abortedAuth = true; break outer; }
          if (INTRA_CHUNK_PAUSE_MS) await new Promise((r) => setTimeout(r, INTRA_CHUNK_PAUSE_MS));
          continue;
        }

        const nowIso = new Date().toISOString();
        const { error: upErr } = await supabase
          .from("ltp_cache")
          .upsert(
            { symbol: sym, exchange: exUsed, ltp: r.ltp, as_of: nowIso, source: "dhan", fetched_at: nowIso, updated_at: nowIso },
            { onConflict: "symbol,exchange" },
          );
        if (upErr) {
          errors.push({ symbol: sym, reason: `upsert_failed: ${upErr.message}` });
          continue;
        }
        updated++;
        counters.updated_count++;
        if (exUsed === "NSE") counters.nse_updated_count++;
        else counters.bse_updated_count++;
        if (INTRA_CHUNK_PAUSE_MS) await new Promise((r) => setTimeout(r, INTRA_CHUNK_PAUSE_MS));
      }
      if (i + chunkSize < members.length) {
        await new Promise((r) => setTimeout(r, INTER_CHUNK_PAUSE_MS));
      }
    }

    const runStatus = abortedAuth
      ? "error"
      : (errors.length === 0 ? "ok" : (updated === 0 ? "error" : "partial"));

    // Telemetry — only for full-universe runs; partial inline refreshes
    // (filter_applied) must not overwrite the daily summary.
    if (!filterSymbols) {
      await supabase.from("stock_picker_runtime_config").upsert(
        {
          config_key: "last_sync_ltp_dhan",
          kind: "operational",
          config_value: {
            ok: !abortedAuth,
            symbols_updated: updated,
            errors_count: errors.length,
            ran_at: ranAt,
            counters,
            http_400_samples,
            universe_source: universeSource,
            aborted_systemic_auth: abortedAuth,
          },
          description: "Last sync-ltp-dhan run summary",
          updated_at: ranAt,
        },
        { onConflict: "config_key" },
      );
    }

    await logTelemetry({
      status: runStatus,
      processed: updated,
      errors_count: errors.length,
      details: {
        filter_applied: filterSymbols != null,
        counters,
        http_400_samples,
        universe_source: universeSource,
        aborted_systemic_auth: abortedAuth,
        errors_sample: errors.slice(0, 10),
      },
    });
    return json({
      ok: !abortedAuth,
      symbols_updated: updated,
      attempts,
      errors,
      counters,
      http_400_samples,
      universe_source: universeSource,
      aborted_systemic_auth: abortedAuth,
      filter_applied: filterSymbols != null,
    });
  } catch (e) {
    await logTelemetry({ status: "error", processed: 0, errors_count: 1, error_message: String(e) });
    return json({ ok: false, error: String(e) }, 500);
  }
});

