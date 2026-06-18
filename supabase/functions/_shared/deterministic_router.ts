// Deterministic router for ask-claude (Stage 1).
// Rule-first, no LLM on hot path. First matching rule wins.

export type RouteAction =
  | "answered_direct"
  | "routed_to_ask_anything"
  | "refused_unsafe";

export interface RouteResult {
  action: RouteAction;
  reason: string;
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

// (B1) Personalized action intent.
const PERSONALIZED_INTENT: RegExp[] = [
  /\b(should i|shall i|can i)\s+(buy|sell|hold|book|exit|enter)/i,
  /\b(buy|sell|short|long)\s+(at|now|tomorrow|today)/i,
  /\b(target|stop\s*loss|sl|tp)\b.*\b(for|on)\s+[A-Z]{2,12}/i,
  /\bi\s+(bought|sold|hold|own)\b.*\b(at|@)\s*\d/i,
];

// (B2) Stock-specific action keywords (paired with a known symbol).
const STOCK_ACTION_KEYWORDS = [
  "buy", "sell", "target", "should", "will",
  "fall", "rise", "crash", "moon", "tomorrow", "today",
];

// (B3) Live market state.
const LIVE_MARKET_PATTERNS: RegExp[] = [
  /\b(nifty|sensex|banknifty|bank\s*nifty)\b.*\b(today|now|live|current)/i,
  /\bmarket\s+(today|now|live|current)/i,
];

// Top NSE F&O symbols (Stage 1 starter set — ~200).
// Expanded list ships in Stage 3.
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
  "PNB","BANKBARODA","CANBK","UNIONBANK","IDBI","IDFCFIRSTB","FEDERALBNK","RBLBANK",
  "AUBANK","BANDHANBNK","YESBANK","CHOLAFIN","BAJFINANCE","M&MFIN","SHRIRAMFIN",
  "LICHSGFIN","HDFCAMC","NAM-INDIA","UTIAMC","ABCAPITAL","PEL","MFSL","MUTHOOTFIN",
  "MANAPPURAM","CDSL","BSE","MCX","ANGELONE","MOTILALOFS","ICICIGI","STARHEALTH",
  "GICRE","NIACL","HDFCFINBLD","POLYCAB","SIEMENS","ABB","CUMMINSIND","HONAUT",
  "THERMAX","KIRLOSENG","BHARATELE","BEL","HAL","BEML","COCHINSHIP","MAZDOCK",
  "GRSE","RVNL","IRFC","RAILTEL","RITES","IRCON","NBCC","NCC","KEC","KALPATPOWR",
  "GMRINFRA","ADANIINFRA","SUPREMEIND","ASTRAL","FINOLEXIND","NILKAMAL","KAJARIACER",
  "CERA","SOMANYCERA","CENTURYTEX","JKCEMENT","RAMCOCEM","DALBHARAT","HEIDELBERG",
  "ACC","AMBUJACEM","INDIACEM","ZEEL","SUNTV","PVRINOX","DISHTV","NETWORK18",
  "TV18BRDCST","TRENT","ABFRL","PAGEIND","VBL","UBL","JUBLFOOD","DEVYANI","WESTLIFE",
  "NYKAA","ZOMATO","PAYTM","POLICYBZR","CARTRADE","DELHIVERY","FSL","INDIAMART",
  "JUSTDIAL","TANLA","ROUTE","KFINTECH","CAMS","COMPUTAGE","SBICARD","BAJAJHOUSING",
  "SUZLON","INOXWIND","RPOWER","RTNINDIA","JPPOWER","TORNTPOWER","CESC","KEI",
  "POLYMED","LAURUSLABS","SYNGENE","GLAND","SOLARINDS","DEEPAKNTR","SRF","GHCL",
  "TATACHEM","CHAMBLFERT","COROMANDEL","UPL","PIIND","RALLIS","BAYERCROP","SUMICHEM",
]);

// Pull all ALL-CAPS tokens (length 2–12) from a message.
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

export function routeMessage(
  mode: "report_followup" | "homepage_assistant",
  userMessageRaw: string,
): RouteResult {
  const msg = (userMessageRaw ?? "").trim();

  // (A) Unsafe — applies to both modes.
  for (const re of UNSAFE_PATTERNS) {
    if (re.test(msg)) {
      return { action: "refused_unsafe", reason: "unsafe_pattern_matched" };
    }
  }

  // (B) report_followup — evidence pack exists; default to direct answer.
  if (mode === "report_followup") {
    return { action: "answered_direct", reason: "report_followup_default" };
  }

  // (B) homepage_assistant sub-rules:
  // (B1) Personalized action intent.
  for (const re of PERSONALIZED_INTENT) {
    if (re.test(msg)) {
      return { action: "routed_to_ask_anything", reason: "personalized_action_intent" };
    }
  }

  // (B2) Specific stock + intent.
  if (containsKnownSymbol(msg) && containsActionKeyword(msg)) {
    return { action: "routed_to_ask_anything", reason: "stock_specific_action" };
  }

  // (B3) Live market state.
  for (const re of LIVE_MARKET_PATTERNS) {
    if (re.test(msg)) {
      return { action: "routed_to_ask_anything", reason: "live_market_state" };
    }
  }

  // (B4) Pure education / product question — default.
  return { action: "answered_direct", reason: "education_default" };
}
