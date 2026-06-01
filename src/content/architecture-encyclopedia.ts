// Stockera Architecture & Brain Encyclopedia — content source of truth.
// Pure data; the printable component is purely presentational.

export interface ApiRow {
  name: string;
  role: string;
  rate_limit: string;
  cost: string;
  used_for: string;
  failure_mode: string;
}

export const API_ROWS: ApiRow[] = [
  {
    name: "FinEdge",
    role: "Primary EOD equity OHLCV, fundamentals, ratios, corporate actions, peers, shareholding history.",
    rate_limit: "Soft: 60 rpm / endpoint. Daily: ~50k calls.",
    cost: "Paid subscription (annual).",
    used_for: "compute-technicals, compute-fundamentals, compute-long-term-quality, compute-trade-plan (sector fallback), corporate-actions module.",
    failure_mode: "Module degrades to INSUFFICIENT_DATA; orchestrator flags benchmark_fallback_used and records source_trace error.",
  },
  {
    name: "Dhan",
    role: "Live LTP, intraday VWAP, IDX_I index historicals, sector indices, 1-minute bars for intraday tier.",
    rate_limit: "Free tier: 100 rpm. Paid: 1000 rpm.",
    cost: "Free baseline; paid upgrade earmarked.",
    used_for: "compute-intraday-microstructure (ATR, opening-range, VWAP, session H/L), refresh-ltp cron.",
    failure_mode: "Snapshot fields fall to null with diagnostic null_reasons; data_freshness flips to 'stale'.",
  },
  {
    name: "Marketaux",
    role: "Indian-market news headlines + per-article sentiment.",
    rate_limit: "Basic tier — 2,500 calls/day, 20 articles/call.",
    cost: "USD 18 / month (Basic).",
    used_for: "compute-sentiment, intraday_news_catalysts, news widget.",
    failure_mode: "news_data_limited flag raised; sentiment_score returns null; report retains all other sections.",
  },
  {
    name: "Supabase",
    role: "Postgres + Edge Functions + Storage + cron (pg_cron) + secrets vault.",
    rate_limit: "Project-tier limits; service-role bypasses RLS for internal modules.",
    cost: "Pro plan.",
    used_for: "All Brain modules, orchestrator, PDF cache, sector_aggregates, audit log.",
    failure_mode: "Server function returns 5xx → orchestrator records source_trace failure; UI shows degraded card.",
  },
  {
    name: "Browserless (Chrome)",
    role: "Headless Chromium for PDF rendering.",
    rate_limit: "Plan ceiling: 1,000 PDFs/month; warn at 800.",
    cost: "Hobby plan.",
    used_for: "Stock report PDF + Architecture Encyclopedia PDF.",
    failure_mode: "Errors surface to user with retry prompt; logged in pdf_generation_log.",
  },
  {
    name: "Claude Haiku 4.5",
    role: "Optional narrative-only layer for human-readable prose.",
    rate_limit: "Anthropic plan limits.",
    cost: "Pay-per-token; currently restricted.",
    used_for: "Reserved for future narrative summarization; OFF in production today.",
    failure_mode: "N/A — not wired into the verdict path.",
  },
  {
    name: "Gemini 2.0 Flash",
    role: "Optional intent classifier for free-form queries.",
    rate_limit: "Google AI plan limits.",
    cost: "Free tier on Gemini Flash.",
    used_for: "Reserved for query-type detection; restricted today.",
    failure_mode: "N/A — heuristic classifier covers production.",
  },
];

export interface TableRow {
  table: string;
  role: string;
}

export const SCHEMA_ROWS: TableRow[] = [
  { table: "stock_master", role: "Universe of 22,649 listed Indian equities + 8 indices (NIFTY, BANKNIFTY, etc.). Cached symbol→sector mapping." },
  { table: "benchmark_cache", role: "Nightly-cached benchmark returns (NIFTY 50, sector indices) used by compute-risk + compute-momentum." },
  { table: "risk_compute_meta", role: "Per-symbol provenance: window length, vol method, drawdown method, beta source — for audit defensibility." },
  { table: "sentiment_cache", role: "Marketaux article cache keyed by (symbol, day) — protects the 2.5k/day budget." },
  { table: "marketaux_usage_log", role: "Tally of Marketaux calls per day for budget monitoring." },
  { table: "sector_aggregates", role: "Per-sector median valuation/return benchmarks. Seeded nightly at 03:00 IST by seed-sector-aggregates; bootstrap fallback for cold starts." },
  { table: "pdf_generation_log", role: "Cache key, success flag, cache_hit flag, duration, error, user — drives the PDF cache + Browserless quota warnings." },
];

export interface ModuleSpec {
  fn: string;
  purpose: string;
  inputs: string;
  outputs: string;
  formulas: string[];
  failure: string;
  tiers: string;
  references: string;
}

export const MODULES: ModuleSpec[] = [
  {
    fn: "compute-technicals",
    purpose: "Daily price-action snapshot: trend, momentum oscillators, mean-reversion, structure.",
    inputs: "FinEdge daily OHLCV (252-day window), benchmark_cache (NIFTY).",
    outputs: "RSI(14), MACD signal, EMA stack (20/50/200), ADX(14), Bollinger %B, VWAP signal, trend_label.",
    formulas: [
      "RSI = 100 − 100 / (1 + RS), RS = avg gain / avg loss over 14 sessions (Wilder).",
      "MACD = EMA(12) − EMA(26); signal = EMA(9) of MACD; cross direction = bullish/bearish.",
      "ADX = 100 × EMA(|+DI − −DI| / (+DI + −DI), 14) — Wilder.",
      "Bollinger position = (price − lower) / (upper − lower); bands = SMA(20) ± 2σ.",
    ],
    failure: "If <50 sessions of data → INSUFFICIENT_HISTORY; module emits nulls with diagnostic.",
    tiers: "All tiers (weight varies).",
    references: "Wilder (1978), Murphy — Technical Analysis of Financial Markets, CFA L1 — Technical Analysis.",
  },
  {
    fn: "compute-fundamentals",
    purpose: "Quality + valuation snapshot.",
    inputs: "FinEdge fundamentals + ratios endpoints; sector_aggregates for relative valuation.",
    outputs: "PE, ROE, Piotroski F-Score, Altman Z-Score, DCF upside %, valuation_label.",
    formulas: [
      "Piotroski F = sum of 9 binary tests (profitability 4, leverage/liquidity 3, operating efficiency 2). Score 0–9.",
      "Altman Z = 1.2·A + 1.4·B + 3.3·C + 0.6·D + 1.0·E (A=WC/TA, B=RE/TA, C=EBIT/TA, D=MktEq/Liab, E=Sales/TA).",
      "DCF upside = (intrinsic − price) / price; intrinsic = Σ FCF_t / (1+r)^t + TV/(1+r)^n, clamped [−50%, +200%].",
    ],
    failure: "Banks → banking_override_applied; Altman + DCF suppressed by design. Newly-listed → INSUFFICIENT_HISTORY.",
    tiers: "Medium-term (light), Long-term (full); Intraday weight = 0.",
    references: "Piotroski (2000), Altman (1968), Damodaran — Investment Valuation.",
  },
  {
    fn: "compute-risk",
    purpose: "Volatility, downside, market-risk, liquidity.",
    inputs: "FinEdge daily returns (252d), NIFTY returns, Dhan turnover.",
    outputs: "Beta, σ(1y), Sharpe, Sortino, max drawdown, VaR(95), liquidity_label.",
    formulas: [
      "Beta = Cov(R_stock, R_NIFTY) / Var(R_NIFTY).",
      "Sharpe = (μ − r_f) / σ;  Sortino = (μ − r_f) / σ_downside (downside = returns below MAR).",
      "Max DD = min over t of (P_t / max_{s≤t} P_s − 1).",
      "VaR(95) = −Φ⁻¹(0.05) × σ × √h (parametric Gaussian; h = horizon in days).",
    ],
    failure: "Sparse history → wider window or null with diagnostic; turnover < ₹2cr/day → liquidity_label = ILLIQUID.",
    tiers: "All tiers; weight constant across tiers (0.20).",
    references: "Sharpe (1966), Sortino & Price (1994), Jorion — Value at Risk, Hull — Options Futures & Other Derivatives.",
  },
  {
    fn: "compute-momentum",
    purpose: "Cross-sectional relative strength and trend persistence.",
    inputs: "Stock returns vs NIFTY, volume series.",
    outputs: "RS_vs_NIFTY (3M), trend_strength, volume_confirmation enum, momentum_label.",
    formulas: [
      "RS = (1 + r_stock_3M) / (1 + r_NIFTY_3M) − 1.",
      "Trend strength = ADX bucket × consecutive higher highs.",
      "Volume confirmation = ratio of last-20d avg volume vs trailing 60d on up-days (Jegadeesh-Titman style).",
    ],
    failure: "Volume series missing → volume_confirmation = 'NEUTRAL' (never empty string).",
    tiers: "Intraday weight 0.30, Medium 0.20, Long 0.15.",
    references: "Jegadeesh & Titman (1993), Asness — Quality Minus Junk, CFA L2 Quant Methods.",
  },
  {
    fn: "compute-sentiment",
    purpose: "News-flow tone and catalyst surfacing.",
    inputs: "Marketaux articles for symbol (capped 20/call, deduped, 24h window).",
    outputs: "news_sentiment_score [−1, +1], sentiment_label, article_count, top_news_driver.",
    formulas: [
      "Score = mean(per-article sentiment) weighted by source reliability.",
      "Label thresholds: ≥ +0.3 POSITIVE, ≤ −0.3 NEGATIVE, else NEUTRAL.",
    ],
    failure: "0 articles → label = NO_NEWS, news_data_limited flag raised.",
    tiers: "Intraday 0.05, Medium 0.10, Long 0.10.",
    references: "Tetlock (2007) — Giving Content to Investor Sentiment; CFA Behavioral Finance.",
  },
  {
    fn: "compute-trade-plan",
    purpose: "Entry zone, stop loss, two targets — with tier-specific math and a validation engine.",
    inputs: "Spot, ATR(14), DMA-200, 1Y vol, sector_aggregates, DCF status.",
    outputs: "entry_zone, stop_loss, target_1, target_2, support_1/2, resistance_1/2 + targets_meta audit.",
    formulas: [
      "Intraday SL: spot − 1.0 × ATR(14)  (floor 0.5×ATR, ceiling 1.5×ATR).",
      "Medium SL: max(spot − 1.5 × ATR, swing-low). Reject if distance < 0.5 × ATR.",
      "Long-term adaptive SL: midpoint of vol-scaled distance, anchored at 92% × DMA-200, with FLOOR 10% and CEILING 20% from spot.",
      "Validation: S < spot, R > spot, R ≠ T, R:R(T1) ≥ 1.5, R:R(T2) ≥ 2.0.",
      "Long-term target fallback ladder: (1) DCF if dcf_status='ok'; (2) sector multiple × forward EPS; (3) historical 5y PE × EPS; (4) vol-band projection (spot × (1 + k·σ·√t)).",
    ],
    failure: "Any level failing validation is set to null with reason recorded in audit_meta.trade_plan_validation. Banks bypass DCF (banking_override).",
    tiers: "All tiers; SL math switches on tier.",
    references: "Wilder ATR (1978), Chande — New Technical Trader, internal Stockera engine spec v1.",
  },
  {
    fn: "compute-intraday-microstructure",
    purpose: "Intraday-only fast-money signals.",
    inputs: "Dhan 1-min bars, opening-range window, sector index intraday.",
    outputs: "ATR(14), realized vol, opening-range H/L, VWAP, gap_behavior, sector_rs_today, session H/L, volume profile.",
    formulas: [
      "Opening range = [H, L] of first 15 minutes (09:15–09:30 IST).",
      "VWAP_t = Σ (price_i · vol_i) / Σ vol_i over session.",
      "Gap classification: |open − prev_close| / prev_close vs 0.5σ threshold; gap-filled if intraday touches prev_close.",
    ],
    failure: "Post-market: data_freshness = 'post_market', signals computed on final tape.",
    tiers: "Intraday ONLY.",
    references: "O'Hara — Market Microstructure Theory; Hasbrouck — Empirical Market Microstructure.",
  },
  {
    fn: "compute-long-term-quality",
    purpose: "Multi-year quality signals for long-term tier.",
    inputs: "FinEdge 5y financials, shareholding history, sector_aggregates.",
    outputs: "ROE_5y, ROCE_5y, D/E, FCF yield, EPS CAGR 5y, earnings_consistency, promoter_holding, quality_label, margin/market-share trend.",
    formulas: [
      "ROE_5y = mean(NetIncome_t / Equity_t) over 5 years.",
      "ROCE_5y = mean(EBIT_t / (Debt_t + Equity_t)).",
      "FCF yield = TTM FCF / Market Cap.",
      "Earnings consistency = stddev(EPS YoY growth) bucketed VERY_HIGH→VERY_LOW.",
    ],
    failure: "Banks → quality_label = BANKING_ADJUSTED; EPS CAGR + Piotroski suppressed (capital structure non-standard); ROE/ROCE/DE retained; if INSUFFICIENT_HISTORY, fall back to FinEdge /ratios endpoint directly.",
    tiers: "Long-term ONLY.",
    references: "Asness, Frazzini, Pedersen — Quality Minus Junk (2019); Greenblatt — The Little Book That Beats the Market.",
  },
];

export interface TierComposition {
  tier: string;
  horizon: string;
  shows: string[];
  excludes: string[];
}

export const TIER_COMPOSITION: TierComposition[] = [
  {
    tier: "Intraday",
    horizon: "≤ 1 day",
    shows: [
      "Trend & Levels (technicals filtered for intraday)",
      "Intraday Microstructure (ATR, VWAP, opening range, gap, session H/L, sector RS today, volume profile)",
      "Risk Profile (short-term)",
      "Today's Catalysts (sentiment filtered to today only)",
    ],
    excludes: [
      "Piotroski F-Score, Altman Z, DCF",
      "5-year returns, ROE / Debt ratios",
      "Long-term P/E vs sector",
    ],
  },
  {
    tier: "Medium-term",
    horizon: "1 week – 3 months",
    shows: [
      "Trend & Structure (weekly RSI, EMA stack, ADX, 1M/3M returns)",
      "Momentum & Relative Strength (RS vs NIFTY, trend strength, regime, volume_confirmation enum)",
      "Light Fundamentals (PE, ROE, F-Score, valuation label, DCF if valid)",
      "Catalyst Calendar & Sentiment (news catalysts; earnings calendar — Coming Soon; FinEdge corporate actions when available)",
    ],
    excludes: [
      "Intraday microstructure (ATR-based intraday levels, VWAP)",
      "Deep multi-year fundamentals",
    ],
  },
  {
    tier: "Long-term",
    horizon: "6 months+",
    shows: [
      "Business Quality (ROE 5y, ROCE 5y, D/E, FCF yield, EPS CAGR, quality_label, moat indicators)",
      "Valuation & Fair Value (PE vs 5y median, sector-multiple fair value, DCF if valid)",
      "Risk Profile (long-term vol, max drawdown, beta, Sharpe, liquidity)",
      "Long-Term Returns (1Y / 3Y / 5Y + vs NIFTY)",
    ],
    excludes: [
      "Intraday microstructure",
      "VWAP, daily MACD",
      "Opening range, gap behavior",
    ],
  },
];

export const AUDIT_FIELDS: { field: string; meaning: string }[] = [
  { field: "weighting_profile_id", meaning: "Which frozen weight set (intraday_v1 / medium_v1 / long_v1) produced the score." },
  { field: "action_bucket_version", meaning: "Bucket version id (currently bucket_v1)." },
  { field: "action_bucket_thresholds", meaning: "Inclusive lower bounds: BUY 75, HOLD 60, WATCHLIST 45, SELL 30." },
  { field: "dcf_status / dcf_method_used", meaning: "ok | degenerate | suppressed; which DCF variant was used (two-stage / perpetuity / fallback)." },
  { field: "banking_override_applied / banking_override_reason", meaning: "True for banks; suppresses Altman + DCF + EPS-CAGR + Piotroski with stated reason." },
  { field: "volume_confirmation / method / reason", meaning: "Volume regime + how it was derived; never empty string (NEUTRAL fallback)." },
  { field: "targets_meta", meaning: "Full fallback ladder per target with method, reason, inputs, attempts[], guardrails." },
  { field: "sector_aggregate_source", meaning: "computed | bootstrap | default_fallback | missing." },
  { field: "sl_method", meaning: "vol_adaptive | dma200_anchor | max_distance_cap | min_distance_floor." },
  { field: "regression_baseline / regression_drift", meaning: "Frozen baseline verdicts for 4 reference symbols + live drift vs that baseline." },
  { field: "modules_invoked", meaning: "Ordered list of every Edge Function called for this report." },
  { field: "tier_modules_added_version", meaning: "Version stamp for tier-specific module additions." },
  { field: "source_trace[]", meaning: "Per-module ok flag, http_status, latency_ms, error, derived label." },
];

export const LIVE_TODAY: string[] = [
  "5 core Brain modules (technicals, fundamentals, risk, momentum, sentiment)",
  "3 tier-specific modules (trade-plan, intraday-microstructure, long-term-quality)",
  "Orchestrator with tier-aware frozen weights",
  "Frozen action buckets (bucket_v1)",
  "Composite Score binding (corrected)",
  "Confidence Engine (alignment, strength, stability, data quality, coverage)",
  "Trade Plan with adaptive SL + 4-step target fallback ladder",
  "Tier-shaped report grid (intraday / medium / long)",
  "Methodology tooltips on every metric",
  "Server-side Browserless PDF export pipeline with cache",
  "Audit trail (audit_meta) with regression baseline scaffolding",
  "sector_aggregates with nightly cron + bootstrap fallback",
  "Banking-adjusted long-term quality path",
];

export const ROADMAP: string[] = [
  "Capture 4 regression baselines on next prod hit (RELIANCE, TCS, HDFCBANK, ICICIBANK)",
  "compute-fundamentals: emit explicit DCF status flags",
  "compute-momentum: compute volume_signal directly (deprecate derivation)",
  "Earnings & corporate-event calendar integration",
  "Peers in the Same Sector module",
  "Options-chain signals (PCR, max-pain, OI build-up)",
  "Sector rotation module (cross-sector RS heatmap)",
  "Backtest harness (walk-forward verdict accuracy)",
  "FII / DII flow integration",
  "Multi-language Indian retail support (Hinglish, Hindi, Tamil)",
  "Earnings-call transcript analyzer",
  "Daily morning brief (email + WhatsApp)",
  "Programmatic SEO with 90k pages",
  "Public stock detail pages (SEO-friendly)",
  "News-impact knowledge graph engine",
  "Educational tooltip layer (Piotroski, Altman, DCF deep-dives)",
];

export const GLOSSARY: { term: string; defn: string }[] = [
  { term: "RSI", defn: "Relative Strength Index — 14-period momentum oscillator (Wilder). >70 overbought, <30 oversold." },
  { term: "MACD", defn: "Moving-average convergence-divergence: EMA(12) − EMA(26), signal = EMA(9) of MACD." },
  { term: "EMA", defn: "Exponential moving average — gives recent prices more weight than SMA." },
  { term: "ADX", defn: "Average Directional Index — trend strength only, direction-agnostic. >25 = trending." },
  { term: "Bollinger Bands", defn: "Volatility envelope: SMA(20) ± 2 standard deviations." },
  { term: "ATR", defn: "Average True Range — Wilder volatility measure used for stop placement." },
  { term: "VWAP", defn: "Volume-Weighted Average Price — intraday benchmark used by institutions." },
  { term: "Piotroski F-Score", defn: "9-point fundamental quality test (0 = weak, 9 = excellent)." },
  { term: "Altman Z-Score", defn: "Bankruptcy-risk index from 5 ratios. >3 safe, <1.8 distressed. Not applied to banks." },
  { term: "DCF", defn: "Discounted Cash Flow — present value of future free cash flows discounted at cost of capital." },
  { term: "Sharpe", defn: "Risk-adjusted return: (μ − r_f) / σ." },
  { term: "Sortino", defn: "Like Sharpe but uses downside deviation only." },
  { term: "Beta", defn: "Sensitivity of stock returns to market returns (NIFTY proxy)." },
  { term: "Max Drawdown", defn: "Worst peak-to-trough loss in the lookback window." },
  { term: "VaR(95)", defn: "Worst expected loss at 95% confidence over a stated horizon." },
  { term: "Relative Strength", defn: "Stock return divided by benchmark return — direct outperformance metric." },
  { term: "Volume Confirmation", defn: "Whether up-day volume exceeds the trailing volume baseline (Jegadeesh-Titman)." },
  { term: "Earnings Consistency", defn: "Bucketed standard deviation of YoY EPS growth." },
  { term: "Promoter Holding", defn: "Percentage of shares held by promoters; skin-in-the-game signal." },
];

export const WORKED_EXAMPLES = [
  {
    symbol: "RELIANCE",
    tier: "Intraday",
    spot: "₹1,420",
    sl: "₹1,403 (spot − 1.0 × ATR; ATR ≈ ₹17)",
    t1: "₹1,447 (R:R 1.6)",
    t2: "₹1,464 (R:R 2.6)",
    note: "Pure ATR-driven; no DCF involvement.",
  },
  {
    symbol: "TCS",
    tier: "Long-term",
    spot: "₹3,920",
    sl: "₹3,489 (vol-adaptive; capped at 11% — floor of long-term band)",
    t1: "₹4,705 (DCF intrinsic, dcf_status = ok)",
    t2: "₹5,096 (1.3 × DCF, vol-band check passed)",
    note: "DCF preferred — fallback ladder never invoked.",
  },
  {
    symbol: "HDFCBANK",
    tier: "Long-term",
    spot: "₹1,720",
    sl: "₹1,548 (10% floor — adaptive SL capped at floor; DMA-200 anchor far below)",
    t1: "₹2,012 (sector multiple × forward EPS — DCF skipped, banking_override)",
    t2: "₹2,184 (historical 5y PE × forward EPS)",
    note: "banking_override_applied = true. DCF suppressed by design.",
  },
  {
    symbol: "ICICIBANK",
    tier: "Long-term",
    spot: "₹1,295",
    sl: "₹1,165 (10% floor)",
    t1: "₹1,510 (sector multiple — DCF skipped)",
    t2: "₹1,612 (historical PE × EPS)",
    note: "Same fallback ladder as HDFCBANK; both targets sourced from sector + historical PE.",
  },
];
