// Deterministic sector auto-detector. Scans full question text for keywords
// mapped to canonical sectors present in public.sector_aggregates.
// No LLM, no network. Longest-keyword-first to disambiguate.

import { SECTOR_DISPLAY, sectorDisplay } from "@/lib/sector-alias-map";

export type DetectConfidence = "high" | "medium" | "low";

export interface DetectedSector {
  canonical: string;
  display: string;
  confidence: DetectConfidence;
  matched_keyword: string;
}

// keyword -> { canonical, confidence }
// confidence:
//   high   = multi-word phrase or specific ticker / company
//   medium = single canonical sector word (pharma, fmcg, it)
//   low    = generic/ambiguous (energy, consumer)
type Entry = { kw: string; canonical: string; confidence: DetectConfidence };

const ENTRIES: Entry[] = [
  // ---- Private sector banks ----
  ...["hdfc bank", "icici bank", "axis bank", "kotak mahindra", "kotak bank",
      "indusind bank", "yes bank", "idfc first", "federal bank", "bandhan bank",
      "private sector bank", "private sector banks", "private banks",
      "private bank", "pvt bank", "pvt banks"]
    .map((kw) => ({ kw, canonical: "private_sector_bank", confidence: "high" as const })),

  // ---- Public sector banks ----
  ...["state bank of india", "punjab national bank", "bank of baroda",
      "canara bank", "union bank of india", "indian bank", "bank of india",
      "psu bank", "psu banks", "sarkari bank", "sarkari banks",
      "public sector bank", "public sector banks", "public banks",
      "government banks", "nationalised banks", "nationalized banks"]
    .map((kw) => ({ kw, canonical: "public_sector_bank", confidence: "high" as const })),
  ...["sbi", "pnb", "bob"]
    .map((kw) => ({ kw, canonical: "public_sector_bank", confidence: "medium" as const })),

  // ---- Generic banks ----
  ...["banking sector", "banking stocks", "banking industry"]
    .map((kw) => ({ kw, canonical: "banks", confidence: "high" as const })),
  ...["bank", "banks", "banking"]
    .map((kw) => ({ kw, canonical: "banks", confidence: "medium" as const })),

  // ---- IT / Tech ----
  ...["it sector", "it stocks", "it services", "it industry", "it companies",
      "tech sector", "tech stocks", "information technology",
      "software services", "tcs", "infosys", "wipro", "hcl tech",
      "tech mahindra", "ltimindtree", "mphasis", "persistent systems",
      "coforge", "ltts"]
    .map((kw) => ({ kw, canonical: "it_services", confidence: "high" as const })),
  ...["it", "i.t.", "tech", "technology", "software"]
    .map((kw) => ({ kw, canonical: "it_services", confidence: "medium" as const })),

  // ---- Pharma ----
  ...["pharma sector", "pharma stocks", "pharmaceutical", "pharmaceuticals",
      "sun pharma", "dr reddy", "dr. reddy", "cipla", "lupin", "biocon",
      "divi's lab", "divis lab", "torrent pharma", "zydus"]
    .map((kw) => ({ kw, canonical: "pharmaceuticals", confidence: "high" as const })),
  ...["pharma", "drug", "drugs", "medicine", "medicines"]
    .map((kw) => ({ kw, canonical: "pharmaceuticals", confidence: "medium" as const })),

  // ---- Healthcare (hospitals) ----
  ...["apollo hospital", "apollo hospitals", "fortis healthcare",
      "max healthcare", "narayana hrudayalaya", "healthcare sector",
      "hospital stocks"]
    .map((kw) => ({ kw, canonical: "healthcare", confidence: "high" as const })),
  ...["healthcare", "hospital", "hospitals"]
    .map((kw) => ({ kw, canonical: "healthcare", confidence: "medium" as const })),

  // ---- Automobile ----
  ...["auto sector", "auto stocks", "automobile sector", "two wheeler",
      "two wheelers", "four wheeler", "electric vehicle", "electric vehicles",
      "maruti suzuki", "tata motors", "mahindra and mahindra", "bajaj auto",
      "hero motocorp", "eicher motors", "tvs motor", "ashok leyland"]
    .map((kw) => ({ kw, canonical: "automobile", confidence: "high" as const })),
  ...["auto", "autos", "automobile", "automobiles", "car", "cars", "ev"]
    .map((kw) => ({ kw, canonical: "automobile", confidence: "medium" as const })),

  // ---- Auto components ----
  ...["auto components", "auto ancillary", "auto ancillaries", "bosch",
      "motherson sumi", "samvardhana motherson", "balkrishna industries",
      "mrf", "apollo tyres"]
    .map((kw) => ({ kw, canonical: "auto_components", confidence: "high" as const })),

  // ---- FMCG / Consumer staples ----
  ...["fmcg sector", "fmcg stocks", "consumer staples", "consumer goods",
      "hindustan unilever", "nestle india", "britannia industries",
      "dabur india", "marico", "godrej consumer", "tata consumer",
      "colgate palmolive"]
    .map((kw) => ({ kw, canonical: "fmcg", confidence: "high" as const })),
  ...["fmcg", "hul", "itc", "nestle", "britannia", "dabur"]
    .map((kw) => ({ kw, canonical: "fmcg", confidence: "medium" as const })),

  // ---- Consumer discretionary ----
  ...["consumer discretionary", "discretionary stocks", "titan company",
      "trent ltd", "page industries", "jubilant foodworks", "varun beverages"]
    .map((kw) => ({ kw, canonical: "consumer_discretionary", confidence: "high" as const })),

  // ---- Oil & gas ----
  ...["oil and gas", "oil & gas", "oil gas", "crude oil", "ongc",
      "reliance industries", "oil india", "gail", "petronet lng"]
    .map((kw) => ({ kw, canonical: "oil_gas", confidence: "high" as const })),

  // ---- Refineries / petroleum products ----
  ...["refining", "refinery", "refineries", "petroleum products",
      "indian oil", "bharat petroleum", "hindustan petroleum", "bpcl",
      "hpcl", "iocl"]
    .map((kw) => ({ kw, canonical: "petroleum_products", confidence: "high" as const })),

  // ---- Energy (generic) ----
  ...["energy sector", "energy stocks"]
    .map((kw) => ({ kw, canonical: "energy", confidence: "high" as const })),
  ...["energy"]
    .map((kw) => ({ kw, canonical: "energy", confidence: "low" as const })),

  // ---- Power ----
  ...["power sector", "power stocks", "power generation", "power grid",
      "ntpc", "powergrid", "tata power", "adani power", "jsw energy"]
    .map((kw) => ({ kw, canonical: "power", confidence: "high" as const })),
  ...["electricity"]
    .map((kw) => ({ kw, canonical: "power", confidence: "medium" as const })),

  // ---- Metals & mining ----
  ...["metals and mining", "metal stocks", "metals stocks", "metal sector",
      "metals sector", "mining stocks", "tata steel", "jsw steel",
      "hindalco", "vedanta", "coal india", "sail", "jindal steel",
      "nmdc"]
    .map((kw) => ({ kw, canonical: "metals_mining", confidence: "high" as const })),
  ...["metal", "metals", "mining", "steel"]
    .map((kw) => ({ kw, canonical: "metals_mining", confidence: "medium" as const })),

  // ---- Cement ----
  ...["cement sector", "cement stocks", "ultratech cement", "ambuja cement",
      "shree cement", "acc ltd", "dalmia bharat", "ramco cement"]
    .map((kw) => ({ kw, canonical: "cement", confidence: "high" as const })),
  ...["cement"]
    .map((kw) => ({ kw, canonical: "cement", confidence: "medium" as const })),

  // ---- Telecom ----
  ...["telecom sector", "telecom stocks", "telecommunication",
      "telecommunications", "bharti airtel", "vodafone idea", "reliance jio"]
    .map((kw) => ({ kw, canonical: "telecom", confidence: "high" as const })),
  ...["telecom", "telco", "telcos", "airtel", "jio", "5g"]
    .map((kw) => ({ kw, canonical: "telecom", confidence: "medium" as const })),

  // ---- Real estate ----
  ...["real estate", "realty sector", "realty stocks", "dlf ltd",
      "godrej properties", "lodha", "oberoi realty", "prestige estates",
      "macrotech", "phoenix mills"]
    .map((kw) => ({ kw, canonical: "real_estate", confidence: "high" as const })),
  ...["realty", "dlf", "housing"]
    .map((kw) => ({ kw, canonical: "real_estate", confidence: "medium" as const })),

  // ---- Infrastructure ----
  ...["infrastructure", "infra sector", "infra stocks", "larsen and toubro",
      "larsen & toubro", "irb infra", "gmr infra", "kec international"]
    .map((kw) => ({ kw, canonical: "infrastructure", confidence: "high" as const })),
  ...["infra"]
    .map((kw) => ({ kw, canonical: "infrastructure", confidence: "medium" as const })),

  // ---- Capital goods ----
  ...["capital goods", "industrials", "engineering sector", "abb india",
      "siemens india", "cummins india", "thermax", "bharat electronics",
      "bhel"]
    .map((kw) => ({ kw, canonical: "capital_goods", confidence: "high" as const })),
  ...["capex"]
    .map((kw) => ({ kw, canonical: "capital_goods", confidence: "medium" as const })),

  // ---- Chemicals ----
  ...["specialty chemicals", "chemical sector", "chemical stocks",
      "pidilite", "srf ltd", "aarti industries", "deepak nitrite",
      "navin fluorine"]
    .map((kw) => ({ kw, canonical: "chemicals", confidence: "high" as const })),
  ...["chemical", "chemicals"]
    .map((kw) => ({ kw, canonical: "chemicals", confidence: "medium" as const })),

  // ---- Textiles ----
  ...["textile sector", "textile stocks", "garment", "garments", "apparel",
      "page industries"]
    .map((kw) => ({ kw, canonical: "textiles", confidence: "high" as const })),
  ...["textile", "textiles"]
    .map((kw) => ({ kw, canonical: "textiles", confidence: "medium" as const })),

  // ---- Media ----
  ...["media stocks", "entertainment sector", "zee entertainment",
      "sun tv network", "tv18 broadcast", "pvr inox"]
    .map((kw) => ({ kw, canonical: "media", confidence: "high" as const })),
  ...["media", "entertainment"]
    .map((kw) => ({ kw, canonical: "media", confidence: "medium" as const })),

  // ---- Agriculture ----
  ...["agriculture sector", "agri stocks", "fertilizer", "fertilizers",
      "upl ltd", "coromandel international", "pi industries"]
    .map((kw) => ({ kw, canonical: "agriculture", confidence: "high" as const })),
  ...["agriculture", "agri", "farming"]
    .map((kw) => ({ kw, canonical: "agriculture", confidence: "medium" as const })),

  // ---- Financial services / NBFC ----
  ...["financial services", "nbfc", "non banking financial", "bajaj finance",
      "bajaj finserv", "cholamandalam", "muthoot finance", "manappuram",
      "sundaram finance", "shriram finance", "sbi cards"]
    .map((kw) => ({ kw, canonical: "financial_services", confidence: "high" as const })),

  // ---- Utilities ----
  ...["utilities sector", "utility stocks"]
    .map((kw) => ({ kw, canonical: "utilities", confidence: "high" as const })),
  ...["utilities", "utility"]
    .map((kw) => ({ kw, canonical: "utilities", confidence: "medium" as const })),
];

// Pre-sort longest-first to ensure "private bank" wins over "bank".
const SORTED = [...ENTRIES].sort((a, b) => b.kw.length - a.kw.length);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function detectSectorFromText(text: string | null | undefined): DetectedSector | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  if (!haystack.trim()) return null;

  for (const e of SORTED) {
    // Word-boundary match; allow keyword to contain spaces & punctuation already.
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(e.kw)}(?:$|[^a-z0-9])`, "i");
    if (re.test(haystack)) {
      return {
        canonical: e.canonical,
        display: sectorDisplay(e.canonical),
        confidence: e.confidence,
        matched_keyword: e.kw,
      };
    }
  }
  return null;
}

// All 36 canonical sectors grouped for the fallback chip picker.
export const SECTOR_GROUPS: { group: string; sectors: string[] }[] = [
  { group: "Banking & Finance", sectors: ["private_sector_bank", "public_sector_bank", "banks", "financial_services"] },
  { group: "Technology", sectors: ["it_services", "it_software", "information_technology", "software_services"] },
  { group: "Consumer", sectors: ["fmcg", "consumer_staples", "consumer_discretionary"] },
  { group: "Energy & Power", sectors: ["oil_gas", "petroleum_products", "energy", "power", "utilities"] },
  { group: "Industrial", sectors: ["capital_goods", "engineering", "infrastructure", "construction", "cement"] },
  { group: "Healthcare", sectors: ["pharmaceuticals", "healthcare"] },
  { group: "Materials", sectors: ["metals_mining", "chemicals"] },
  { group: "Auto", sectors: ["automobile", "auto_components"] },
  { group: "Other", sectors: ["telecom", "telecommunication", "real_estate", "agriculture", "textiles", "media", "services", "diversified"] },
];

export function allGroupedSectors(): { group: string; sectors: { canonical: string; display: string }[] }[] {
  return SECTOR_GROUPS.map((g) => ({
    group: g.group,
    sectors: g.sectors
      .filter((c) => SECTOR_DISPLAY[c])
      .map((c) => ({ canonical: c, display: SECTOR_DISPLAY[c] })),
  }));
}
