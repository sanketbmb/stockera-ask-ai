// sync-ohlcv-history
// Phase 2L — Backfill ~2 years of daily OHLCV per cleaned candidate symbol.
// Phase 2S.2A — Decouple backfill candidates from the picker override.
// Primary: Dhan. Fallback: Twelve Data. Writes ONLY to stock_picker_ohlcv_history.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DHAN_ACCESS_TOKEN = Deno.env.get('DHAN_ACCESS_TOKEN') ?? '';
const DHAN_CLIENT_ID = Deno.env.get('DHAN_CLIENT_ID') ?? '';
const TWELVE_DATA_API_KEY = Deno.env.get('TWELVE_DATA_API_KEY') ?? '';

const DHAN_URL = 'https://api.dhan.co/v2/charts/historical';
const TD_URL = 'https://api.twelvedata.com/time_series';
const MIN_USABLE_ROWS = 100;

// Returns the latest completed IST trading day (YYYY-MM-DD) per
// stock_picker_trading_calendar. Falls back to today-in-IST on any
// error or empty result — never throws, never blocks the job.
async function latestCompletedTradingDayIst(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const nowIst = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
  const y = nowIst.getUTCFullYear();
  const m = String(nowIst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(nowIst.getUTCDate()).padStart(2, '0');
  const todayIst = `${y}-${m}-${d}`;
  try {
    const { data, error } = await supabase
      .from('stock_picker_trading_calendar')
      .select('calendar_date')
      .eq('is_trading_day', true)
      .lte('calendar_date', todayIst)
      .order('calendar_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.calendar_date) return todayIst;
    return data.calendar_date as string;
  } catch {
    return todayIst;
  }
}


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type OhlcvRow = {
  symbol: string; exchange: string; record_date: string;
  open: number | null; high: number | null; low: number | null;
  close: number | null; volume: number | null; source: string;
};

function jbool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return false;
}
function jnum(v: unknown, def: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : def; }
  return def;
}
function jstr(v: unknown, def: string): string {
  if (typeof v === 'string') return v;
  return def;
}
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

function dhanSegment(exchange: string): 'NSE_EQ' | 'BSE_EQ' {
  return exchange.toUpperCase().startsWith('BSE') ? 'BSE_EQ' : 'NSE_EQ';
}

async function fetchDhan(securityId: string, exchange: string, fromDate: string, toDate: string): Promise<OhlcvRow[] | null> {
  if (!DHAN_ACCESS_TOKEN || !DHAN_CLIENT_ID || !securityId) return null;
  try {
    const resp = await fetch(DHAN_URL, {
      method: 'POST',
      headers: {
        'access-token': DHAN_ACCESS_TOKEN,
        'client-id': DHAN_CLIENT_ID,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        securityId,
        exchangeSegment: dhanSegment(exchange),
        instrument: 'EQUITY',
        expiryCode: 0,
        oi: false,
        fromDate, toDate,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as Record<string, unknown>;
    const ts = data.timestamp as number[] | undefined;
    const o = data.open as number[] | undefined;
    const h = data.high as number[] | undefined;
    const l = data.low as number[] | undefined;
    const c = data.close as number[] | undefined;
    const v = data.volume as number[] | undefined;
    if (!Array.isArray(ts) || !Array.isArray(c) || ts.length === 0) return null;
    const rows: OhlcvRow[] = [];
    for (let i = 0; i < ts.length; i++) {
      const d = new Date(ts[i] * 1000);
      if (!Number.isFinite(d.getTime())) continue;
      const close = c?.[i];
      if (!Number.isFinite(close as number) || (close as number) <= 0) continue;
      rows.push({
        symbol: '', exchange: '',
        record_date: isoDate(d),
        open: Number.isFinite(o?.[i] as number) ? (o![i] as number) : null,
        high: Number.isFinite(h?.[i] as number) ? (h![i] as number) : null,
        low: Number.isFinite(l?.[i] as number) ? (l![i] as number) : null,
        close: close as number,
        volume: Number.isFinite(v?.[i] as number) ? (v![i] as number) : null,
        source: 'dhan',
      });
    }
    return rows;
  } catch {
    return null;
  }
}

async function fetchTwelveData(symbol: string, exchange: string, fromDate: string, toDate: string): Promise<OhlcvRow[] | null> {
  if (!TWELVE_DATA_API_KEY) return null;
  const suffix = exchange.toUpperCase().startsWith('BSE') ? 'BO' : 'NS';
  const tdSymbol = `${symbol}.${suffix}`;
  const url = `${TD_URL}?symbol=${encodeURIComponent(tdSymbol)}&interval=1day&start_date=${fromDate}&end_date=${toDate}&outputsize=5000&apikey=${encodeURIComponent(TWELVE_DATA_API_KEY)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json() as Record<string, unknown>;
    if (data.status === 'error') return null;
    const values = data.values as Array<Record<string, string>> | undefined;
    if (!Array.isArray(values) || values.length === 0) return null;
    const rows: OhlcvRow[] = [];
    for (const v of values) {
      const d = v.datetime;
      const close = Number(v.close);
      if (!d || !Number.isFinite(close) || close <= 0) continue;
      rows.push({
        symbol: '', exchange: '',
        record_date: d.slice(0, 10),
        open: Number.isFinite(Number(v.open)) ? Number(v.open) : null,
        high: Number.isFinite(Number(v.high)) ? Number(v.high) : null,
        low: Number.isFinite(Number(v.low)) ? Number(v.low) : null,
        close,
        volume: Number.isFinite(Number(v.volume)) ? Number(v.volume) : null,
        source: 'twelve_data',
      });
    }
    return rows;
  } catch {
    return null;
  }
}

const EQUITY_TYPES = new Set(['EQUITY', 'EQ', 'STOCK']);
const EQUITY_SEGMENTS = new Set(['EQ', 'NSE_EQ', 'BSE_EQ']);
const bondNameRe = /(^|\s)SDL\s|\d+(\.\d+)?\s*%\s*\d{4}/i;
const etfSymbolTokenRe = /(?:^|[^A-Z])(ETF|BEES|NIFTYBEES|BANKBEES|GOLDBEES|LIQUIDBEES|JUNIORBEES|N100|NV20)$/i;
const etfSymbolSuffixRe = /ETF$/i;
const etfNameRe = /ETF|EXCHANGE\s+TRADED|INDEX\s+FUND/i;
const bondTicker1Re = /^\d{3,4}[A-Z]{1,3}\d{2,3}[A-Z]?$/;
const bondTicker2Re = /^[A-Z]{2,4}\d{2,4}[A-Z]{1,3}\d{1,3}$/;

type Target = { symbol: string; exchange: string; dhan_id: string };
type CandidatePair = { symbol: string; exchange: string };

function isCleanRow(r: {
  symbol: string;
  exchange: string;
  type?: string | null;
  segment?: string | null;
  is_suspended?: boolean | null;
  dhan_security_id?: string | null;
  company_name?: string | null;
}): boolean {
  if (!r.type || !EQUITY_TYPES.has(r.type.toUpperCase())) return false;
  if (!r.segment || !EQUITY_SEGMENTS.has(r.segment.toUpperCase())) return false;
  if (r.is_suspended === true) return false;
  if (!r.dhan_security_id) return false;
  const name = r.company_name ?? '';
  if (name && (etfNameRe.test(name) || bondNameRe.test(name))) return false;
  if (etfSymbolTokenRe.test(r.symbol) || etfSymbolSuffixRe.test(r.symbol)) return false;
  if (bondTicker1Re.test(r.symbol) || bondTicker2Re.test(r.symbol)) return false;
  return true;
}

// ---------------------------------------------------------------------
// Phase 2S.2A: tolerant universe_override parser.
// Accepts string[] or [{symbol, exchange}, ...]. For bare strings, resolves
// (symbol, exchange) from stock_master preferring NSE; ambiguous -> skip
// with single warning. Used only for diagnostics; NOT the candidate source.
// ---------------------------------------------------------------------
async function parseUniverseOverride(
  supabase: ReturnType<typeof createClient>,
  raw: unknown,
): Promise<CandidatePair[]> {
  if (!Array.isArray(raw)) return [];
  const objectPairs: CandidatePair[] = [];
  const bareSymbols: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.length > 0) {
      bareSymbols.push(item);
    } else if (item && typeof item === 'object') {
      const sym = (item as Record<string, unknown>).symbol;
      const exch = (item as Record<string, unknown>).exchange;
      if (typeof sym === 'string' && typeof exch === 'string' && sym && exch) {
        objectPairs.push({ symbol: sym, exchange: exch });
      }
    }
  }
  if (bareSymbols.length === 0) return objectPairs;
  const { data, error } = await supabase
    .from('stock_master')
    .select('symbol,exchange')
    .in('symbol', bareSymbols)
    .in('exchange', ['NSE', 'BSE']);
  if (error) return objectPairs;
  const bySym = new Map<string, string[]>();
  for (const r of (data ?? []) as Array<{ symbol: string; exchange: string }>) {
    const arr = bySym.get(r.symbol) ?? [];
    arr.push(r.exchange);
    bySym.set(r.symbol, arr);
  }
  const warned = new Set<string>();
  for (const s of bareSymbols) {
    const ex = bySym.get(s) ?? [];
    if (ex.length === 0) continue;
    if (ex.length === 1) { objectPairs.push({ symbol: s, exchange: ex[0] }); continue; }
    if (ex.includes('NSE')) { objectPairs.push({ symbol: s, exchange: 'NSE' }); continue; }
    if (!warned.has(s)) {
      console.warn(`phase2s2a: ambiguous override symbol ${s} (exchanges=${ex.join(',')}), skipping`);
      warned.add(s);
    }
  }
  return objectPairs;
}

// ---------------------------------------------------------------------
// Phase 2S.2A: resolve backfill candidates from runtime_config + snapshot.
// ---------------------------------------------------------------------
async function resolveBackfillCandidates(
  supabase: ReturnType<typeof createClient>,
  cfg: Map<string, unknown>,
): Promise<{ targets: Target[]; source: string; pairs: CandidatePair[] }> {
  let source = jstr(cfg.get('backfill_candidate_source'), 'snapshot_topN_clean');
  if (source !== 'runtime_list' && source !== 'snapshot_topN_clean') {
    source = 'snapshot_topN_clean';
  }

  let pairs: CandidatePair[] = [];

  if (source === 'runtime_list') {
    const raw = cfg.get('backfill_candidate_symbols');
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item && typeof item === 'object') {
          const sym = (item as Record<string, unknown>).symbol;
          const exch = (item as Record<string, unknown>).exchange;
          if (typeof sym === 'string' && typeof exch === 'string' && sym && exch) {
            pairs.push({ symbol: sym, exchange: exch });
          }
        }
      }
    }
  } else {
    const topN = Math.max(1, Math.floor(jnum(cfg.get('backfill_candidate_topN'), 200)));
    const { data: snapRows, error: snapErr } = await supabase
      .from('stock_picker_universe_snapshot')
      .select('id,created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    if (snapErr) throw new Error(`snapshot read failed: ${snapErr.message}`);
    const snapshotId = snapRows?.[0]?.id as string | undefined;
    if (!snapshotId) return { targets: [], source, pairs: [] };

    const { data: memRows, error: memErr } = await supabase
      .from('stock_picker_universe_snapshot_member')
      .select('symbol,exchange,canonical_rank')
      .eq('universe_snapshot_id', snapshotId)
      .order('canonical_rank', { ascending: true, nullsFirst: false })
      .order('symbol', { ascending: true })
      .limit(topN);
    if (memErr) throw new Error(`snapshot_member read failed: ${memErr.message}`);
    for (const r of (memRows ?? []) as Array<Record<string, unknown>>) {
      const sym = String(r.symbol ?? '');
      const exch = String(r.exchange ?? '');
      if (sym && exch) pairs.push({ symbol: sym, exchange: exch });
    }
  }

  // Dedupe pairs by symbol|exchange, preserve order.
  const seen = new Set<string>();
  pairs = pairs.filter((p) => {
    const k = `${p.symbol}|${p.exchange}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (pairs.length === 0) return { targets: [], source, pairs };

  // Apply inline cleanliness from stock_master.
  // FIX-K pattern: paginate the .in() read to defeat PostgREST's 1000-row cap.
  // Without this, ~2.7k rows for the ~788-symbol universe get truncated and
  // ~428 eligible members silently fall out of the candidate set.
  const symbolList = [...new Set(pairs.map((p) => p.symbol))];
  const meta: Array<Record<string, unknown>> = [];
  const META_PAGE = 1000;
  for (let offset = 0; ; offset += META_PAGE) {
    const { data, error: metaErr } = await supabase
      .from('stock_master')
      .select('symbol,exchange,type,segment,is_suspended,dhan_security_id,company_name')
      .in('symbol', symbolList)
      .order('symbol', { ascending: true })
      .order('exchange', { ascending: true })
      .range(offset, offset + META_PAGE - 1);
    if (metaErr) throw new Error(`stock_master read failed: ${metaErr.message}`);
    const batch = (data ?? []) as Array<Record<string, unknown>>;
    meta.push(...batch);
    if (batch.length < META_PAGE) break;
  }

  type Agg = {
    sym: string; exch: string;
    any_equity_type: boolean; any_equity_segment: boolean;
    any_suspended: boolean; dhan_id: string | null;
    company_name: string | null;
  };
  const agg = new Map<string, Agg>();
  for (const r of meta) {
    const sym = String(r.symbol ?? '');
    const exch = String(r.exchange ?? '');
    const key = `${sym}|${exch}`;
    const cur = agg.get(key) ?? {
      sym, exch, any_equity_type: false, any_equity_segment: false,
      any_suspended: false, dhan_id: null, company_name: null,
    };
    if (typeof r.type === 'string' && EQUITY_TYPES.has(r.type.toUpperCase())) cur.any_equity_type = true;
    if (typeof r.segment === 'string' && EQUITY_SEGMENTS.has(r.segment.toUpperCase())) cur.any_equity_segment = true;
    if (r.is_suspended === true) cur.any_suspended = true;
    if (cur.dhan_id === null && r.dhan_security_id !== null && r.dhan_security_id !== undefined && String(r.dhan_security_id).length > 0) {
      cur.dhan_id = String(r.dhan_security_id);
    }
    if (cur.company_name === null && typeof r.company_name === 'string') cur.company_name = r.company_name;
    agg.set(key, cur);
  }

  const targets: Target[] = [];
  for (const p of pairs) {
    const a = agg.get(`${p.symbol}|${p.exchange}`);
    if (!a) continue;
    if (!a.any_equity_type) continue;
    if (!a.any_equity_segment) continue;
    if (a.any_suspended) continue;
    if (!a.dhan_id) continue;
    if (!isCleanRow({
      symbol: a.sym, exchange: a.exch,
      type: 'EQUITY', segment: 'EQ',
      is_suspended: false, dhan_security_id: a.dhan_id,
      company_name: a.company_name,
    })) continue;
    targets.push({ symbol: a.sym, exchange: a.exch, dhan_id: a.dhan_id });
  }
  return { targets, source, pairs };
}

async function processOne(
  supabase: ReturnType<typeof createClient>,
  t: Target,
  fromStr: string,
  toStr: string,
): Promise<{ chosen: 'dhan' | 'twelve_data' | null; rows_inserted: number; error?: string }> {
  let rows: OhlcvRow[] | null = await fetchDhan(t.dhan_id, t.exchange, fromStr, toStr);
  let chosen: 'dhan' | 'twelve_data' | null = null;
  if (rows && rows.length >= MIN_USABLE_ROWS) {
    chosen = 'dhan';
  } else {
    const td = await fetchTwelveData(t.symbol, t.exchange, fromStr, toStr);
    if (td && td.length >= MIN_USABLE_ROWS) { rows = td; chosen = 'twelve_data'; }
  }
  if (!chosen || !rows) {
    return { chosen: null, rows_inserted: 0, error: 'no usable history from dhan or twelve_data' };
  }
  const byDate = new Map<string, OhlcvRow>();
  for (const r of rows) {
    r.symbol = t.symbol; r.exchange = t.exchange; r.source = chosen;
    byDate.set(r.record_date, r);
  }
  const finalRows = [...byDate.values()];
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < finalRows.length; i += CHUNK) {
    const slice = finalRows.slice(i, i + CHUNK);
    const { error: upErr } = await supabase
      .from('stock_picker_ohlcv_history')
      .upsert(slice, { onConflict: 'symbol,exchange,record_date' });
    if (upErr) return { chosen, rows_inserted: inserted, error: upErr.message };
    inserted += slice.length;
  }
  return { chosen, rows_inserted: inserted };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const invoked_by = typeof body.invoked_by === 'string' ? body.invoked_by : 'manual';
    const mode = typeof body.mode === 'string' ? body.mode : 'full';

    const { data: cfgRows, error: cfgErr } = await supabase
      .from('stock_picker_runtime_config').select('config_key, config_value');
    if (cfgErr) throw new Error(`config read failed: ${cfgErr.message}`);
    const cfg = new Map<string, unknown>();
    for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value as unknown);

    const enabled = cfg.has('ohlcv_backfill_enabled') ? jbool(cfg.get('ohlcv_backfill_enabled')) : false;
    if (!enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'ohlcv_backfill_enabled=false' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const years = Math.max(1, Math.floor(jnum(cfg.get('ohlcv_backfill_years'), 2)));

    // Tolerant parse of universe_override_symbols (diagnostic only).
    const overridePairs = await parseUniverseOverride(supabase, cfg.get('universe_override_symbols'));

    // Resolve backfill candidates from the dedicated candidate-source contract.
    const { targets, source: candidateSource, pairs: resolvedPairs } =
      await resolveBackfillCandidates(supabase, cfg);

    const toDate = new Date();
    const fromDate = new Date(toDate);
    fromDate.setUTCFullYear(toDate.getUTCFullYear() - years);
    const fromStr = isoDate(fromDate);
    const toStr = isoDate(toDate);

    // -------------------------------------------------------------------
    // Phase 2S.3-FIX-OHLCV-EXPANSION: Nifty 500 chunked resumable backfill.
    // Targets the Nifty 500 constituent equities; resumable cursor lives in
    // stock_picker_runtime_config.ohlcv_n500_cursor. Append-only writes to
    // stock_picker_ohlcv_history via existing processOne (idempotent upsert).
    // -------------------------------------------------------------------
    if (mode === 'nifty500_chunk') {
      const chunkSize = Math.max(1, Math.floor(jnum(
        (body as Record<string, unknown>)?.chunk_size ?? cfg.get('ohlcv_n500_chunk_size'), 40)));
      const sleepMs = Math.max(0, Math.floor(jnum(cfg.get('ohlcv_chunk_sleep_ms'), 1000)));
      const maxRuntimeMs = Math.max(5000, Math.floor(jnum(cfg.get('ohlcv_max_runtime_ms'), 90000)));
      const t0n = Date.now();

      const csvUrl = 'https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv';
      let csvText = '';
      try {
        const r = await fetch(csvUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!r.ok) throw new Error(`csv http ${r.status}`);
        csvText = await r.text();
      } catch (e) {
        return new Response(JSON.stringify({
          ok: false, stage: 'csv_fetch',
          error: e instanceof Error ? e.message : String(e),
        }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const csvLines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
      if (csvLines.length < 2) {
        return new Response(JSON.stringify({ ok: false, stage: 'csv_parse', error: 'empty csv' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const csvHeader = csvLines[0].split(',').map((h) => h.trim().toLowerCase());
      const symIdx = csvHeader.indexOf('symbol');
      if (symIdx < 0) {
        return new Response(JSON.stringify({ ok: false, stage: 'csv_parse', error: 'no Symbol column' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const csvSymbols = Array.from(new Set(
        csvLines.slice(1)
          .map((l) => (l.split(',')[symIdx] ?? '').trim())
          .filter((s) => s.length > 0),
      )).sort();

      // Resolve against stock_master (prefer NSE row; must have dhan_security_id)
      const resolved: Target[] = [];
      const droppedNoDhan: string[] = [];
      const PAGE = 200;
      for (let i = 0; i < csvSymbols.length; i += PAGE) {
        const sl = csvSymbols.slice(i, i + PAGE);
        const { data, error } = await supabase
          .from('stock_master')
          .select('symbol,exchange,dhan_security_id')
          .in('symbol', sl)
          .in('exchange', ['NSE', 'BSE']);
        if (error) throw new Error(`stock_master read failed: ${error.message}`);
        const bySym = new Map<string, Array<{ exchange: string; dhan_security_id: string | null }>>();
        for (const r of (data ?? []) as Array<{ symbol: string; exchange: string; dhan_security_id: string | null }>) {
          const arr = bySym.get(r.symbol) ?? [];
          arr.push({ exchange: r.exchange, dhan_security_id: r.dhan_security_id });
          bySym.set(r.symbol, arr);
        }
        for (const s of sl) {
          const rows = bySym.get(s);
          if (!rows || rows.length === 0) { droppedNoDhan.push(s); continue; }
          const nse = rows.find((r) => r.exchange === 'NSE' && r.dhan_security_id);
          const any = nse ?? rows.find((r) => !!r.dhan_security_id);
          if (!any || !any.dhan_security_id) { droppedNoDhan.push(s); continue; }
          resolved.push({ symbol: s, exchange: any.exchange, dhan_id: String(any.dhan_security_id) });
        }
      }
      const seenT = new Set<string>();
      const targetsN500 = resolved.filter((t) => {
        const k = `${t.symbol}|${t.exchange}`;
        if (seenT.has(k)) return false;
        seenT.add(k); return true;
      }).sort((a, b) => (a.symbol + '|' + a.exchange).localeCompare(b.symbol + '|' + b.exchange));

      // Freshness-aware coverage: a symbol counts as covered ONLY when it has
      // >=20 rows AND its max(record_date) is within `freshnessDays` of today.
      // Stale symbols re-enter `pending` so chunk mode can refresh them.
      // `force_refresh: true` in the request body bypasses the coverage set entirely.
      const forceRefresh = jbool((body as Record<string, unknown>)?.force_refresh);
      const freshnessDays = Math.max(
        0,
        Math.floor(jnum(cfg.get('ohlcv_coverage_freshness_days'), 1)),
      );
      const latestTradingDayIso = await latestCompletedTradingDayIst(supabase);
      const cutoffDate = new Date(latestTradingDayIso + 'T00:00:00Z');
      cutoffDate.setUTCDate(cutoffDate.getUTCDate() - freshnessDays);
      const freshCutoffIso = isoDate(cutoffDate);

      const coveredSet = new Set<string>();
      const coveredByCountOnly = new Set<string>(); // old-rule shadow, telemetry only
      const staleNowPending: Array<{ symbol: string; exchange: string; max_record_date: string | null }> = [];
      const BATCH = 25;
      if (!forceRefresh) {
        for (let i = 0; i < targetsN500.length; i += BATCH) {
          const sl = targetsN500.slice(i, i + BATCH);
          const probes = await Promise.all(sl.map(async (t) => {
            const [{ count }, { data: maxRow }] = await Promise.all([
              supabase
                .from('stock_picker_ohlcv_history')
                .select('*', { count: 'exact', head: true })
                .eq('symbol', t.symbol).eq('exchange', t.exchange),
              supabase
                .from('stock_picker_ohlcv_history')
                .select('record_date')
                .eq('symbol', t.symbol).eq('exchange', t.exchange)
                .order('record_date', { ascending: false })
                .limit(1)
                .maybeSingle(),
            ]);
            const maxDate = (maxRow?.record_date as string | undefined) ?? null;
            return { t, count: count ?? 0, maxDate };
          }));
          for (const { t, count, maxDate } of probes) {
            const key = `${t.symbol}|${t.exchange}`;
            if (count >= 20) coveredByCountOnly.add(key);
            const fresh = maxDate !== null && maxDate >= freshCutoffIso;
            if (count >= 20 && fresh) {
              coveredSet.add(key);
            } else if (count >= 20 && !fresh) {
              staleNowPending.push({ symbol: t.symbol, exchange: t.exchange, max_record_date: maxDate });
            }
          }
        }
      }
      const skippedAlready = coveredSet.size;
      const pending = forceRefresh
        ? targetsN500.slice()
        : targetsN500.filter((t) => !coveredSet.has(`${t.symbol}|${t.exchange}`));

      const cursorCfg = cfg.get('ohlcv_n500_cursor') as { idx?: number } | undefined;
      let startIdx = Math.max(0, Math.floor(jnum(cursorCfg?.idx, 0)));
      if (startIdx >= pending.length) startIdx = 0;
      const work = pending.slice(startIdx, startIdx + chunkSize);

      let attempted = 0, rowsInsertedRun = 0, dhanCnt = 0, tdCnt = 0, newlyCovered = 0;
      const failures: Array<{ symbol: string; exchange: string; reason: string }> = [];

      for (const t of work) {
        if (Date.now() - t0n > maxRuntimeMs) break;
        let res: Awaited<ReturnType<typeof processOne>>;
        try { res = await processOne(supabase, t, fromStr, toStr); }
        catch (e) { res = { chosen: null, rows_inserted: 0, error: e instanceof Error ? e.message : String(e) }; }
        attempted++;
        if (res.chosen) {
          rowsInsertedRun += res.rows_inserted;
          if (res.chosen === 'dhan') dhanCnt++; else tdCnt++;
          if (res.rows_inserted >= 20) newlyCovered++;
        } else {
          failures.push({ symbol: t.symbol, exchange: t.exchange, reason: res.error ?? 'unknown' });
        }
        await supabase.from('stock_picker_ohlcv_backfill_state').upsert({
          symbol: t.symbol, exchange: t.exchange,
          status: res.chosen ? 'done' : 'failed',
          rows_inserted: res.rows_inserted,
          source: res.chosen,
          last_error: res.error ?? null,
          attempted_at: new Date().toISOString(),
        }, { onConflict: 'symbol,exchange' });
        if (sleepMs > 0) await sleep(sleepMs);
      }

      const nextIdx = startIdx + attempted;
      const cumulative = skippedAlready + newlyCovered;
      const exhausted = nextIdx >= pending.length;
      const stopReached = exhausted;
      const stopReason = stopReached ? 'target_exhausted' : null;

      await supabase.from('stock_picker_runtime_config').upsert({
        config_key: 'ohlcv_n500_cursor',
        kind: 'operational',
        config_value: {
          idx: stopReached ? 0 : nextIdx,
          last_run_at: new Date().toISOString(),
          invoked_by,
          target_total: targetsN500.length,
          pending_total: pending.length,
          cumulative_symbols_20plus: cumulative,
          stop_reached: stopReached,
          stop_reason: stopReason,
          coverage_rule: 'rows_ge_20_and_fresh_within_days_ist',
          coverage_freshness_days: freshnessDays,
          force_refresh: forceRefresh,
          stale_symbols_now_pending: staleNowPending.length,
          latest_trading_day_ist: latestTradingDayIso,
          fresh_cutoff_iso: freshCutoffIso,
        },
        description: 'Phase 2S.3-FIX-OHLCV-EXPANSION Nifty500 backfill cursor',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'config_key' });

      return new Response(JSON.stringify({
        ok: true, mode: 'nifty500_chunk', invoked_by,
        csv_rows: csvSymbols.length,
        target_total: targetsN500.length,
        dropped_no_dhan: droppedNoDhan.length,
        symbols_skipped_already_covered: skippedAlready,
        symbols_attempted_this_run: attempted,
        rows_inserted_this_run: rowsInsertedRun,
        symbols_failed_this_run: failures.length,
        dhan_used: dhanCnt, twelve_data_fallback_used: tdCnt,
        cumulative_symbols_with_20plus_rows: cumulative,
        cursor_idx_persisted: stopReached ? 0 : nextIdx,
        cursor_idx_start: startIdx,
        pending_total: pending.length,
        stop_reached: stopReached,
        stop_reason: stopReason,
        elapsed_ms: Date.now() - t0n,
        coverage_rule: 'rows_ge_20_and_fresh_within_days_ist',
        coverage_freshness_days: freshnessDays,
        force_refresh: forceRefresh,
        symbols_covered_by_count_only: coveredByCountOnly.size,
        symbols_stale_now_pending: staleNowPending.length,
        stale_sample: staleNowPending.slice(0, 20),
        failures: failures.slice(0, 20),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // -------------------------------------------------------------------
    // Phase 2S: chunked, resumable mode
    // -------------------------------------------------------------------
    if (mode === 'chunk') {
      const chunkSize = Math.max(1, Math.floor(jnum(cfg.get('ohlcv_chunk_size'), 10)));
      const sleepMs = Math.max(0, Math.floor(jnum(cfg.get('ohlcv_chunk_sleep_ms'), 250)));
      const maxRuntimeMs = Math.max(5000, Math.floor(jnum(cfg.get('ohlcv_max_runtime_ms'), 90000)));
      const t0 = Date.now();

      // Seed pending rows for any clean candidate not yet in backfill_state.
      const seedRows = targets.map((t) => ({
        symbol: t.symbol, exchange: t.exchange, status: 'pending' as const,
      }));
      if (seedRows.length > 0) {
        for (let i = 0; i < seedRows.length; i += 500) {
          const slice = seedRows.slice(i, i + 500);
          await supabase
            .from('stock_picker_ohlcv_backfill_state')
            .upsert(slice, { onConflict: 'symbol,exchange', ignoreDuplicates: true });
        }
      }

      const targetKeys = new Set(targets.map((t) => `${t.symbol}|${t.exchange}`));
      const targetByKey = new Map(targets.map((t) => [`${t.symbol}|${t.exchange}`, t]));

      const { data: pendingRows, error: pendErr } = await supabase
        .from('stock_picker_ohlcv_backfill_state')
        .select('symbol,exchange,status')
        .eq('status', 'pending')
        .order('symbol', { ascending: true })
        .order('exchange', { ascending: true })
        .limit(Math.max(chunkSize * 4, 200));
      if (pendErr) throw new Error(`pending read failed: ${pendErr.message}`);

      const candidates = (pendingRows ?? [])
        .map((r) => ({ symbol: String(r.symbol), exchange: String(r.exchange) }))
        .filter((r) => targetKeys.has(`${r.symbol}|${r.exchange}`))
        .slice(0, chunkSize);

      let processed = 0;
      let errorsCount = 0;
      let rowsInsertedTotal = 0;
      let dhanCount = 0;
      let tdCount = 0;
      const failures: Array<{ symbol: string; exchange: string; error: string }> = [];

      for (const cand of candidates) {
        if (Date.now() - t0 > maxRuntimeMs) break;
        const t = targetByKey.get(`${cand.symbol}|${cand.exchange}`)!;
        let res: Awaited<ReturnType<typeof processOne>>;
        try {
          res = await processOne(supabase, t, fromStr, toStr);
        } catch (e) {
          res = { chosen: null, rows_inserted: 0, error: e instanceof Error ? e.message : String(e) };
        }
        const status = res.chosen ? 'done' : 'failed';
        if (status === 'done') {
          rowsInsertedTotal += res.rows_inserted;
          if (res.chosen === 'dhan') dhanCount++; else tdCount++;
        } else {
          errorsCount++;
          failures.push({ symbol: t.symbol, exchange: t.exchange, error: res.error ?? 'unknown' });
        }
        await supabase
          .from('stock_picker_ohlcv_backfill_state')
          .upsert({
            symbol: t.symbol, exchange: t.exchange, status,
            rows_inserted: res.rows_inserted,
            source: res.chosen,
            last_error: res.error ?? null,
            attempted_at: new Date().toISOString(),
          }, { onConflict: 'symbol,exchange' });
        processed++;
        if (sleepMs > 0) await sleep(sleepMs);
      }

      const { data: stillPending } = await supabase
        .from('stock_picker_ohlcv_backfill_state')
        .select('symbol,exchange')
        .eq('status', 'pending');
      const remainingPending = (stillPending ?? []).filter((r) =>
        targetKeys.has(`${String(r.symbol)}|${String(r.exchange)}`)).length;

      const cursor = {
        last_run_at: new Date().toISOString(),
        invoked_by,
        candidate_source: candidateSource,
        candidates_resolved: targets.length,
        override_pairs: overridePairs.length,
        processed, remaining_pending: remainingPending,
        dhan_used: dhanCount, twelve_data_fallback_used: tdCount,
        rows_inserted: rowsInsertedTotal,
        errors_count: errorsCount,
        elapsed_ms: Date.now() - t0,
      };
      await supabase.from('stock_picker_runtime_config').upsert({
        config_key: 'ohlcv_backfill_cursor',
        kind: 'operational',
        config_value: cursor,
        description: 'Phase 2S: chunked backfill cursor telemetry',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'config_key' });

      return new Response(JSON.stringify({
        ok: true, mode: 'chunk', invoked_by,
        candidate_source: candidateSource,
        candidates_resolved: targets.length,
        resolved_pairs_total: resolvedPairs.length,
        processed, remaining_pending: remainingPending,
        elapsed_ms: Date.now() - t0,
        errors_count: errorsCount,
        rows_inserted: rowsInsertedTotal,
        dhan_used: dhanCount, twelve_data_fallback_used: tdCount,
        failures,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // -------------------------------------------------------------------
    // Default mode: full pass over resolved clean candidates
    // -------------------------------------------------------------------
    let rows_inserted = 0;
    let dhan_used = 0;
    let twelve_data_fallback_used = 0;
    const errors: Array<{ symbol: string; error: string }> = [];

    for (const t of targets) {
      try {
        const res = await processOne(supabase, t, fromStr, toStr);
        if (!res.chosen) {
          errors.push({ symbol: t.symbol, error: res.error ?? 'unknown' });
          continue;
        }
        rows_inserted += res.rows_inserted;
        if (res.chosen === 'dhan') dhan_used++; else twelve_data_fallback_used++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ symbol: t.symbol, error: msg });
      }
    }

    // Compute remaining_pending for telemetry parity with chunked mode.
    const targetKeys = new Set(targets.map((t) => `${t.symbol}|${t.exchange}`));
    const { data: stillPending } = await supabase
      .from('stock_picker_ohlcv_backfill_state')
      .select('symbol,exchange')
      .eq('status', 'pending');
    const remainingPending = (stillPending ?? []).filter((r) =>
      targetKeys.has(`${String(r.symbol)}|${String(r.exchange)}`)).length;

    const telemetry = {
      ok: rows_inserted > 0 && targets.length > 0,
      symbols_processed: targets.length,
      candidate_source: candidateSource,
      rows_inserted,
      dhan_used,
      twelve_data_fallback_used,
      errors_count: errors.length,
      ran_at: new Date().toISOString(),
    };
    await supabase.from('stock_picker_runtime_config').upsert({
      config_key: 'last_sync_ohlcv_history',
      kind: 'operational',
      config_value: telemetry,
      description: 'Phase 2L: last sync-ohlcv-history run telemetry',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'config_key' });

    return new Response(JSON.stringify({
      ok: true, invoked_by,
      candidate_source: candidateSource,
      candidates_resolved: targets.length,
      symbols_processed: targets.length,
      remaining_pending: remainingPending,
      rows_inserted, dhan_used, twelve_data_fallback_used,
      errors,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('sync-ohlcv-history fatal:', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
