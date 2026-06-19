// Deterministic router for ask-claude.
// Stage 2.3 — adds CTA deep-link routes for stock-picker / educational / sector.

export type RouteAction =
  | "answered_direct"
  | "routed_to_ask_anything"
  | "refused_unsafe"
  | "routed_to_stock_picker"
  | "routed_to_educational_report"
  | "routed_to_sector_report";

export interface RouteResult {
  action: RouteAction;
  reason: string;
  hint?: "explain" | "open" | "unsafe";
}

// (A) Unsafe patterns — applied to BOTH modes.
const UNSAFE_PATTERNS: RegExp[] = [
  /\binsider\b/i,
  /\boperator\b/i,
  /\bguaranteed\s+(profit|return)/i,
  /\bsure\s*shot\b/i,
  /\bpromot(ed|ion)\s+tip/i,
  /\bpump\s*and\s*dump/i,
  /\bjackpot\b/i,
  /\b100%\s*return\b/i,
];

// Stage 2.3 CTA intent patterns
const STOCK_PICKER_INTENT: RegExp[] = [
  /\bwhich stock should i buy\b/i,
  /\bwhat should i buy\b/i,
  /\bbest stock to buy\b/i,
  /\btop stock to buy\b/i,
  /\bstock (recommendation|pick)\b/i,
  /\brecommend a stock\b/i,
  /\bany stock to buy\b/i,
  /\bwhat can i invest in\b/i,
];

const EDUCATIONAL_DEEPLINK_INTENT: RegExp[] = [
  /\bwhat is rsi\b/i, /\bwhat is macd\b/i, /\bwhat is pe\b/i, /\bwhat is pb\b/i,
  /\bwhat is beta\b/i, /\bwhat is (cagr|eps|roe|roce)\b/i,
  /\bexplain (rsi|macd|pe|pb|beta|cagr|eps|roe|roce)\b/i,
  /\bhow (does|do) (rsi|macd|pe|pb|beta|cagr|eps|roe|roce) work\b/i,
  /\bwhat does (rsi|macd|pe|pb|beta|cagr|eps|roe|roce) mean\b/i,
  /\bdefine (rsi|macd|pe|pb|beta|cagr|eps|roe|roce)\b/i,
  /\b(investment|trading) (basics|terms|concepts|jargon)\b/i,
];

const SECTORIAL_DEEPLINK_INTENT: RegExp[] = [
  /\b(industry|sector) (view|outlook|analysis|trend|performance)\b/i,
  /\b(how is|how's) the (it|banking|pharma|auto|metal|energy|fmcg|realty) sector\b/i,
  /\b(sector|sectoral) (summary|report|update|breakdown)\b/i,
];

// (B1) Personalized action intent (homepage).
const PERSONALIZED_INTENT: RegExp[] = [
  /\b(should i|shall i|can i)\s+(buy|sell|hold|book|exit|enter)/i,
  /\b(buy|sell|short|long)\s+(at|now|tomorrow|today)/i,
  /\b(target|stop\s*loss|sl|tp)\b.*\b(for|on)\s+[A-Z]{2,12}/i,
  /\bi\s+(bought|sold|hold|own)\b.*\b(at|@)\s*\d/i,
];

const STOCK_ACTION_KEYWORDS = [
  "buy", "sell", "target", "should", "will",
  "fall", "rise", "crash", "moon", "tomorrow", "today",
];

const LIVE_MARKET_PATTERNS: RegExp[] = [
  /\b(nifty|sensex|banknifty|bank\s*nifty)\b.*\b(today|now|live|current)/i,
  /\bmarket\s+(today|now|live|current)/i,
];

const NSE_BSE_SYMBOLS = new Set<string>([
  "RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK","HINDUNILVR","SBIN","BHARTIARTL",
  "ITC","KOTAKBANK","LT","AXISBANK","BAJFINANCE","ASIANPAINT","MARUTI","HCLTECH",
  "SUNPHARMA","TITAN","ULTRACEMCO","WIPRO","ONGC","NTPC","POWERGRID","M&M",
  "TATAMOTORS","TATASTEEL","JSWSTEEL","ADANIENT","ADANIPORTS","COALINDIA","BPCL",
  "IOC","HINDALCO","GRASIM","DRREDDY","CIPLA","DIVISLAB","APOLLOHOSP","BAJAJFINSV",
  "BAJAJ-AUTO","HEROMOTOCO","EICHERMOT","BRITANNIA","NESTLEIND","TATACONSUM",
  "UPL","SHREECEM","HDFCLIFE","SBILIFE","ICICIPRULI","INDUSINDBK","TECHM","LTIM",
  "MPHASIS","PERSISTENT","COFORGE","OFSS","BIOCON","LUPIN","TORNTPHARM","AUROPHARMA",
  "ZYDUSLIFE","ALKEM","GLENMARK","DABUR","GODREJCP","MARICO","COLPAL","PIDILITIND",
  "BERGEPAINT","HAVELLS","VOLTAS","CROMPTON","WHIRLPOOL","DLF","GODREJPROP","OBEROIRLTY",
  "PRESTIGE","LODHA","PHOENIXLTD","INDIGO","SPICEJET","IRCTC","CONCOR","CONTAINER",
  "GAIL","PETRONET","IGL","MGL","ATGL","ADANIGREEN","ADANIPOWER","ADANITRANS",
  "TATAPOWER","NHPC","SJVN","BHEL","SAIL","NMDC","VEDL","HINDZINC","NATIONALUM",
  "JINDALSTEL","APLAPOLLO","RATNAMANI","WELCORP","BHARATFORG","MOTHERSON","BOSCHLTD",
  "MRF","CEAT","APOLLOTYRE","BALKRISIND","TVSMOTOR","ASHOKLEY","ESCORTS","BAJAJHLDNG",
]);

const UPPER_TOKEN_RE = /\b[A-Z][A-Z0-9&-]{1,11}\b/g;

function containsKnownSymbol(msg: string): boolean {
  const m = msg.match(UPPER_TOKEN_RE);
  if (!m) return false;
  for (const tok of m) if (NSE_BSE_SYMBOLS.has(tok)) return true;
  return false;
}

function containsActionKeyword(msg: string): boolean {
  const lower = msg.toLowerCase();
  return STOCK_ACTION_KEYWORDS.some((kw) => lower.includes(kw));
}

export type FollowupRouterHint = {
  hint: "explain" | "open" | "unsafe";
  reason: string;
  route_intent: RouteAction;
};

export function detectFollowupQueryHint(message: string): FollowupRouterHint {
  const text = String(message ?? "").trim();

  if (UNSAFE_PATTERNS.some((re) => re.test(text))) {
    return { hint: "unsafe", reason: "unsafe_pattern_match", route_intent: "refused_unsafe" };
  }
  if (STOCK_PICKER_INTENT.some((re) => re.test(text))) {
    return { hint: "explain", reason: "stock_picker_intent", route_intent: "routed_to_stock_picker" };
  }
  if (EDUCATIONAL_DEEPLINK_INTENT.some((re) => re.test(text))) {
    return { hint: "explain", reason: "educational_intent", route_intent: "routed_to_educational_report" };
  }
  if (SECTORIAL_DEEPLINK_INTENT.some((re) => re.test(text))) {
    return { hint: "explain", reason: "sector_intent", route_intent: "routed_to_sector_report" };
  }

  const OPEN_SIGNALS = [
    /\b(latest|news|today|this week|recent|headline|announcement|update on|happen|developments?)\b/i,
    /\b(compare|correlate|impact of)\b/i,
  ];
  if (OPEN_SIGNALS.some((re) => re.test(text))) {
    return { hint: "open", reason: "open_signals", route_intent: "answered_direct" };
  }

  return { hint: "explain", reason: "default_explain", route_intent: "answered_direct" };
}

// Backward-compatible routeMessage. Supports both:
//   routeMessage(mode, message)         — Stage 1 callers
//   routeMessage(message, { mode })     — Stage 2.3 callers
export function routeMessage(
  a: string,
  b?: string | { mode?: string },
): RouteResult {
  let mode: string;
  let message: string;
  if (typeof b === "string") {
    mode = a;
    message = b;
  } else {
    message = a;
    mode = b?.mode ?? "report_followup";
  }

  const msg = (message ?? "").trim();

  // Unsafe always wins
  for (const re of UNSAFE_PATTERNS) {
    if (re.test(msg)) {
      return { action: "refused_unsafe", reason: "unsafe_pattern_matched", hint: "unsafe" };
    }
  }

  if (mode === "report_followup") {
    const h = detectFollowupQueryHint(msg);
    return { action: h.route_intent, reason: h.reason, hint: h.hint };
  }

  // homepage_assistant rules
  for (const re of PERSONALIZED_INTENT) {
    if (re.test(msg)) {
      return { action: "routed_to_ask_anything", reason: "personalized_action_intent" };
    }
  }
  if (containsKnownSymbol(msg) && containsActionKeyword(msg)) {
    return { action: "routed_to_ask_anything", reason: "stock_specific_action" };
  }
  for (const re of LIVE_MARKET_PATTERNS) {
    if (re.test(msg)) {
      return { action: "routed_to_ask_anything", reason: "live_market_state" };
    }
  }
  return { action: "answered_direct", reason: "education_default" };
}
