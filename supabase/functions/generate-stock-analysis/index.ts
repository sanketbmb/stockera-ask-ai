// generate-stock-analysis
// Orchestrator for the five Brain modules (technicals, fundamentals, risk, momentum, sentiment).
// Stateless. No LLM. Returns one normalized JSON payload for the AskExpert report template.
//
// Fan-out pattern: Promise.allSettled to each compute-* edge function in parallel,
// forwarding caller auth header (matches compute-sentiment pattern).
// Per-module failure never throws — captured in audit_meta.source_trace.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const FORMULA_VERSION = "orchestrator-1.2";
const VERDICT_MODEL_VERSION = "tiered-verdict-1.0";
const MODULE_TIMEOUT_MS = 25_000;
const TRADE_PLAN_SOURCE = (Deno.env.get("TRADE_PLAN_SOURCE") ?? "new").toLowerCase() === "legacy" ? "legacy" : "new";

type QueryType = "intraday" | "medium-term" | "long-term";
type Action = "BUY" | "HOLD" | "SELL" | "AVOID" | "WATCHLIST";

interface ModuleTrace {
  module: string;
  ok: boolean;
  http_status: number | null;
  latency_ms: number;
  error?: string | null;
  code?: string | null;
  derived?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function r2(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}
function num(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

// ─── Supabase REST helpers (service role) ───
async function sbSelect<T = unknown>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ─── Module invocation ───
async function callModule(
  fnName: string,
  body: Record<string, unknown>,
  _callerAuth: string | null,
): Promise<{ trace: ModuleTrace; data: Record<string, unknown> | null }> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MODULE_TIMEOUT_MS);
  try {
    // Orchestrator→module calls are trusted internal calls. We use the service-role
    // key as Bearer so the gateway's verify_jwt check passes regardless of whether
    // the original caller is anonymous or has a stale session token.
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const txt = await res.text();
    let parsed: Record<string, unknown> | null = null;
    try { parsed = txt ? JSON.parse(txt) : null; } catch { parsed = null; }
    const latency = Date.now() - started;
    const ok = res.ok && parsed?.success === true;
    return {
      trace: {
        module: fnName,
        ok,
        http_status: res.status,
        latency_ms: latency,
        error: ok ? null : String(parsed?.error ?? txt.slice(0, 180) ?? "unknown"),
        code: ok ? null : (parsed?.error ? String(parsed.error) : null),
      },
      data: ok ? parsed : null,
    };
  } catch (e) {
    return {
      trace: { module: fnName, ok: false, http_status: null, latency_ms: Date.now() - started, error: String(e).slice(0, 200), code: "FETCH_ERROR" },
      data: null,
    };
  } finally { clearTimeout(timer); }
}

// ─── Stock resolution ───
interface StockMaster { symbol: string; company_name: string | null; exchange: string; segment: string }
async function resolveStock(rawSymbol: string): Promise<StockMaster | null> {
  const sym = rawSymbol.trim().toUpperCase().replace(/\.NS$|\.BO$/i, "");
  const rows = await sbSelect<StockMaster[]>(
    `stock_master?symbol=eq.${encodeURIComponent(sym)}&select=symbol,company_name,exchange,segment&limit=1`
  );
  if (Array.isArray(rows) && rows.length > 0) return rows[0];
  return null;
}
async function fetchSectorIndustry(symbol: string, auth: string | null): Promise<{ sector: string | null; industry: string | null }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/finedge-fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY, authorization: auth ?? `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ endpoint: "company-profile", symbol }),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (body.success !== true) return { sector: null, industry: null };
    const d = body.data as Record<string, unknown> | undefined;
    const inner = (d?.data ?? d) as Record<string, unknown> | undefined;
    return {
      sector:   inner?.sector   ? String(inner.sector)   : (inner?.Sector   ? String(inner.Sector)   : null),
      industry: inner?.industry ? String(inner.industry) : (inner?.Industry ? String(inner.Industry) : null),
    };
  } catch { return { sector: null, industry: null }; }
}

// ─── Normalizers (one per module) ───
function normalizeTechnical(d: Record<string, unknown> | null) {
  if (!d) return null;
  const ind = (d.indicators ?? {}) as Record<string, Record<string, unknown>>;
  const trend = (ind.trend ?? {}) as Record<string, unknown>;
  const mom   = (ind.momentum ?? {}) as Record<string, unknown>;
  const vol   = (ind.volatility ?? {}) as Record<string, unknown>;
  const str   = (ind.strength ?? {}) as Record<string, unknown>;
  const lvl   = (ind.levels ?? {}) as Record<string, unknown>;
  const bb    = (vol.bollinger ?? {}) as Record<string, unknown>;
  const macd  = (mom.macd ?? {}) as Record<string, unknown>;
  const piv   = (lvl.pivot ?? {}) as Record<string, unknown>;
  const close = num(d.current_price);

  // EMA stack label
  const e20 = num(trend.ema_20), e50 = num(trend.ema_50), e200 = num(trend.ema_200);
  let emaStack = "MIXED";
  if (e20 != null && e50 != null && e200 != null) {
    if (close != null && close > e20 && e20 > e50 && e50 > e200) emaStack = "BULLISH_STACK";
    else if (close != null && close < e20 && e20 < e50 && e50 < e200) emaStack = "BEARISH_STACK";
  }
  // MACD signal label
  const macdHist = num(macd.histogram);
  const macdSignal = macdHist == null ? "" : macdHist > 0 ? "BULLISH" : macdHist < 0 ? "BEARISH" : "NEUTRAL";
  // Bollinger position
  const pctB = num(bb.percent_b);
  const bbPos = pctB == null ? "" : pctB > 1 ? "ABOVE_UPPER" : pctB > 0.8 ? "UPPER_BAND" : pctB < 0 ? "BELOW_LOWER" : pctB < 0.2 ? "LOWER_BAND" : "MIDDLE";

  const support_1    = num(piv.s1);
  const support_2    = num(piv.s2);
  const resistance_1 = num(piv.r1);
  const resistance_2 = num(piv.r2);
  const atr = num(vol.atr_14);
  // Derive entry / stop / targets if not explicitly produced
  const entry_zone = close;
  const stop_loss  = support_1 != null && atr != null ? r2(support_1 - atr) : (support_1 ?? null);
  const target_1   = resistance_1 ?? null;
  const target_2   = resistance_2 ?? null;

  return {
    snapshot: {
      rsi: r2(mom.rsi_14),
      macd_signal: macdSignal,
      trend_label: String(trend.direction ?? d.trend ?? ""),
      ema_stack: emaStack,
      adx: r2(str.adx_14),
      bollinger_position: bbPos,
      vwap_signal: "",
    },
    levels: {
      entry_zone: r2(entry_zone),
      stop_loss: r2(stop_loss),
      target_1: r2(target_1),
      target_2: r2(target_2),
      support_1: r2(support_1),
      support_2: r2(support_2),
      resistance_1: r2(resistance_1),
      resistance_2: r2(resistance_2),
    },
    price: {
      current_price: r2(close),
      price_source: "finedge",
      as_of: String(((d.data_range ?? {}) as Record<string, unknown>).to ?? d.computed_at ?? ""),
    },
    score: num(d.technical_score),
    as_of: String(d.computed_at ?? ""),
    derived_levels: !(resistance_1 != null && resistance_2 != null),
  };
}

function normalizeFundamental(d: Record<string, unknown> | null, sector: string | null) {
  if (!d) return null;
  const val   = (d.valuation ?? {}) as Record<string, unknown>;
  const prof  = (d.profitability ?? {}) as Record<string, unknown>;
  const q     = (d.quality_scores ?? {}) as Record<string, unknown>;
  const company = (d.company ?? {}) as Record<string, unknown>;

  const pe = num(val.pe);
  const dcfPerShare = num(q.dcf_intrinsic_value);
  const price = num(company.price);
  const dcfUpside = dcfPerShare != null && price != null && price > 0 ? r2(((dcfPerShare - price) / price) * 100) : null;

  // Valuation label
  let valuationLabel = "";
  if (pe != null) {
    valuationLabel = pe < 15 ? "UNDERVALUED" : pe < 25 ? "FAIR" : pe < 40 ? "PREMIUM" : "OVERVALUED";
  }
  const isBanking = (sector ?? "").toLowerCase().includes("bank") || (sector ?? "").toLowerCase().includes("financial");
  const altmanZ = num(q.altman_z_score);
  const bankingOverride = isBanking && altmanZ == null;

  return {
    snapshot: {
      pe_ratio: pe,
      roe: num(prof.roe_latest),
      piotroski_f_score: num(q.piotroski_f_score),
      altman_z_score: altmanZ,
      dcf_upside_pct: dcfUpside,
      valuation_label: valuationLabel,
    },
    score: num(d.fundamental_score),
    as_of: String(d.computed_at ?? ""),
    banking_override: bankingOverride,
  };
}

function normalizeRisk(d: Record<string, unknown> | null) {
  if (!d) return null;
  const vol = (d.volatility ?? {}) as Record<string, unknown>;
  const mr  = (d.market_risk ?? {}) as Record<string, unknown>;
  const rar = (d.risk_adjusted_returns ?? {}) as Record<string, unknown>;
  const dd  = (d.drawdown ?? {}) as Record<string, unknown>;
  const var_ = (d.value_at_risk ?? {}) as Record<string, unknown>;
  const liq = (d.liquidity ?? {}) as Record<string, unknown>;

  return {
    snapshot: {
      beta: r2(mr.beta),
      volatility_1y: r2(vol.annualized_pct),
      sharpe_ratio: r2(rar.sharpe_ratio),
      sortino_ratio: r2(rar.sortino_ratio),
      max_drawdown: r2(dd.max_drawdown_pct),
      var_95: r2(var_.var_95_pct),
      liquidity_label: String(liq.classification ?? ""),
    },
    score: num(d.risk_score),
    as_of: String(d.computed_at ?? ""),
    benchmark_warning: d.benchmark_warning != null,
  };
}

function normalizeMomentum(d: Record<string, unknown> | null) {
  if (!d) return null;
  const ret = (d.returns ?? {}) as Record<string, unknown>;
  const rs  = (d.relative_strength ?? {}) as Record<string, unknown>;
  const ma  = (d.moving_averages ?? {}) as Record<string, unknown>;

  // Trend strength label from cross + pct above SMAs
  const cross = String(ma.cross_status ?? "");
  const pctAbove50 = num(ma.pct_above_sma_50);
  let trendStrength = "NEUTRAL";
  if (cross === "GOLDEN_CROSS") trendStrength = "STRONG_UP";
  else if (cross === "DEATH_CROSS") trendStrength = "STRONG_DOWN";
  else if (pctAbove50 != null && pctAbove50 > 5) trendStrength = "UP";
  else if (pctAbove50 != null && pctAbove50 < -5) trendStrength = "DOWN";

  return {
    snapshot: {
      relative_strength_vs_nifty: r2(rs["3m"]),
      trend_strength: trendStrength,
      volume_confirmation: "",
      momentum_label: String(d.classification ?? ""),
    },
    returns: {
      one_week:   r2(ret["1w"]),
      one_month:  r2(ret["1m"]),
      three_month: r2(ret["3m"]),
      one_year:   r2(ret["12m"]),
      vs_nifty_one_month:  r2(rs["1m"]),
      vs_nifty_three_month: r2(rs["3m"]),
    },
    score: num(d.momentum_score),
    as_of: String(d.as_of_date ?? ((d.metadata ?? {}) as Record<string, unknown>).computed_at ?? ""),
  };
}

function normalizeSentiment(d: Record<string, unknown> | null) {
  if (!d) return null;
  const top = ((d.top_articles ?? []) as Array<Record<string, unknown>>)[0];
  const counts = (d.counts ?? {}) as Record<string, Record<string, unknown>>;
  const c30 = (counts["30d"] ?? {}) as Record<string, unknown>;
  const classification = String(d.classification ?? "");
  const newsLimited = classification === "NO_NEWS" || classification === "SYMBOL_UNRECOGNIZED";
  return {
    snapshot: {
      news_sentiment_score: num(d.sentiment_score),
      sentiment_label: classification,
      article_count: num(c30.total) ?? 0,
      top_news_driver: top ? String(top.title ?? "") : "",
    },
    score: newsLimited ? null : num(d.sentiment_score),
    as_of: String(d.as_of_date ?? ((d.metadata ?? {}) as Record<string, unknown>).computed_at ?? ""),
    news_limited: newsLimited,
  };
}

// ─── Verdict logic ───
const WEIGHT_PRESETS: Record<QueryType, { technical: number; fundamental: number; risk: number; momentum: number; sentiment: number }> = {
  "intraday":    { technical: 0.45, fundamental: 0.00, risk: 0.20, momentum: 0.30, sentiment: 0.05 },
  "medium-term": { technical: 0.25, fundamental: 0.25, risk: 0.20, momentum: 0.20, sentiment: 0.10 },
  "long-term":   { technical: 0.15, fundamental: 0.40, risk: 0.20, momentum: 0.15, sentiment: 0.10 },
};

function actionFromScore(s: number): Action {
  if (s >= 75) return "BUY";
  if (s >= 60) return "HOLD";
  if (s >= 45) return "WATCHLIST";
  if (s >= 30) return "SELL";
  return "AVOID";
}
function demote(a: Action, steps = 1): Action {
  const order: Action[] = ["AVOID", "SELL", "WATCHLIST", "HOLD", "BUY"];
  const i = order.indexOf(a);
  return order[Math.max(0, i - steps)];
}
function riskLabel(s: number | null): string {
  if (s == null) return "UNKNOWN";
  if (s >= 70) return "LOW";
  if (s >= 45) return "MODERATE";
  if (s >= 25) return "HIGH";
  return "VERY_HIGH";
}
function timeHorizonLabel(q: QueryType): string {
  return q === "intraday" ? "1–5 days" : q === "long-term" ? "12+ months" : "1–6 months";
}

function computeVerdict(
  scores: { technical: number | null; fundamental: number | null; risk: number | null; momentum: number | null; sentiment: number | null },
  riskSnap: { max_drawdown: number | null; beta: number | null; volatility_1y: number | null } | null,
  queryType: QueryType,
) {
  const weights = WEIGHT_PRESETS[queryType];
  let weightedSum = 0, weightUsed = 0;
  let missingCount = 0;
  const guardrailNotes: string[] = [];
  (Object.keys(weights) as Array<keyof typeof weights>).forEach((k) => {
    const w = weights[k];
    const s = scores[k];
    if (w > 0 && s != null) { weightedSum += s * w; weightUsed += w; }
    else if (w > 0) missingCount += 1;
  });
  const overall = weightUsed > 0 ? Math.round(weightedSum / weightUsed) : 0;
  let action = actionFromScore(overall);
  let demotions = 0;
  let confidencePenalty = 0;

  // ─── Tier-aware guardrails ───
  // Universal: very weak risk caps BUY.
  if (scores.risk != null && scores.risk < 25 && action === "BUY") {
    action = "HOLD"; demotions++; guardrailNotes.push("risk<25 caps BUY→HOLD");
  }

  if (queryType === "intraday") {
    // Intraday: weak technicals/momentum matter heavily.
    if (scores.technical != null && scores.technical < 35 && (action === "BUY" || action === "HOLD")) {
      action = demote(action); demotions++; guardrailNotes.push("intraday weak technical demotes");
    }
    if (scores.momentum != null && scores.momentum < 35 && (action === "BUY" || action === "HOLD")) {
      action = demote(action); demotions++; guardrailNotes.push("intraday weak momentum demotes");
    }
    // High beta / volatility hits confidence hard intraday; minor demotion on extreme.
    if (riskSnap?.beta != null && riskSnap.beta > 1.5) confidencePenalty += 10;
    if (riskSnap?.volatility_1y != null && riskSnap.volatility_1y > 45) confidencePenalty += 10;
    if (riskSnap?.beta != null && riskSnap.beta > 2.0 && action === "BUY") {
      action = "HOLD"; demotions++; guardrailNotes.push("intraday beta>2 demotes BUY");
    }
    // Missing fundamentals must NOT cap action for intraday (weight is 0 anyway).
  } else if (queryType === "long-term") {
    // Long-term: missing fundamental is a hard cap.
    if (scores.fundamental == null && (action === "BUY" || action === "HOLD")) {
      action = "WATCHLIST"; demotions++; guardrailNotes.push("long-term missing fundamental caps→WATCHLIST");
    }
    // Weak fundamentals materially demote.
    if (scores.fundamental != null && scores.fundamental < 35 && (action === "BUY" || action === "HOLD")) {
      action = demote(action); demotions++; guardrailNotes.push("long-term weak fundamental demotes");
    }
    // Drawdown alone does NOT destroy quality setup; only demote if risk score is also weak.
    if (riskSnap?.max_drawdown != null && riskSnap.max_drawdown < -50 &&
        scores.risk != null && scores.risk < 45) {
      if (action === "BUY") { action = "HOLD"; demotions++; guardrailNotes.push("long-term drawdown+weak risk demotes"); }
    }
    if (riskSnap?.beta != null && riskSnap.beta > 2.0 && scores.risk != null && scores.risk < 50) {
      if (action === "BUY") { action = "HOLD"; demotions++; guardrailNotes.push("long-term high beta+weak risk demotes"); }
    }
  } else {
    // Medium-term: balanced baseline.
    if (riskSnap && ((riskSnap.max_drawdown != null && riskSnap.max_drawdown < -50) || (riskSnap.beta != null && riskSnap.beta > 2.0))) {
      if (action === "BUY")  { action = "HOLD"; demotions++; guardrailNotes.push("medium drawdown/beta demotes BUY"); }
      else if (action === "HOLD") { action = "WATCHLIST"; demotions++; guardrailNotes.push("medium drawdown/beta demotes HOLD"); }
    }
    if ((scores.technical == null || scores.fundamental == null) && (action === "BUY" || action === "HOLD")) {
      action = "WATCHLIST"; demotions++; guardrailNotes.push("medium missing tech/fund caps→WATCHLIST");
    }
  }

  // Universal: too many missing modules → AVOID.
  const totalModulesConsidered = (Object.values(weights).filter((w) => w > 0)).length;
  if (missingCount >= 3 || missingCount >= Math.ceil(totalModulesConsidered * 0.6)) {
    action = "AVOID"; demotions++; guardrailNotes.push("≥3 modules missing → AVOID");
  }

  const confidence = Math.max(20, Math.min(95, 100 - missingCount * 15 - demotions * 10 - confidencePenalty));
  return { action, overall_score: overall, confidence_pct: confidence, missingCount, demotions, guardrailNotes };
}

const TIER_REASON_PREFIX: Record<QueryType, string> = {
  "intraday":    "Short-term setup driven by technical and momentum conditions",
  "medium-term": "Balanced swing view using technical, fundamental, risk and momentum factors",
  "long-term":   "Long-horizon view prioritizing business quality, valuation support and risk profile",
};

function summaryReason(scores: Record<string, number | null>, queryType: QueryType): string {
  const labels: string[] = [];
  const order: Array<[string, string]> =
    queryType === "intraday"
      ? [["technical","Technicals"],["momentum","Momentum"],["risk","Risk"],["sentiment","Sentiment"]]
      : queryType === "long-term"
      ? [["fundamental","Fundamentals"],["risk","Risk"],["technical","Technicals"],["momentum","Momentum"],["sentiment","Sentiment"]]
      : [["technical","Technicals"],["fundamental","Fundamentals"],["risk","Risk"],["momentum","Momentum"],["sentiment","Sentiment"]];
  for (const [k, lbl] of order) {
    const v = scores[k];
    if (v == null) continue;
    const tag = v >= 70 ? "strong" : v >= 50 ? "moderate" : v >= 30 ? "weak" : "very weak";
    labels.push(`${tag} ${lbl.toLowerCase()} (${v})`);
  }
  const prefix = TIER_REASON_PREFIX[queryType];
  if (labels.length === 0) return `${prefix}. Insufficient data to generate a verdict.`;
  return `${prefix}. ${labels.join(", ")}.`;
}

// ─── Main handler ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as {
      symbol?: string; exchange?: string; query_type?: string;
      language?: string; user_context?: string; include_news?: boolean;
    };
    const rawSymbol = body.symbol?.trim();
    if (!rawSymbol) return json({ success: false, error: "SYMBOL_REQUIRED" }, 400);

    const qtRaw = (body.query_type ?? "medium-term").toLowerCase();
    const queryType: QueryType = (qtRaw === "intraday" || qtRaw === "long-term") ? qtRaw : "medium-term";
    const language = body.language ?? "en";
    const includeNews = body.include_news !== false;
    const auth = req.headers.get("authorization");

    // 1. Resolve stock
    const stock = await resolveStock(rawSymbol);
    if (!stock) return json({ success: false, error: "SYMBOL_NOT_FOUND", symbol: rawSymbol });

    const sym = stock.symbol;
    const { sector, industry } = await fetchSectorIndustry(sym, auth);

    // 2. Fan-out to all modules in parallel
    const moduleCalls: Promise<{ trace: ModuleTrace; data: Record<string, unknown> | null }>[] = [
      callModule("compute-technicals",   { symbol: sym }, auth),
      callModule("compute-fundamentals", { symbol: sym }, auth),
      callModule("compute-risk",         { symbol: sym, sector }, auth),
      callModule("compute-momentum",     { symbol: sym, sector }, auth),
      includeNews
        ? callModule("compute-sentiment", { symbol: sym }, auth)
        : Promise.resolve({
            trace: { module: "compute-sentiment", ok: false, http_status: null, latency_ms: 0, error: "SKIPPED_BY_REQUEST", code: "SKIPPED" } as ModuleTrace,
            data: null,
          }),
      TRADE_PLAN_SOURCE === "new"
        ? callModule("compute-trade-plan", { symbol: sym, query_type: queryType }, auth)
        : Promise.resolve({
            trace: { module: "compute-trade-plan", ok: false, http_status: null, latency_ms: 0, error: "SKIPPED_FLAG_LEGACY", code: "SKIPPED" } as ModuleTrace,
            data: null,
          }),
    ];
    const settled = await Promise.all(moduleCalls);
    const [tRes, fRes, rRes, mRes, sRes, tpRes] = settled;

    // 3. Normalize
    const tech = normalizeTechnical(tRes.data);
    const fund = normalizeFundamental(fRes.data, sector);
    const risk = normalizeRisk(rRes.data);
    const mom  = normalizeMomentum(mRes.data);
    const sent = normalizeSentiment(sRes.data);

    if (tech?.derived_levels) tRes.trace.derived = "levels:orchestrator";

    // 4. Compute verdict
    const scores = {
      technical:   tech?.score ?? null,
      fundamental: fund?.score ?? null,
      risk:        risk?.score ?? null,
      momentum:    mom?.score ?? null,
      sentiment:   sent?.score ?? null,
    };
    const verdict = computeVerdict(scores, risk?.snapshot ?? null, queryType);

    // 5. Flags
    const flags = {
      banking_override_applied: fund?.banking_override ?? false,
      benchmark_fallback_used: risk?.benchmark_warning ?? false,
      news_data_limited: !includeNews || (sent?.news_limited ?? sent == null),
      incomplete_data: verdict.missingCount >= 2,
    };

    // 6. Assemble payload
    const asOfDate = tech?.as_of || fund?.as_of || risk?.as_of || mom?.as_of || sent?.as_of || new Date().toISOString();
    const sourceTrace: ModuleTrace[] = settled.map((s) => s.trace);

    const payload = {
      success: true,
      as_of_date: asOfDate,
      stock: {
        symbol: sym,
        company_name: stock.company_name ?? "",
        sector: sector ?? "",
        industry: industry ?? "",
        exchange: stock.exchange,
      },
      query_context: { query_type: queryType, language, include_news: includeNews },
      final_verdict: {
        action: verdict.action,
        confidence_pct: verdict.confidence_pct,
        overall_score: verdict.overall_score,
        risk_label: riskLabel(scores.risk),
        time_horizon: timeHorizonLabel(queryType),
        summary_reason: summaryReason(scores, queryType),
      },
      score_breakdown: {
        technical_score:   scores.technical   ?? 0,
        fundamental_score: scores.fundamental ?? 0,
        risk_score:        scores.risk        ?? 0,
        momentum_score:    scores.momentum    ?? 0,
        sentiment_score:   scores.sentiment   ?? 0,
      },
      price_context: tech?.price ?? { current_price: null, price_source: "", as_of: "" },
      levels: tech?.levels ?? {
        entry_zone: null, stop_loss: null, target_1: null, target_2: null,
        support_1: null, support_2: null, resistance_1: null, resistance_2: null,
      },
      returns_snapshot: mom?.returns ?? {
        one_week: null, one_month: null, three_month: null, one_year: null,
        vs_nifty_one_month: null, vs_nifty_three_month: null,
      },
      technical_snapshot: tech?.snapshot ?? {
        rsi: null, macd_signal: "", trend_label: "", ema_stack: "", adx: null, bollinger_position: "", vwap_signal: "",
      },
      fundamental_snapshot: fund?.snapshot ?? {
        pe_ratio: null, roe: null, piotroski_f_score: null, altman_z_score: null, dcf_upside_pct: null, valuation_label: "",
      },
      risk_snapshot: risk?.snapshot ?? {
        beta: null, volatility_1y: null, sharpe_ratio: null, sortino_ratio: null, max_drawdown: null, var_95: null, liquidity_label: "",
      },
      momentum_snapshot: mom?.snapshot ?? {
        relative_strength_vs_nifty: null, trend_strength: "", volume_confirmation: "", momentum_label: "",
      },
      sentiment_snapshot: sent?.snapshot ?? {
        news_sentiment_score: null, sentiment_label: "", article_count: 0, top_news_driver: "",
      },
      flags,
      report_modules: {
        show_score_ring: true,
        show_score_breakdown: true,
        show_returns_strip: mom != null,
        show_news_widget: includeNews && !flags.news_data_limited,
        show_stocks_in_focus: false,
      },
      audit_meta: {
        formula_version: FORMULA_VERSION,
        verdict_model_version: VERDICT_MODEL_VERSION,
        tier_applied: queryType,
        tier_weights: WEIGHT_PRESETS[queryType],
        tier_guardrails: verdict.guardrailNotes,
        technical_as_of:   tech?.as_of ?? null,
        fundamental_as_of: fund?.as_of ?? null,
        risk_as_of:        risk?.as_of ?? null,
        momentum_as_of:    mom?.as_of  ?? null,
        sentiment_as_of:   sent?.as_of ?? null,
        source_trace: sourceTrace,
      },
      user_context: body.user_context ?? null,
    };

    return json(payload);
  } catch (e) {
    console.error("generate-stock-analysis:", e);
    return json({ success: false, error: "INTERNAL_ERROR", details: String(e) }, 500);
  }
});
