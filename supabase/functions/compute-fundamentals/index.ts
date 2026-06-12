// compute-fundamentals
// Second Brain module. Pure-JS fundamental engine over FinEdge ratios + financials.
// Deterministic, SEBI-defensible: every metric is a named formula with JSDoc.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWELVE_DATA_API_KEY = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";

// ── Twelve Data fallback (Phase 2X.4b) ─────────────────────────────────────
type TdProfile = { sector: string | null; industry: string | null; name: string | null };
type TdStats = { market_cap_inr: number | null };

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); } catch { return null; }
  finally { clearTimeout(id); }
}

async function tdProfile(symbol: string, exchange: string): Promise<TdProfile> {
  if (!TWELVE_DATA_API_KEY) return { sector: null, industry: null, name: null };
  const suffix = exchange === "BSE" ? "BO" : "NS";
  const url = `https://api.twelvedata.com/profile?symbol=${encodeURIComponent(symbol)}.${suffix}&apikey=${encodeURIComponent(TWELVE_DATA_API_KEY)}`;
  const res = await fetchWithTimeout(url, 4000);
  if (!res || !res.ok) return { sector: null, industry: null, name: null };
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!body || typeof body !== "object" || (body as Record<string, unknown>).status === "error") {
    return { sector: null, industry: null, name: null };
  }
  const o = body as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { sector: str(o.sector), industry: str(o.industry), name: str(o.name) };
}

async function tdStatistics(symbol: string, exchange: string): Promise<TdStats> {
  if (!TWELVE_DATA_API_KEY) return { market_cap_inr: null };
  const suffix = exchange === "BSE" ? "BO" : "NS";
  const url = `https://api.twelvedata.com/statistics?symbol=${encodeURIComponent(symbol)}.${suffix}&apikey=${encodeURIComponent(TWELVE_DATA_API_KEY)}`;
  const res = await fetchWithTimeout(url, 4000);
  if (!res || !res.ok) return { market_cap_inr: null };
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!body || typeof body !== "object" || (body as Record<string, unknown>).status === "error") {
    return { market_cap_inr: null };
  }
  const o = body as Record<string, unknown>;
  const stats = (o.statistics as Record<string, unknown> | undefined) ?? o;
  const vm = (stats?.valuations_metrics as Record<string, unknown> | undefined) ?? {};
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return null;
  };
  // .NS/.BO listings denominate market cap in INR. Outside those suffixes we don't accept the value.
  return { market_cap_inr: num(vm.market_capitalization ?? (stats as Record<string, unknown>).market_capitalization ?? o.market_capitalization) };
}

async function isTdFallbackEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/stock_picker_runtime_config?select=config_value&config_key=eq.compute_fundamentals_twelvedata_fallback_enabled`, {
      headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) return false;
    const arr = await res.json().catch(() => []);
    return Array.isArray(arr) && arr[0]?.config_value === true;
  } catch { return false; }
}

async function logComputeTelemetry(args: { status: "ok" | "partial" | "error"; symbol: string; exchange: string; finedge_ok_fields: number; twelve_data_recovered_fields: number; missing_fields: string[]; error_message?: string }): Promise<void> {
  try {
    const now = new Date().toISOString();
    await fetch(`${SUPABASE_URL}/rest/v1/cron_run_log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, Prefer: "return=minimal" },
      body: JSON.stringify({
        function_name: "compute-fundamentals",
        status: args.status,
        started_at: now,
        finished_at: now,
        error_message: args.error_message ?? null,
        metrics: {
          symbol: args.symbol, exchange: args.exchange,
          finedge_ok_fields: args.finedge_ok_fields,
          twelve_data_recovered_fields: args.twelve_data_recovered_fields,
          missing_fields: args.missing_fields,
          ran_at: now,
        },
      }),
    }).catch(() => null);
  } catch { /* swallow */ }
}

// DCF assumptions (named, audit-friendly)
const DCF_GROWTH = 0.10;
const DCF_TERMINAL_GROWTH = 0.04;
const DCF_WACC = 0.12;
const DCF_YEARS = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Safely evaluate `fn`; return null when it throws or yields a non-finite number. */
function safe<T>(fn: () => T): T | null {
  try {
    const v = fn();
    if (typeof v === "number" && !Number.isFinite(v)) return null;
    return v ?? null;
  } catch { return null; }
}

/** Field alias resolver — FinEdge mixes case/spellings; we try every variant. */
function pick(row: Record<string, unknown> | undefined, ...aliases: string[]): number | null {
  if (!row) return null;
  for (const a of aliases) {
    const v = row[a];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  // Case-insensitive fallback
  const lc: Record<string, unknown> = {};
  for (const k of Object.keys(row)) lc[k.toLowerCase()] = row[k];
  for (const a of aliases) {
    const v = lc[a.toLowerCase()];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/** Call sibling finedge-fetch with caller's auth (falls back to service role). */
async function fe(body: unknown, auth: string | null): Promise<Record<string, unknown>> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/finedge-fetch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      authorization: auth ?? `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = txt ? JSON.parse(txt) : {}; } catch { /* ignore */ }
  if (!res.ok || parsed.success !== true) {
    throw new Error(`finedge ${res.status}: ${String(parsed.error ?? txt).slice(0, 200)}`);
  }
  return parsed;
}

// ─────────────────────────────── normalizers ───────────────────────────────

/** Unwrap finedge envelope `{success, data: {...}}` → inner object. */
function unwrap(resp: Record<string, unknown>): Record<string, unknown> {
  const d = resp.data as Record<string, unknown> | undefined;
  if (!d) return {};
  // Some payloads double-wrap (data.data); flatten if so.
  if (d.data && typeof d.data === "object" && !Array.isArray(d.data)) {
    return d.data as Record<string, unknown>;
  }
  return d;
}

/** Sort array of `{year}` rows ascending so `[-1]` is the latest fiscal year. */
function sortByYear(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => Number(a.year ?? 0) - Number(b.year ?? 0));
}

/** Dedupe ratios rows that include TTM duplicates of latest annual. Keep per-year, drop TTM. */
function annualRatios(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const annual = rows.filter((r) => String(r.header ?? "").toLowerCase() !== "ttm");
  // Some feeds repeat the same year twice (TTM + Mar YYYY); dedupe by year, keep last.
  const seen = new Map<number, Record<string, unknown>>();
  for (const r of annual) {
    const y = Number(r.year ?? 0);
    if (y) seen.set(y, r);
  }
  return sortByYear([...seen.values()]);
}

// ─────────────────────────────── math helpers ───────────────────────────────

/** Year-over-year growth as a percentage. Null if `prev` is non-positive (sign-flip undefined). */
function yoyPct(latest: number | null, prev: number | null): number | null {
  if (latest == null || prev == null || prev === 0) return null;
  return ((latest - prev) / Math.abs(prev)) * 100;
}

/** Compound annual growth rate (%) over `years`. Null if either bound ≤ 0. */
function cagrPct(end: number | null, start: number | null, years: number): number | null {
  if (end == null || start == null) return null;
  if (end <= 0 || start <= 0 || years <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

/** Arithmetic mean over the last `n` finite values; null if none. */
function avg(arr: (number | null)[], n: number = arr.length): number | null {
  const tail = arr.slice(-n).filter((v): v is number => v != null && Number.isFinite(v));
  if (!tail.length) return null;
  return tail.reduce((a, b) => a + b, 0) / tail.length;
}

const round = (v: number | null, d = 2): number | null =>
  v == null ? null : Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

// ─────────────────────────────── series builders ───────────────────────────────

/** Extract a numeric series from year-sorted rows using alias resolution. */
function series(rows: Record<string, unknown>[], ...aliases: string[]): (number | null)[] {
  return rows.map((r) => pick(r, ...aliases));
}

// ─────────────────────────────── quality scores ───────────────────────────────

/**
 * Piotroski F-Score (Piotroski 2000). Sum of 9 binary fundamental checks.
 * Returns score 0-9 and per-check breakdown for audit.
 */
function piotroski(pl: Record<string, unknown>[], bs: Record<string, unknown>[], cf: Record<string, unknown>[]) {
  if (pl.length < 2 || bs.length < 2 || cf.length < 1) return { score: null as number | null, breakdown: {} };
  const n = (v: boolean | null) => (v === true ? 1 : 0);

  const ni = series(pl, "profitLossForPeriod", "profitOrLossAttributableToOwners", "netIncome");
  const rev = series(pl, "revenueFromOperations", "income", "revenue");
  const cogs = series(pl, "costofGoodsSold", "costOfGoodsSold", "costOfMaterialsConsumed");
  const shares = series(pl, "dilutedOutstandingShares", "sharesOutstanding");
  const cfo = series(cf, "cashFlowsFromOperatingActivities", "operatingCashFlow", "cfo");
  const assets = series(bs, "assets", "totalAssets");
  const curA = series(bs, "currentAssets");
  const curL = series(bs, "currentLiabilities");
  const ltDebt = series(bs, "borrowingsNoncurrent", "longTermDebt", "noncurrentLiabilities");

  const lI = ni.length - 1, pI = ni.length - 2;
  const lAssets = assets[lI], pAssets = assets[pI];
  const avgAssetsL = lAssets != null && pAssets != null ? (lAssets + pAssets) / 2 : null;
  const avgAssetsP = pI > 0 && assets[pI - 1] != null && pAssets != null ? (pAssets + assets[pI - 1]!) / 2 : null;

  const roaL = ni[lI] != null && avgAssetsL ? ni[lI]! / avgAssetsL : null;
  const grossL = rev[lI] != null && cogs[lI] != null && rev[lI]! > 0 ? (rev[lI]! - cogs[lI]!) / rev[lI]! : null;
  const grossP = rev[pI] != null && cogs[pI] != null && rev[pI]! > 0 ? (rev[pI]! - cogs[pI]!) / rev[pI]! : null;
  const turnL = rev[lI] != null && avgAssetsL ? rev[lI]! / avgAssetsL : null;
  const turnP = rev[pI] != null && avgAssetsP ? rev[pI]! / avgAssetsP : null;
  const crL = curA[lI] != null && curL[lI] ? curA[lI]! / curL[lI]! : null;
  const crP = curA[pI] != null && curL[pI] ? curA[pI]! / curL[pI]! : null;

  const checks = {
    net_income_positive: ni[lI] != null ? ni[lI]! > 0 : null,
    roa_positive: roaL != null ? roaL > 0 : null,
    cfo_positive: cfo.at(-1) != null ? cfo.at(-1)! > 0 : null,
    cfo_gt_net_income: cfo.at(-1) != null && ni[lI] != null ? cfo.at(-1)! > ni[lI]! : null,
    lt_debt_decreased: ltDebt[lI] != null && ltDebt[pI] != null ? ltDebt[lI]! < ltDebt[pI]! : null,
    current_ratio_improved: crL != null && crP != null ? crL > crP : null,
    no_new_shares: shares[lI] != null && shares[pI] != null ? shares[lI]! <= shares[pI]! : null,
    gross_margin_improved: grossL != null && grossP != null ? grossL > grossP : null,
    asset_turnover_improved: turnL != null && turnP != null ? turnL > turnP : null,
  };

  const score = Object.values(checks).reduce<number>((s, v) => s + n(v), 0);
  return { score, breakdown: checks };
}

/**
 * Altman Z-Score for public companies (Altman 1968).
 * Z = 1.2A + 1.4B + 3.3C + 0.6D + 1.0E
 *   A = working capital / total assets
 *   B = retained earnings / total assets
 *   C = EBIT / total assets
 *   D = market cap / total liabilities
 *   E = revenue / total assets
 * zones: Z>3 safe, 1.8<=Z<=3 grey, Z<1.8 distress.
 */
function altmanZ(opts: {
  currentAssets: number | null;
  currentLiabilities: number | null;
  totalAssets: number | null;
  retainedEarnings: number | null;
  ebit: number | null;
  marketCap: number | null;
  totalLiabilities: number | null;
  revenue: number | null;
}): { z: number | null; zone: "SAFE" | "GREY" | "DISTRESS" | null } {
  const { currentAssets: ca, currentLiabilities: cl, totalAssets: ta, retainedEarnings: re, ebit, marketCap: mc, totalLiabilities: tl, revenue: rv } = opts;
  if (!ta || !tl) return { z: null, zone: null };
  const wc = ca != null && cl != null ? ca - cl : null;
  const A = wc != null ? wc / ta : null;
  const B = re != null ? re / ta : null;
  const C = ebit != null ? ebit / ta : null;
  const D = mc != null ? mc / tl : null;
  const E = rv != null ? rv / ta : null;
  if ([A, B, C, D, E].some((x) => x == null)) return { z: null, zone: null };
  const z = 1.2 * A! + 1.4 * B! + 3.3 * C! + 0.6 * D! + 1.0 * E!;
  const zone = z > 3 ? "SAFE" : z >= 1.8 ? "GREY" : "DISTRESS";
  return { z, zone };
}

/**
 * Graham Number (Graham, "The Intelligent Investor", 1973):
 * fair value = sqrt(22.5 * EPS * BookValuePerShare). Null if either ≤ 0.
 */
function grahamNumber(eps: number | null, bvps: number | null): number | null {
  if (eps == null || bvps == null || eps <= 0 || bvps <= 0) return null;
  return Math.sqrt(22.5 * eps * bvps);
}

/**
 * Single-stage → terminal DCF (Gordon growth). FCF grows at DCF_GROWTH for
 * DCF_YEARS, then terminal at DCF_TERMINAL_GROWTH; discounted at DCF_WACC.
 * Returns intrinsic value per share, or null if inputs missing / non-positive FCF.
 */
function dcfIntrinsic(fcf0: number | null, shares: number | null): number | null {
  if (fcf0 == null || shares == null || fcf0 <= 0 || shares <= 0) return null;
  let pv = 0;
  let fcf = fcf0;
  for (let t = 1; t <= DCF_YEARS; t++) {
    fcf = fcf * (1 + DCF_GROWTH);
    pv += fcf / Math.pow(1 + DCF_WACC, t);
  }
  const terminal = (fcf * (1 + DCF_TERMINAL_GROWTH)) / (DCF_WACC - DCF_TERMINAL_GROWTH);
  pv += terminal / Math.pow(1 + DCF_WACC, DCF_YEARS);
  return pv / shares;
}

// ─────────────────────────────── score + verdict ───────────────────────────────

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

/** Composite 0-100 score with explicit, auditable weight per pillar. */
function computeScore(o: {
  roe: number | null; netMargin: number | null;
  revCagr3: number | null; profCagr3: number | null;
  debtEquity: number | null; currentRatio: number | null; altmanZone: string | null;
  pe: number | null; grahamGapPct: number | null;
  piotroski: number | null;
}): number {
  // Profitability 0-25: ROE 0-15 (cap at 25%), netMargin 0-10 (cap at 25%)
  const pProf = (o.roe != null ? clamp(o.roe / 25 * 15, 0, 15) : 0)
              + (o.netMargin != null ? clamp(o.netMargin / 25 * 10, 0, 10) : 0);
  // Growth 0-20: revCagr3 + profCagr3 each 0-10 (cap at 20%)
  const pGrow = (o.revCagr3 != null ? clamp(o.revCagr3 / 20 * 10, 0, 10) : 0)
              + (o.profCagr3 != null ? clamp(o.profCagr3 / 20 * 10, 0, 10) : 0);
  // Health 0-20: low D/E 0-8, current ratio 0-6, altman zone 0-6
  const pHealth = (o.debtEquity != null ? clamp((2 - o.debtEquity) / 2 * 8, 0, 8) : 0)
                + (o.currentRatio != null ? clamp((o.currentRatio - 1) / 1 * 6, 0, 6) : 0)
                + (o.altmanZone === "SAFE" ? 6 : o.altmanZone === "GREY" ? 3 : 0);
  // Valuation 0-20: low P/E 0-10 (best at 15, zero at 40), graham gap 0-10
  const pVal = (o.pe != null && o.pe > 0 ? clamp((40 - o.pe) / 25 * 10, 0, 10) : 0)
             + (o.grahamGapPct != null ? clamp((o.grahamGapPct + 20) / 40 * 10, 0, 10) : 0);
  // Quality 0-15: piotroski/9 * 15
  const pQual = o.piotroski != null ? (o.piotroski / 9) * 15 : 0;
  return Math.round(clamp(pProf + pGrow + pHealth + pVal + pQual));
}

function verdictOf(score: number): string {
  if (score >= 75) return "STRONG_FUNDAMENTALS";
  if (score >= 60) return "GOOD";
  if (score >= 40) return "AVERAGE";
  return "WEAK";
}

// ─────────────────────────────── main handler ───────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);

  const auth = req.headers.get("authorization");
  let symbol = "";
  let exchange = "NSE";
  try {
    const body = await req.json();
    symbol = String(body?.symbol ?? "").trim();
    const ex = String(body?.exchange ?? "").trim().toUpperCase();
    if (ex === "BSE" || ex === "NSE") exchange = ex;
  } catch { /* fallthrough */ }
  if (!symbol) return json({ success: false, error: "INVALID_INPUT", details: "symbol required" }, 400);


  try {
  const tdEnabled = await isTdFallbackEnabled();

  try {
    // ── Step 1: parallel fetch (profile tolerated separately) ────────────────
    const [profileS, ratiosS, plS, bsS, cfS] = await Promise.allSettled([
      fe({ endpoint: "company-profile", symbol }, auth),
      fe({ endpoint: "ratios", symbol, params: { statement_type: "c", ratio_type: "pr" } }, auth),
      fe({ endpoint: "financials", symbol, params: { statement_type: "c", statement_code: "pl", period: "annual" } }, auth),
      fe({ endpoint: "financials", symbol, params: { statement_type: "c", statement_code: "bs", period: "annual" } }, auth),
      fe({ endpoint: "financials", symbol, params: { statement_type: "c", statement_code: "cf", period: "annual" } }, auth),
    ]);
    // Financials are required for the full computation; only profile failure is tolerated.
    const financialsFailures = [ratiosS, plS, bsS, cfS].filter((r) => r.status === "rejected");
    const financialsErr = financialsFailures.length > 0
      ? (financialsFailures[0] as PromiseRejectedResult).reason
      : null;

    const profileR = profileS.status === "fulfilled" ? profileS.value : {} as Record<string, unknown>;
    const profile = unwrap(profileR);

    // FinEdge company-level fields (primary).
    const feSector: string | null = (typeof profile.sector === "string" && profile.sector.trim())
      ? String(profile.sector).trim()
      : (typeof profile.macro_sector === "string" && profile.macro_sector.trim() ? String(profile.macro_sector).trim() : null);
    const feIndustry: string | null = (typeof profile.industry === "string" && profile.industry.trim())
      ? String(profile.industry).trim() : null;
    const feMarketCapCr = Number(profile.market_cap ?? NaN); // crore
    const feMarketCapAbs: number | null = Number.isFinite(feMarketCapCr) ? feMarketCapCr * 1e7 : null;
    const feName: string | null = (typeof profile.name === "string" && profile.name.trim())
      ? String(profile.name).trim() : null;

    // Twelve Data fallback fills NULLs only — primary always wins when it has data.
    let tdRecoveredFields = 0;
    let tdSector: string | null = null, tdIndustry: string | null = null, tdMarketCapAbs: number | null = null, tdName: string | null = null;
    const needFallback = tdEnabled && (feSector == null || feIndustry == null || feMarketCapAbs == null);
    if (needFallback) {
      const [tp, ts] = await Promise.all([tdProfile(symbol, exchange), tdStatistics(symbol, exchange)]);
      tdSector = tp.sector; tdIndustry = tp.industry; tdName = tp.name;
      tdMarketCapAbs = ts.market_cap_inr;
    }

    const finalSector = feSector ?? tdSector ?? null;
    const finalIndustry = feIndustry ?? tdIndustry ?? null;
    const finalMarketCapAbs = feMarketCapAbs ?? tdMarketCapAbs ?? null;
    const finalName = feName ?? tdName ?? null;
    const capBand: "large" | "mid" | "small" | null = finalMarketCapAbs == null || !Number.isFinite(finalMarketCapAbs) || finalMarketCapAbs <= 0
      ? null
      : finalMarketCapAbs >= 200_000_000_000 ? "large"
      : finalMarketCapAbs >= 50_000_000_000 ? "mid" : "small";

    const fundamentals_source_map = {
      sector: feSector != null ? "finedge" as const : (tdSector != null ? "twelve_data" as const : "missing" as const),
      industry: feIndustry != null ? "finedge" as const : (tdIndustry != null ? "twelve_data" as const : "missing" as const),
      market_cap_rs: feMarketCapAbs != null ? "finedge" as const : (tdMarketCapAbs != null ? "twelve_data" as const : "missing" as const),
      cap_band: feMarketCapAbs != null ? "finedge" as const : (tdMarketCapAbs != null ? "twelve_data" as const : "missing" as const),
    };
    for (const v of Object.values(fundamentals_source_map)) if (v === "twelve_data") tdRecoveredFields++;
    const feOkFields = Object.values(fundamentals_source_map).filter((v) => v === "finedge").length;
    const missingFields = Object.entries(fundamentals_source_map).filter(([, v]) => v === "missing").map(([k]) => k);

    // If financials failed entirely, return a partial company-only response with provenance.
    if (financialsErr) {
      const partialStatus: "partial" | "error" = (feOkFields + tdRecoveredFields) > 0 ? "partial" : "error";
      await logComputeTelemetry({
        status: partialStatus, symbol, exchange,
        finedge_ok_fields: feOkFields, twelve_data_recovered_fields: tdRecoveredFields,
        missing_fields: missingFields, error_message: `DATA_FETCH_FAILED: ${(financialsErr as Error)?.message ?? String(financialsErr)}`,
      });
      return json({
        success: partialStatus === "partial",
        error: partialStatus === "error" ? "DATA_FETCH_FAILED" : undefined,
        symbol,
        partial: partialStatus === "partial",
        computed_at: new Date().toISOString(),
        company: {
          name: finalName,
          sector: finalSector,
          industry: finalIndustry,
          market_cap_cr: finalMarketCapAbs != null ? finalMarketCapAbs / 1e7 : null,
          market_cap_rs: finalMarketCapAbs,
          cap_band: capBand,
          employees: null,
          price: null,
          fundamentals_source_map,
        },
        details: { reason: `DATA_FETCH_FAILED: ${(financialsErr as Error)?.message ?? String(financialsErr)}` },
      }, partialStatus === "error" ? 502 : 200);
    }

    const ratiosR = (ratiosS as PromiseFulfilledResult<Record<string, unknown>>).value;
    const plR = (plS as PromiseFulfilledResult<Record<string, unknown>>).value;
    const bsR = (bsS as PromiseFulfilledResult<Record<string, unknown>>).value;
    const cfR = (cfS as PromiseFulfilledResult<Record<string, unknown>>).value;
    const ratiosRaw = (unwrap(ratiosR).ratios ?? []) as Record<string, unknown>[];
    const plRaw = (unwrap(plR).financials ?? []) as Record<string, unknown>[];
    const bsRaw = (unwrap(bsR).financials ?? []) as Record<string, unknown>[];
    const cfRaw = (unwrap(cfR).financials ?? []) as Record<string, unknown>[];

    const ratios = annualRatios(ratiosRaw);
    const pl = sortByYear(plRaw);
    const bs = sortByYear(bsRaw);
    const cf = sortByYear(cfRaw);

    if (pl.length < 3 || bs.length < 3) {
      await logComputeTelemetry({
        status: "partial", symbol, exchange,
        finedge_ok_fields: feOkFields, twelve_data_recovered_fields: tdRecoveredFields,
        missing_fields: missingFields,
      });
      return json({ success: false, error: "INSUFFICIENT_HISTORY",
        details: { pl: pl.length, bs: bs.length },
        company: {
          name: finalName, sector: finalSector, industry: finalIndustry,
          market_cap_cr: finalMarketCapAbs != null ? finalMarketCapAbs / 1e7 : null,
          market_cap_rs: finalMarketCapAbs, cap_band: capBand,
          fundamentals_source_map,
        },
      });
    }

    // ── Step 2: derive series ─────────────────────────────────────────────────
    const revS  = series(pl, "revenueFromOperations", "income", "revenue");

    const profS = series(pl, "profitOrLossAttributableToOwners", "profitLossForPeriod", "netIncome");
    const epsS  = series(pl, "eps");
    const pbtS  = series(pl, "profitBeforeTax");
    const finS  = series(pl, "financeCosts", "interestExpense");
    const depS  = series(pl, "depreciationAndAmortisation", "depreciation");
    const cogsS = series(pl, "costofGoodsSold", "costOfMaterialsConsumed");
    const expS  = series(pl, "expenses");
    const sharesS = series(pl, "dilutedOutstandingShares", "sharesOutstanding");

    const assetsS  = series(bs, "assets", "totalAssets");
    const curAS    = series(bs, "currentAssets");
    const curLS    = series(bs, "currentLiabilities");
    const invS     = series(bs, "inventories");
    const cashS    = series(bs, "cashAndCashEquivalents");
    const equityS  = series(bs, "equityAttributableToOwnersOfParent");
    const eqCapS   = series(bs, "equityCapital");
    const liabS    = series(bs, "liabilities");
    const stDebtS  = series(bs, "borrowingsCurrent");
    const ltDebtS  = series(bs, "borrowingsNoncurrent");

    const cfoS = series(cf, "cashFlowsFromOperatingActivities");
    const cfiS = series(cf, "cashFlowsFromInvestingActivities");

    const lI = pl.length - 1, pI = lI - 1;
    const lBI = bs.length - 1, pBI = lBI - 1;

    // ── company (merged FinEdge primary + Twelve Data fill) ──────────────────
    const marketCapAbs = finalMarketCapAbs;                                  // ₹
    const marketCap = marketCapAbs != null ? marketCapAbs / 1e7 : NaN;       // ₹ crore
    const sharesOut = sharesS[lI];
    const price = marketCapAbs != null && sharesOut ? marketCapAbs / sharesOut : null;

    const company = {
      name: finalName,
      sector: finalSector,
      industry: finalIndustry,
      market_cap_cr: Number.isFinite(marketCap) ? marketCap : null,
      market_cap_rs: marketCapAbs,
      cap_band: capBand,
      employees: null as number | null,
      price: round(price, 2),
      fundamentals_source_map,
    };


    // ── valuation ─────────────────────────────────────────────────────────────
    const netIncomeAbs = profS[lI];
    const revAbs = revS[lI];
    const equityAbs = equityS[lBI];
    const totalDebt = (stDebtS[lBI] ?? 0) + (ltDebtS[lBI] ?? 0);
    const bvps = safe(() => sharesOut! > 0 && equityAbs != null ? equityAbs / sharesOut! : null);
    const epsLatest = epsS[lI];

    const pe = safe(() => marketCapAbs != null && netIncomeAbs && netIncomeAbs > 0 ? marketCapAbs / netIncomeAbs : null);
    const pb = safe(() => marketCapAbs != null && equityAbs && equityAbs > 0 ? marketCapAbs / equityAbs : null);
    const ps = safe(() => marketCapAbs != null && revAbs && revAbs > 0 ? marketCapAbs / revAbs : null);
    const epsCagr3 = cagrPct(epsS[lI], epsS[lI - 3] ?? null, 3);
    const peg = safe(() => pe != null && epsCagr3 != null && epsCagr3 > 0 ? pe / epsCagr3 : null);
    const ebit = safe(() => (pbtS[lI] ?? null) != null && (finS[lI] ?? null) != null ? pbtS[lI]! + finS[lI]! : null);
    const ebitda = safe(() => ebit != null && depS[lI] != null ? ebit + depS[lI]! : null);
    const evEbitda = safe(() => marketCapAbs != null && ebitda && ebitda > 0
      ? (marketCapAbs + totalDebt - (cashS[lBI] ?? 0)) / ebitda : null);

    const valuation = {
      pe: round(pe), pb: round(pb), ps: round(ps), peg: round(peg),
      ev_ebitda: round(evEbitda), dividend_yield: null as number | null,
    };

    // ── profitability ─────────────────────────────────────────────────────────
    const lastRatio = ratios.at(-1);
    const roeLatest = safe(() => pick(lastRatio, "returnOnEquity") != null ? pick(lastRatio, "returnOnEquity")! * 100 : null)
                  ?? safe(() => equityAbs && netIncomeAbs != null ? (netIncomeAbs / equityAbs) * 100 : null);
    const roeSeries = ratios.map((r) => { const v = pick(r, "returnOnEquity"); return v != null ? v * 100 : null; });
    const roe3 = avg(roeSeries, 3);
    const roaLatest = safe(() => { const v = pick(lastRatio, "returnOnAsset"); return v != null ? v * 100 : null; });
    const roce = safe(() => { const v = pick(lastRatio, "returnOnCapital"); return v != null ? v * 100 : null; });
    const netMargin = safe(() => { const v = pick(lastRatio, "netMargin"); return v != null ? v * 100 : null; });
    const opMargin  = safe(() => { const v = pick(lastRatio, "operatingMargin"); return v != null ? v * 100 : null; });
    const grossMargin = safe(() => { const v = pick(lastRatio, "grossMargin"); return v != null ? v * 100 : null; });

    const profitability = {
      roe_latest: round(roeLatest), roe_3yr_avg: round(roe3),
      roa_latest: round(roaLatest), roce: round(roce),
      net_margin: round(netMargin), operating_margin: round(opMargin), gross_margin: round(grossMargin),
    };

    // ── growth ────────────────────────────────────────────────────────────────
    const growth = {
      revenue_growth_yoy: round(yoyPct(revS[lI], revS[pI])),
      revenue_cagr_3y: round(cagrPct(revS[lI], revS[lI - 3] ?? null, 3)),
      revenue_cagr_5y: round(cagrPct(revS[lI], revS[lI - 5] ?? null, 5)),
      profit_growth_yoy: round(yoyPct(profS[lI], profS[pI])),
      profit_cagr_3y: round(cagrPct(profS[lI], profS[lI - 3] ?? null, 3)),
      profit_cagr_5y: round(cagrPct(profS[lI], profS[lI - 5] ?? null, 5)),
      eps_growth_yoy: round(yoyPct(epsS[lI], epsS[pI])),
    };

    // ── financial health ──────────────────────────────────────────────────────
    const debtEquity = safe(() => equityAbs && equityAbs > 0 ? totalDebt / equityAbs : null);
    const currentRatio = safe(() => curLS[lBI] && curLS[lBI]! > 0 && curAS[lBI] != null ? curAS[lBI]! / curLS[lBI]! : null);
    const quickRatio = safe(() => curLS[lBI] && curLS[lBI]! > 0 && curAS[lBI] != null
      ? (curAS[lBI]! - (invS[lBI] ?? 0)) / curLS[lBI]! : null);
    const interestCov = safe(() => finS[lI] && finS[lI]! > 0 && ebit != null ? ebit / finS[lI]! : null);
    const debtToAssets = safe(() => assetsS[lBI] && assetsS[lBI]! > 0 ? totalDebt / assetsS[lBI]! : null);

    const financial_health = {
      debt_equity: round(debtEquity), current_ratio: round(currentRatio),
      quick_ratio: round(quickRatio), interest_coverage: round(interestCov),
      debt_to_assets: round(debtToAssets),
    };

    // ── quality scores ────────────────────────────────────────────────────────
    const pio = piotroski(pl, bs, cf);
    // Retained earnings ≈ equity − share capital (proxy; SEBI-defensible note in JSDoc).
    const retainedEarnings = safe(() => equityAbs != null && eqCapS[lBI] != null ? equityAbs - eqCapS[lBI]! : null);
    const alt = altmanZ({
      currentAssets: curAS[lBI], currentLiabilities: curLS[lBI],
      totalAssets: assetsS[lBI], retainedEarnings,
      ebit, marketCap: marketCapAbs, totalLiabilities: liabS[lBI], revenue: revAbs,
    });
    const graham = grahamNumber(epsLatest, bvps);
    const grahamGapPct = safe(() => graham != null && price ? ((graham - price) / price) * 100 : null);
    // FCF = CFO − Capex. Capex proxy: |min(CFI, 0)|. Conservative.
    const capexProxy = cfiS[lI] != null && cfiS[lI]! < 0 ? Math.abs(cfiS[lI]!) : 0;
    const fcf0 = cfoS[lI] != null ? cfoS[lI]! - capexProxy : null;
    const dcfPerShare = cf.length >= 5 ? dcfIntrinsic(fcf0, sharesOut) : null;

    const quality_scores = {
      piotroski_f_score: pio.score,
      piotroski_breakdown: pio.breakdown,
      altman_z_score: round(alt.z),
      altman_zone: alt.zone,
      graham_number: round(graham),
      graham_vs_price_pct: round(grahamGapPct),
      dcf_intrinsic_value: round(dcfPerShare),
    };

    // ── signals ───────────────────────────────────────────────────────────────
    const signals: string[] = [];
    const push = (cond: boolean | null, s: string) => { if (cond === true) signals.push(s); };

    push(roeLatest != null && roeLatest > 20, "high_roe");
    push(growth.revenue_growth_yoy != null && growth.profit_growth_yoy != null
      && growth.revenue_growth_yoy > 15 && growth.profit_growth_yoy > 15, "strong_growth");
    push(debtEquity != null && debtEquity < 0.5, "low_debt");
    push(debtEquity != null && debtEquity > 2, "high_debt");
    push(opMargin != null && (avg(ratios.map((r) => { const v = pick(r, "operatingMargin"); return v != null ? v * 100 : null; }), 3) ?? Infinity) < opMargin, "improving_margins");
    // 5y avg P/E from historical: market_cap not historical here; skip cheap/expensive vs 5y avg.
    push(graham != null && price != null && graham > 1.2 * price, "graham_undervalued");
    push(graham != null && price != null && graham < 0.8 * price, "graham_overvalued");
    push(alt.zone === "SAFE", "altman_safe");
    push(alt.zone === "DISTRESS", "altman_distress");
    push(pio.score != null && pio.score >= 7, "high_piotroski");
    push(pio.score != null && pio.score <= 3, "low_piotroski");
    push(profS.slice(-5).every((v) => v != null && v > 0) && profS.length >= 5, "consistent_profit");
    // dividend_yield not in 'pr' ratios; omit unless present.

    // ── score ─────────────────────────────────────────────────────────────────
    const score = computeScore({
      roe: roeLatest, netMargin,
      revCagr3: growth.revenue_cagr_3y, profCagr3: growth.profit_cagr_3y,
      debtEquity, currentRatio, altmanZone: alt.zone,
      pe, grahamGapPct,
      piotroski: pio.score,
    });

    const okStatus: "ok" | "partial" = missingFields.length === 0 ? "ok" : "partial";
    await logComputeTelemetry({
      status: okStatus, symbol, exchange,
      finedge_ok_fields: feOkFields, twelve_data_recovered_fields: tdRecoveredFields,
      missing_fields: missingFields,
    });

    return json({
      success: true,
      symbol,
      exchange,
      computed_at: new Date().toISOString(),
      company,
      valuation,
      profitability,
      growth,
      financial_health,
      quality_scores,
      signals,
      fundamental_score: score,
      verdict: verdictOf(score),
      fundamentals_source_map,
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    await logComputeTelemetry({
      status: "error", symbol, exchange,
      finedge_ok_fields: 0, twelve_data_recovered_fields: 0,
      missing_fields: ["sector", "industry", "market_cap_rs", "cap_band"],
      error_message: msg,
    });
    if (msg.startsWith("DATA_FETCH_FAILED")) {
      return json({ success: false, error: "DATA_FETCH_FAILED", details: msg }, 502);
    }
    console.error("compute-fundamentals:", err);
    return json({ success: false, error: "INTERNAL_ERROR", details: msg }, 500);
  }
});


