// Wave 5b — Marketaux symbol aliases.
//
// Founder-approved narrow list (evidence-only, see B1.5 probe results).
// Fetch order in compute-sentiment: .NS first, then aliases (in declared order),
// then bare. Aliases are belt-and-suspenders for symbols where .NS coverage is
// weak or empty but the .BO listing carries Marketaux articles.
//
// Maintenance rule: add an alias only after a probe confirms ≥3 articles
// on the alternative format when .NS returns 0 in the same window.

export const MARKETAUX_ALIASES: Record<string, string[]> = {
  BPCL: ["BPCL.BO"],
  IDFCFIRSTB: ["IDFCFIRSTB.BO"],
};

// Symbols confirmed to have NO upstream Marketaux coverage in any format.
// compute-sentiment short-circuits these to skip the .NS / alias / bare
// fetch chain entirely and returns NO_COVERAGE_NEW_LISTING instead of
// burning quota on guaranteed-empty calls.
export const MARKETAUX_NO_COVERAGE: ReadonlySet<string> = new Set([
  "NSDL",
]);

// Returns the ordered list of Marketaux symbol formats to try for `symbol`.
// Always starts with `${symbol}.NS`, then any configured aliases, then bare.
export function marketauxSymbolChain(symbol: string): string[] {
  const upper = symbol.toUpperCase();
  const chain: string[] = [`${upper}.NS`];
  for (const a of MARKETAUX_ALIASES[upper] ?? []) {
    if (!chain.includes(a)) chain.push(a);
  }
  if (!chain.includes(upper)) chain.push(upper);
  return chain;
}

// All known entity-symbol spellings for `symbol` (used by pickEntitySentiment
// to match Marketaux's per-entity sentiment regardless of which listing the
// article tagged).
export function marketauxEntityAliases(symbol: string): string[] {
  const upper = symbol.toUpperCase();
  return [
    `${upper}.NS`,
    ...(MARKETAUX_ALIASES[upper] ?? []),
    upper,
  ];
}
