// Architecture Encyclopedia version stamps. Surfaced in PDF footer + filename.
// Bump DOC_VERSION when content changes; FORMULA_VERSION when Brain math changes;
// MODEL_VERSION when verdict/confidence model changes.

export const DOC_VERSION = "1.0";
export const FORMULA_VERSION = "2026.06.01";
export const MODEL_VERSION = "verdict_v1 · bucket_v1 · confidence_v1";

export function todayISO(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

export function architecturePdfFilename(): string {
  const stamp = todayISO().replace(/-/g, "");
  return `Stockera_Architecture_Encyclopedia_v${DOC_VERSION}_${stamp}.pdf`;
}
