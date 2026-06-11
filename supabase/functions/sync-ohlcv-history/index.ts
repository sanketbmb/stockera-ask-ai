// sync-ohlcv-history
// Phase 2L — Backfill ~2 years of daily OHLCV per cleaned dev-universe symbol.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const invoked_by = typeof body.invoked_by === 'string' ? body.invoked_by : 'manual';

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

    const overrideSymbolsRaw = cfg.get('universe_override_symbols');
    const overrideSymbols: string[] = Array.isArray(overrideSymbolsRaw)
      ? (overrideSymbolsRaw as unknown[]).filter((s): s is string => typeof s === 'string' && s.length > 0)
      : [];
    if (overrideSymbols.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'no universe_override_symbols configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Cleanliness filter (Phase 2I + 2J) + collect best dhan_security_id+segment
    const { data: meta, error: metaErr } = await supabase
      .from('stock_master')
      .select('symbol,exchange,type,segment,is_suspended,dhan_security_id,company_name')
      .in('symbol', overrideSymbols);
    if (metaErr) throw new Error(`stock_master read failed: ${metaErr.message}`);

    const EQUITY_TYPES = new Set(['EQUITY', 'EQ', 'STOCK']);
    const EQUITY_SEGMENTS = new Set(['EQ', 'NSE_EQ', 'BSE_EQ']);
    const bondNameRe = /(^|\s)SDL\s|\d+(\.\d+)?\s*%\s*\d{4}/i;
    const etfSymbolTokenRe = /(?:^|[^A-Z])(ETF|BEES|NIFTYBEES|BANKBEES|GOLDBEES|LIQUIDBEES|JUNIORBEES|N100|NV20)$/i;
    const etfSymbolSuffixRe = /ETF$/i;
    const etfNameRe = /ETF|EXCHANGE\s+TRADED|INDEX\s+FUND/i;

    type Agg = {
      sym: string; exch: string;
      any_equity_type: boolean; any_equity_segment: boolean;
      any_suspended: boolean; dhan_id: string | null;
      company_name: string | null;
    };
    const agg = new Map<string, Agg>();
    for (const r of (meta ?? []) as Array<Record<string, unknown>>) {
      const sym = String(r.symbol ?? ''); const exch = String(r.exchange ?? '');
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

    const surviving: Array<{ symbol: string; exchange: string; dhan_id: string | null }> = [];
    for (const a of agg.values()) {
      if (!a.any_equity_type) continue;
      if (!a.any_equity_segment) continue;
      if (a.any_suspended) continue;
      if (!a.dhan_id) continue;
      if (a.company_name && (etfNameRe.test(a.company_name) || etfSymbolTokenRe.test(a.sym) || etfSymbolSuffixRe.test(a.sym))) continue;
      if (a.company_name && bondNameRe.test(a.company_name)) continue;
      surviving.push({ symbol: a.sym, exchange: a.exch, dhan_id: a.dhan_id });
    }

    // Prefer NSE row when both NSE and BSE survive for the same symbol.
    const bySymbol = new Map<string, { symbol: string; exchange: string; dhan_id: string | null }>();
    for (const s of surviving) {
      const cur = bySymbol.get(s.symbol);
      if (!cur || (cur.exchange !== 'NSE' && s.exchange === 'NSE')) bySymbol.set(s.symbol, s);
    }
    const targets = [...bySymbol.values()];

    const toDate = new Date();
    const fromDate = new Date(toDate);
    fromDate.setUTCFullYear(toDate.getUTCFullYear() - years);
    const fromStr = isoDate(fromDate);
    const toStr = isoDate(toDate);

    let rows_inserted = 0;
    let dhan_used = 0;
    let twelve_data_fallback_used = 0;
    const errors: Array<{ symbol: string; error: string }> = [];

    for (const t of targets) {
      try {
        let rows: OhlcvRow[] | null = await fetchDhan(t.dhan_id!, t.exchange, fromStr, toStr);
        let chosen: 'dhan' | 'twelve_data' | null = null;
        if (rows && rows.length >= MIN_USABLE_ROWS) {
          chosen = 'dhan';
        } else {
          const td = await fetchTwelveData(t.symbol, t.exchange, fromStr, toStr);
          if (td && td.length >= MIN_USABLE_ROWS) {
            rows = td; chosen = 'twelve_data';
          }
        }
        if (!chosen || !rows) {
          errors.push({ symbol: t.symbol, error: 'no usable history from dhan or twelve_data' });
          continue;
        }

        // Dedupe per record_date, attach key fields
        const byDate = new Map<string, OhlcvRow>();
        for (const r of rows) {
          r.symbol = t.symbol; r.exchange = t.exchange; r.source = chosen;
          byDate.set(r.record_date, r);
        }
        const finalRows = [...byDate.values()];

        // Chunked upsert
        const CHUNK = 500;
        for (let i = 0; i < finalRows.length; i += CHUNK) {
          const slice = finalRows.slice(i, i + CHUNK);
          const { error: upErr } = await supabase
            .from('stock_picker_ohlcv_history')
            .upsert(slice, { onConflict: 'symbol,exchange,record_date' });
          if (upErr) throw new Error(upErr.message);
          rows_inserted += slice.length;
        }
        if (chosen === 'dhan') dhan_used++; else twelve_data_fallback_used++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ symbol: t.symbol, error: msg });
      }
    }

    const telemetry = {
      ok: rows_inserted > 0 && targets.length > 0,
      symbols_processed: targets.length,
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
      symbols_processed: targets.length,
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
