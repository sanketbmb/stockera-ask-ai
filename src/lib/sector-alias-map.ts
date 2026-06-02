// Phase 3B — User-facing sector alias resolver for Sector View.
// Maps free-text sector wording (chip + textbox or router output) to the
// canonical `sector_canonical` slug present in the sector_aggregates table.
// Verified against the live Step 0 audit list — every value here exists.

import { resolveSectorCanonical } from "@/lib/sector-aliases";

// Canonical -> human-friendly display name. Drives header copy + chip labels.
export const SECTOR_DISPLAY: Record<string, string> = {
  private_sector_bank: "Private Sector Banks",
  public_sector_bank: "Public Sector Banks",
  banks: "Banks",
  financial_services: "Financial Services",
  it_services: "IT Services",
  it_software: "IT Software",
  information_technology: "Information Technology",
  software_services: "Software & Services",
  pharmaceuticals: "Pharmaceuticals",
  healthcare: "Healthcare",
  automobile: "Automobile",
  auto_components: "Auto Components",
  fmcg: "FMCG",
  consumer_staples: "Consumer Staples",
  consumer_discretionary: "Consumer Discretionary",
  capital_goods: "Capital Goods",
  engineering: "Engineering",
  cement: "Cement",
  metals_mining: "Metals & Mining",
  oil_gas: "Oil & Gas",
  petroleum_products: "Refineries & Marketing",
  energy: "Energy",
  power: "Power",
  utilities: "Utilities",
  telecom: "Telecom",
  real_estate: "Real Estate",
  infrastructure: "Infrastructure",
  construction: "Construction",
  chemicals: "Chemicals",
  textiles: "Textiles",
  media: "Media",
  agriculture: "Agriculture",
  services: "Services",
  diversified: "Diversified",
};

// Extra free-text aliases not already in src/lib/sector-aliases.ts.
// Hinglish + plural + common abbreviations.
const EXTRA_ALIASES: Record<string, string> = {
  // Banks
  "private banks": "private_sector_bank",
  "private bank": "private_sector_bank",
  "private sector bank stocks": "private_sector_bank",
  "psu banks": "public_sector_bank",
  "psu bank stocks": "public_sector_bank",
  "public banks": "public_sector_bank",
  "sarkari banks": "public_sector_bank",
  "government banks": "public_sector_bank",
  bank: "banks",
  banks: "banks",
  banking: "banks",
  banking_sector: "banks",
  banking_stocks: "banks",

  // Tech
  it: "it_services",
  tech: "it_services",
  "tech sector": "it_services",
  technology: "it_services",
  "information_technology": "information_technology",
  "software": "software_services",
  "computers software": "it_services",

  // Auto
  auto: "automobile",
  autos: "automobile",
  cars: "automobile",
  "automobile_sector": "automobile",

  // Energy
  "oil_and_gas": "oil_gas",
  "oil and gas": "oil_gas",
  "energy and utilities": "energy",
  refining: "petroleum_products",
  refineries: "petroleum_products",

  // Pharma
  pharma: "pharmaceuticals",
  "pharma sector": "pharmaceuticals",
  drugs: "pharmaceuticals",

  // Consumer
  consumer: "fmcg",
  "consumer goods": "fmcg",
  staples: "consumer_staples",
  discretionary: "consumer_discretionary",

  // Metals
  metal: "metals_mining",
  metals: "metals_mining",
  mining: "metals_mining",
  steel: "metals_mining",

  // Telecom
  telco: "telecom",
  telcos: "telecom",
  telecommunication: "telecom",
  telecommunications: "telecom",

  // Real estate
  realty: "real_estate",
  realestate: "real_estate",
  "real estate": "real_estate",

  // Infra
  infra: "infrastructure",

  // Capital goods
  capex: "capital_goods",
  industrials: "capital_goods",

  // Power / utilities
  utility: "utilities",
  power_sector: "power",
};

function slug(raw: string): string {
  return raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Canonical sectors prominently surfaced as fallback chips when the user's
 *  wording can't be resolved. Picked from highest-traffic + reliably-populated
 *  rows in the Step 0 audit. */
export const SUPPORTED_SECTOR_CHIPS: { canonical: string; display: string }[] = [
  { canonical: "private_sector_bank", display: "Private Banks" },
  { canonical: "public_sector_bank", display: "Public Banks" },
  { canonical: "it_services", display: "IT Services" },
  { canonical: "energy", display: "Energy" },
  { canonical: "pharmaceuticals", display: "Pharma" },
  { canonical: "fmcg", display: "FMCG" },
];

export interface ResolvedSector {
  canonical: string;
  display: string;
}

/** Resolve a free-text sector phrase to a canonical slug. Returns null when
 *  no confident mapping exists — caller is responsible for graceful fallback.
 */
export function resolveSector(raw: string | null | undefined): ResolvedSector | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  // 1. Direct table-key match (e.g. "private_sector_bank")
  if (SECTOR_DISPLAY[trimmed]) {
    return { canonical: trimmed, display: SECTOR_DISPLAY[trimmed] };
  }

  // 2. Extra alias map (plain + slugged)
  const extra = EXTRA_ALIASES[trimmed] ?? EXTRA_ALIASES[slug(raw)];
  if (extra && SECTOR_DISPLAY[extra]) {
    return { canonical: extra, display: SECTOR_DISPLAY[extra] };
  }

  // 3. Existing ALIASES map in src/lib/sector-aliases.ts
  const fromExisting = resolveSectorCanonical(raw);
  if (fromExisting && SECTOR_DISPLAY[fromExisting]) {
    return { canonical: fromExisting, display: SECTOR_DISPLAY[fromExisting] };
  }
  if (fromExisting && SECTOR_DISPLAY[slug(fromExisting)]) {
    return { canonical: slug(fromExisting), display: SECTOR_DISPLAY[slug(fromExisting)] };
  }

  return null;
}

export function sectorDisplay(canonical: string): string {
  return SECTOR_DISPLAY[canonical] ?? canonical.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
