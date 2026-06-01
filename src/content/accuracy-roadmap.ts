// Stockera Accuracy Roadmap — content module.
// Frozen prose + tables for the printable doc. No live data, no fabricated numbers.

export const ACCURACY_CEILING_ROWS: { tier: string; institutional: string; stockera_ceiling: string }[] = [
  { tier: "Intraday (liquid equities)", institutional: "53–58% directional", stockera_ceiling: "55–60% (post-validation hypothesis)" },
  { tier: "Swing / medium-term (1–4 wk)", institutional: "55–63% directional", stockera_ceiling: "58–65% (post-validation hypothesis)" },
  { tier: "Long-horizon high-conviction", institutional: "up to 70% directional", stockera_ceiling: "60–70% directional + 1–2% alpha vs NIFTY annualised, after costs" },
];

export const LADDER_STEPS: {
  step: string;
  title: string;
  rationale: string;
  lift: string;
  cost: "Low" | "Medium" | "High" | "Higher";
  priority: "P0" | "P1" | "P2" | "P3";
}[] = [
  {
    step: "Floor",
    title: "Stockera today",
    rationale: "Brain modules complete, audit trail frozen, banking override + adaptive SL in production. No backtest evidence yet.",
    lift: "~50–55% directional expected (hypothesis, untested)",
    cost: "Low",
    priority: "P0",
  },
  {
    step: "01",
    title: "Backtest harness MVP",
    rationale: "Deterministic, no-lookahead 5-year backtest on top 200 NSE liquid stocks. Computes tier-wise hit rate, alpha, drawdown, calibration.",
    lift: "Enables truth; no claim publishable without it",
    cost: "High",
    priority: "P0",
  },
  {
    step: "02",
    title: "Sector rotation awareness",
    rationale: "Add sector momentum + sector dispersion signal. Most useful for medium- and long-term tiers.",
    lift: "+2–3% directional (hypothesis)",
    cost: "Medium",
    priority: "P0",
  },
  {
    step: "03",
    title: "Volume & order-flow proxies",
    rationale: "Strengthen volume_confirmation; add delivery % where exchange data permits.",
    lift: "+1–2% intraday & swing (hypothesis)",
    cost: "Medium",
    priority: "P1",
  },
  {
    step: "04",
    title: "Earnings calendar & catalysts",
    rationale: "Suppress high-conviction calls inside event windows unless explicitly catalyst-aware.",
    lift: "+2% medium-term (hypothesis)",
    cost: "Medium",
    priority: "P1",
  },
  {
    step: "05",
    title: "Options chain signals",
    rationale: "PCR, max-pain, OI shifts as supplementary intraday/medium-term signals.",
    lift: "+1–1.5% intraday, +1% medium-term (hypothesis)",
    cost: "Medium",
    priority: "P1",
  },
  {
    step: "06",
    title: "FII / DII flow ingestion",
    rationale: "Daily institutional flow as a regime/positioning overlay.",
    lift: "+1% medium- & long-term (hypothesis)",
    cost: "Low",
    priority: "P2",
  },
  {
    step: "07",
    title: "Earnings-call transcript analyser",
    rationale: "CFO/CEO tone scoring fused into the long-term quality snapshot.",
    lift: "+1% long-term, +0.5% medium-term (hypothesis)",
    cost: "Medium",
    priority: "P2",
  },
  {
    step: "08",
    title: "News-impact knowledge graph",
    rationale: "Maps news entities to most-impacted symbols on event days.",
    lift: "+1% on event days (hypothesis)",
    cost: "Medium",
    priority: "P2",
  },
  {
    step: "09",
    title: "Light ML calibration layer",
    rationale: "XGBoost / LightGBM trained on engineered Brain features for calibration, not magic.",
    lift: "+1–2% net after honest validation (hypothesis)",
    cost: "Medium",
    priority: "P2",
  },
  {
    step: "10",
    title: "Regime-aware walk-forward",
    rationale: "Per-regime retraining (bull / sideways / bear). The line that separates retail tools from institutional ones.",
    lift: "Calibration leap; raw accuracy stable",
    cost: "Higher",
    priority: "P3",
  },
];

export const CONFIDENCE_BANDS: {
  band: string;
  range: string;
  patterns: string[];
  visual: string;
}[] = [
  {
    band: "High conviction",
    range: "Confidence ≥ 80",
    patterns: [
      "Strong setup based on multiple aligned signals.",
      "High-quality opportunity worth a closer look.",
    ],
    visual: "Full ring colour, strong tone tag.",
  },
  {
    band: "Moderate conviction",
    range: "Confidence 60–79",
    patterns: [
      "Reasonable setup with mixed but improving signals.",
      "Worth tracking with discipline.",
    ],
    visual: "Moderate ring colour, balanced tone.",
  },
  {
    band: "Cautious conviction",
    range: "Confidence 40–59",
    patterns: [
      "Mixed signals; act with discipline rather than urgency.",
      "Tactical view only — not a long-horizon thesis.",
    ],
    visual: "Amber ring colour.",
  },
  {
    band: "Low conviction",
    range: "Confidence < 40",
    patterns: [
      "Signals do not align; better to wait.",
      "Insufficient evidence to support a confident view.",
    ],
    visual: "Muted ring, cautious tone.",
  },
];

export const FORBIDDEN_WORDS = ["guaranteed", "sure shot", "predict", "forecast"];

export const BACKTEST_TABLES: { table: string; columns: string }[] = [
  { table: "backtest_runs", columns: "run_id · start_date · end_date · universe · parameters · brain_version · weighting_profile_id · bucket_version · created_at" },
  { table: "backtest_signals", columns: "run_id · symbol · tier · signal_date · verdict · confidence · composite_score · audit_meta_snapshot" },
  { table: "backtest_outcomes", columns: "run_id · symbol · tier · signal_date · outcome_horizon · realized_return · benchmark_return · hit_or_miss · regime_label" },
];

export const BACKTEST_METRICS = [
  "Directional accuracy (overall + per tier)",
  "Hit rate per confidence band (calibration curve)",
  "Alpha vs NIFTY, annualised, after assumed costs",
  "Strategy max drawdown",
  "Regime-segmented accuracy (bull / sideways / bear)",
  "Sample size, time window, tier, and version stamped on every metric",
];

export const PLEDGE_LINES = [
  "Stockera measures everything it claims.",
  "Stockera publishes calibration, not just accuracy.",
  "Stockera never markets fixed accuracy numbers without backtest evidence.",
  "Stockera reports tier-wise and regime-wise accuracy.",
  "Stockera keeps confidence honest, not theatrical.",
  "Stockera's edge is discipline, not noise.",
];

export const CURRENT_BRAIN_MODULES = [
  "compute-technicals",
  "compute-fundamentals",
  "compute-risk",
  "compute-momentum",
  "compute-sentiment",
  "compute-trade-plan",
  "compute-intraday-microstructure",
  "compute-long-term-quality",
];

export const CURRENT_DISCIPLINE = [
  "Weighting profiles + bucket version frozen and externalised",
  "Banking override (Altman Z / DCF suppression with audit reason)",
  "Sector fallback ladder with default_fallback chip",
  "Adaptive long-term stop-loss",
  "Validation guardrails on every Brain module",
  "Composite-panel binding fix (no drift between header and detail)",
  "Real confidence engine wired into the tier-shaped grid",
];

export const KNOWN_LIMITATIONS = [
  "DCF still degrades for many stocks (status surfaced in audit_meta)",
  "Earnings / event calendar not yet wired",
  "Options chain not yet ingested",
  "FII / DII flow not yet ingested",
  "No backtest harness yet — no live accuracy measurement",
  "Multi-language inference deferred",
  "News-impact graph still partial",
  "Mid- and small-cap coverage is shallow",
];
