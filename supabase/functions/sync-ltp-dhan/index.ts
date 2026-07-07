// Phase 2F — Background LTP sync (Dhan), batched Quote-API contract.
//
// Reads active universe snapshot members, resolves canonical dhan_security_id
// per (symbol, segment) (with stock_master fallback), buckets by segment, and
// calls dhan-fetch ONCE per DHAN_BATCH_SIZE chunk using Dhan's native
// batched quote body. Paced at ~1 rps to stay under Dhan's Quote API limit
// (https://dhanhq.co/docs/v2/market-quote/). Upserts per-symbol LTP into
// public.ltp_cache on the composite PK (symbol, exchange).
//
// Cursor: retired. With ~788 snapshot members and DHAN_BATCH_SIZE=100 the
// whole universe fits in one tick (~9s), so we always process the entire
// snapshot per invocation. Legacy `sync_ltp_dhan_cursor` config row is left
// in place for rollback safety; cursor telemetry keys preserved as nulls.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---- Batching / pacing knobs ----
const MASTER_CHUNK = 200;             // snapshot pagination (unchanged)
const DHAN_BATCH_SIZE = 100;          // instruments per Dhan call (Dhan max 1000)
const DHAN_INTER_CALL_MS = 1100;      // ~1 rps — Dhan Quote API hard limit

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

// Discriminated result for upstream batch failure classification.
type BatchResult =
  | { kind: "ok"; ltpBySecId: Map<string, number> }
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

async function fetchDhanLtpBatch(
  securityIds: string[],
  segment: "NSE_EQ" | "BSE_EQ",
): Promise<BatchResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/dhan-fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        endpoint: "ltp",
        exchangeSegment: segment,
        securityIds: securityIds.map((x) => Number(x)),
      }),
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

    const ltpBySecId = new Map<string, number>();
    if (seg && typeof seg === "object") {
      for (const [secId, nodeRaw] of Object.entries(seg)) {
        const node = nodeRaw as Record<string, unknown> | null;
        if (!node || typeof node !== "object") continue;
        const ltp = node.last_price ?? node.ltp ?? node.lastPrice;
        if (typeof ltp === "number" && ltp > 0) ltpBySecId.set(String(secId), ltp);
      }
    }
    return { kind: "ok", ltpBySecId };
  } catch (e) {
    return { kind: "fetch_error", status: 0, message: String(e) };
  }
}

async function fetchBatchWithRetry(
  ids: string[],
  seg: "NSE_EQ" | "BSE_EQ",
): Promise<BatchResult> {
  const r1 = await fetchDhanLtpBatch(ids, seg);
  if (r1.kind === "rate_limited") {
    await new Promise((r) => setTimeout(r, r1.retryAfterMs));
    return fetchDhanLtpBatch(ids, seg);
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
      ]);
    const cfg = new Map<string, unknown>();
    for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value);

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
      for (let from = 0; ; from += MASTER_CHUNK) {
        const { data: rows, error: mErr } = await supabase
          .from("stock_picker_universe_snapshot_member")
          .select("symbol, exchange, segment, dhan_security_id")
          .eq("universe_snapshot_id", snapshotId)
          .order("symbol", { ascending: true })
          .range(from, from + MASTER_CHUNK - 1);
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
        if (rows.length < MASTER_CHUNK) break;
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

    // Deterministic order (kept for stable telemetry / attempts ordering).
    members.sort((a, b) =>
      `${a.symbol}|${a.exchange}`.localeCompare(`${b.symbol}|${b.exchange}`)
    );

    const universeMode: "full_snapshot_per_tick" | "filtered_inline" =
      filterSymbols ? "filtered_inline" : "full_snapshot_per_tick";

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
      rate_limit_like_count: 0,
      processed_member_count: 0,
      dhan_batch_count: 0,
      dhan_batch_avg_ltp_per_call: 0,
    };

    // -------- Per-member id resolution (with stock_master fallback) --------
    const nseMembers: Array<Member & { dhan_security_id: string }> = [];
    const bseMembers: Array<Member & { dhan_security_id: string }> = [];

    for (const m of members) {
      counters.symbols_seen++;
      if (m.exchange === "NSE") counters.nse_selected_count++;
      else counters.bse_selected_count++;

      let idUsed: string | null = m.dhan_security_id;
      if (!idUsed) {
        const { data: mstr } = await supabase
          .from("stock_master")
          .select("dhan_security_id")
          .eq("symbol", m.symbol)
          .eq("segment", m.segment)
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
        errors.push({ symbol: m.symbol, reason: `no_dhan_security_id (${m.segment})` });
        attempts.push({ symbol: m.symbol, exchange: m.exchange, dhan_security_id_used: null, ltp_or_null: null, source: "dhan" });
        continue;
      }

      const resolved = { ...m, dhan_security_id: idUsed };
      if (m.segment === "NSE_EQ") nseMembers.push(resolved);
      else bseMembers.push(resolved);
    }

    // -------- Batched fetch loop, paced at ≤1 rps --------
    let abortedAuth = false;
    let firstBatch = true;
    const nowIsoBase = () => new Date().toISOString();

    async function runSegment(
      seg: "NSE_EQ" | "BSE_EQ",
      list: Array<Member & { dhan_security_id: string }>,
    ): Promise<void> {
      if (abortedAuth) return;
      for (let i = 0; i < list.length; i += DHAN_BATCH_SIZE) {
        if (abortedAuth) return;
        const chunk = list.slice(i, i + DHAN_BATCH_SIZE);
        const ids = chunk.map((m) => m.dhan_security_id);

        if (!firstBatch) {
          await new Promise((r) => setTimeout(r, DHAN_INTER_CALL_MS));
        }
        firstBatch = false;

        counters.chunk_count++;
        counters.dhan_batch_count++;
        counters.attempted_count += chunk.length;

        const r = await fetchBatchWithRetry(ids, seg);

        if (r.kind !== "ok") {
          const st = (r as { status?: number }).status ?? 0;
          const statusKey = String(st);
          counters.fetch_error_by_status[statusKey] = (counters.fetch_error_by_status[statusKey] ?? 0) + 1;
          if (st === 0 || st === 429) counters.rate_limit_like_count++;
          if (r.kind === "auth_error")   counters.auth_error_count++;
          if (r.kind === "rate_limited") counters.rate_limited_count++;
          if (r.kind === "dhan_null")    counters.dhan_null_count++;
          if (r.kind === "fetch_error")  counters.fetch_error_count++;

          const upstreamMsg = (r as { message?: string | null }).message ?? null;
          for (const m of chunk) {
            if (st === 400 && http_400_samples.length < 20) {
              http_400_samples.push({
                symbol: m.symbol, exchange: m.exchange, security_id: m.dhan_security_id,
                status: 400, message: upstreamMsg,
              });
            }
            errors.push({
              symbol: m.symbol,
              reason: `${r.kind} status=${statusKey} (${seg} id=${m.dhan_security_id})${upstreamMsg ? ` msg=${upstreamMsg}` : ""}`,
            });
            attempts.push({
              symbol: m.symbol, exchange: m.exchange,
              dhan_security_id_used: m.dhan_security_id,
              ltp_or_null: null, source: "dhan", kind: r.kind,
            });
            counters.processed_member_count++;
          }
          if (counters.auth_error_count >= 3) { abortedAuth = true; return; }
          continue;
        }

        // ok — per-member upsert
        const nowIso = nowIsoBase();
        for (const m of chunk) {
          const ltp = r.ltpBySecId.get(m.dhan_security_id);
          if (typeof ltp === "number" && ltp > 0) {
            const { error: upErr } = await supabase
              .from("ltp_cache")
              .upsert(
                { symbol: m.symbol, exchange: m.exchange, ltp, as_of: nowIso, source: "dhan", fetched_at: nowIso, updated_at: nowIso },
                { onConflict: "symbol,exchange" },
              );
            if (upErr) {
              errors.push({ symbol: m.symbol, reason: `upsert_failed: ${upErr.message}` });
              attempts.push({
                symbol: m.symbol, exchange: m.exchange,
                dhan_security_id_used: m.dhan_security_id,
                ltp_or_null: null, source: "dhan", kind: "upsert_failed",
              });
              counters.processed_member_count++;
              continue;
            }
            updated++;
            counters.updated_count++;
            if (m.exchange === "NSE") counters.nse_updated_count++;
            else counters.bse_updated_count++;
            attempts.push({
              symbol: m.symbol, exchange: m.exchange,
              dhan_security_id_used: m.dhan_security_id,
              ltp_or_null: ltp, source: "dhan", kind: "ok",
            });
          } else {
            counters.dhan_null_count++;
            errors.push({ symbol: m.symbol, reason: `dhan_null (${seg} id=${m.dhan_security_id})` });
            attempts.push({
              symbol: m.symbol, exchange: m.exchange,
              dhan_security_id_used: m.dhan_security_id,
              ltp_or_null: null, source: "dhan", kind: "dhan_null",
            });
          }
          counters.processed_member_count++;
        }
      }
    }

    await runSegment("NSE_EQ", nseMembers);
    await runSegment("BSE_EQ", bseMembers);

    counters.dhan_batch_avg_ltp_per_call =
      counters.updated_count / Math.max(1, counters.dhan_batch_count);

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
            universe_mode: universeMode,
            // Cursor retired — kept as nulls for telemetry-shape compatibility.
            cursor_start: null,
            cursor_end: null,
            wrapped_to_start: false,
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
        universe_mode: universeMode,
        cursor_start: null,
        cursor_end: null,
        wrapped_to_start: false,
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
      universe_mode: universeMode,
      cursor_start: null,
      cursor_end: null,
      wrapped_to_start: false,
      aborted_systemic_auth: abortedAuth,
      filter_applied: filterSymbols != null,
    });
  } catch (e) {
    await logTelemetry({ status: "error", processed: 0, errors_count: 1, error_message: String(e) });
    return json({ ok: false, error: String(e) }, 500);
  }
});
