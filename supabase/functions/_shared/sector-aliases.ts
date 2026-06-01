// Canonical sector resolver shared between seed-sector-aggregates and
// compute-trade-plan. Source of truth for "what does this sector string mean".
//
// Normalization pipeline:
//   1. lowercase + trim
//   2. collapse non-alphanumerics → "_"
//   3. lookup in ALIASES; if hit, return canonical
//   4. otherwise return the slug (snake_case)
//
// Caller is responsible for the DB lookup against sector_aggregates.sector_canonical.
// If the lookup misses, fall back to "__default__" AND set
// audit_meta.sector_aggregate_source = "default_fallback".

export const ALIASES: Record<string, string> = {
  // Private banks
  private_sector_bank: "private_sector_bank",
  private_sector_banks: "private_sector_bank",
  private_banks: "private_sector_bank",
  private_bank: "private_sector_bank",
  pvt_sector_bank: "private_sector_bank",
  pvt_bank: "private_sector_bank",

  // PSU banks
  public_sector_bank: "public_sector_bank",
  public_sector_banks: "public_sector_bank",
  psu_bank: "public_sector_bank",
  psu_banks: "public_sector_bank",

  // Banks (generic) → treat as private (the dominant class in stock_master)
  banks: "private_sector_bank",
  bank: "private_sector_bank",
  banking: "private_sector_bank",
  banks_private_sector: "private_sector_bank",
  banks_public_sector: "public_sector_bank",
  private_sector_banks_and_financial_institutions: "private_sector_bank",
  small_finance_bank: "private_sector_bank",
  small_finance_banks: "private_sector_bank",
  finance: "private_sector_bank",

  // Petroleum / refining
  refineries_marketing: "petroleum_products",
  petroleum_products: "petroleum_products",
  oil_gas_refining: "petroleum_products",
  oil_gas: "petroleum_products",
  energy: "petroleum_products",

  // IT
  it_software: "it_services",
  it_services: "it_services",
  information_technology: "it_services",
  software_services: "it_services",
  computers_software_consulting: "it_services",
  computers_software: "it_services",
  software: "it_services",

  // Pharma
  pharmaceuticals: "pharmaceuticals",
  pharma: "pharmaceuticals",
  healthcare: "pharmaceuticals",

  // Auto
  automobile: "automobile",
  automobiles: "automobile",
  auto_components: "automobile",

  // FMCG / staples
  fmcg: "fmcg",
  consumer_staples: "fmcg",

  // Capital goods / engineering
  capital_goods: "capital_goods",
  engineering: "capital_goods",
  industrials: "capital_goods",

  // Telecom
  telecom: "telecom",
  telecommunication: "telecom",
  telecommunications: "telecom",

  // Cement
  cement: "cement",

  // Financial services (generic) → private bank surrogate
  financial_services: "private_sector_bank",
};

export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function resolveSectorCanonical(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const slug = slugify(raw);
  if (!slug) return null;
  return ALIASES[slug] ?? slug;
}
