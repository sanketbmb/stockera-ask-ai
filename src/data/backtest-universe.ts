/**
 * Phase 4E — Backtest universe (MVP).
 *
 * 50 deterministic NSE symbols spanning large/mid/small cap + sectoral spread.
 * Used by run-backtest edge function. Committed to repo for reproducibility.
 *
 * Do not edit without bumping engine_version OR creating a new universe slug.
 */
export const BACKTEST_UNIVERSE_V1: ReadonlyArray<string> = [
  // 10 Nifty large-cap
  "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY",
  "HINDUNILVR", "ITC", "KOTAKBANK", "LT", "SBIN",

  // 15 mid-cap
  "TATAPOWER", "TATAMOTORS", "SUZLON", "TATASTEEL", "BAJAJ-AUTO",
  "PAYTM", "ADANIENT", "ADANIPORTS", "GODREJCP", "DABUR",
  "HAVELLS", "BIOCON", "MFSL", "BANDHANBNK", "PERSISTENT",

  // 15 small-cap
  "HFCL", "IDEA", "IDFCFIRSTB", "YESBANK", "RBLBANK",
  "IRCTC", "NMDC", "GMRINFRA", "RECLTD", "PFC",
  "SAIL", "NHPC", "IRFC", "BHEL", "UNIONBANK",

  // 10 sectoral spread (banking, IT, energy, auto, FMCG, pharma, metals, realty, PSU, telecom)
  "AXISBANK", "WIPRO", "ONGC", "MARUTI", "NESTLEIND",
  "SUNPHARMA", "JSWSTEEL", "DLF", "COALINDIA", "BHARTIARTL",
];

export const BACKTEST_HORIZONS = ["short-term", "medium-term", "long-term"] as const;
export type BacktestHorizon = typeof BACKTEST_HORIZONS[number];

/** Forward-walk window per horizon (trading days). */
export const HORIZON_FORWARD_DAYS: Record<BacktestHorizon, number> = {
  "short-term": 60,
  "medium-term": 180,
  "long-term": 365,
};
