// Client-side mirror of supabase/functions/_shared/sector-aliases.ts.
// Kept in sync so UI tooltips/audits can show the same canonical resolution.
// If you change this file, also update the edge-function copy.

export const ALIASES: Record<string, string> = {
  private_sector_bank: "private_sector_bank",
  private_sector_banks: "private_sector_bank",
  private_banks: "private_sector_bank",
  private_bank: "private_sector_bank",
  pvt_sector_bank: "private_sector_bank",
  pvt_bank: "private_sector_bank",
  public_sector_bank: "public_sector_bank",
  public_sector_banks: "public_sector_bank",
  psu_bank: "public_sector_bank",
  psu_banks: "public_sector_bank",
  banks: "private_sector_bank",
  banking: "private_sector_bank",
  refineries_marketing: "petroleum_products",
  petroleum_products: "petroleum_products",
  oil_gas_refining: "petroleum_products",
  oil_gas: "petroleum_products",
  energy: "petroleum_products",
  it_software: "it_services",
  it_services: "it_services",
  information_technology: "it_services",
  software_services: "it_services",
  computers_software_consulting: "it_services",
  computers_software: "it_services",
  software: "it_services",
  pharmaceuticals: "pharmaceuticals",
  pharma: "pharmaceuticals",
  healthcare: "pharmaceuticals",
  automobile: "automobile",
  automobiles: "automobile",
  auto_components: "automobile",
  fmcg: "fmcg",
  consumer_staples: "fmcg",
  capital_goods: "capital_goods",
  engineering: "capital_goods",
  industrials: "capital_goods",
  telecom: "telecom",
  telecommunication: "telecom",
  telecommunications: "telecom",
  cement: "cement",
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
