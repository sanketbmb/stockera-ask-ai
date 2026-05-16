export function SebiDisclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
          : "rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground"
      }
    >
      <span className="font-semibold text-foreground">SEBI Disclaimer:</span>{" "}
      Investments in securities markets are subject to market risks. Read all related
      documents carefully. Ask The Expert by Stockera connects users with SEBI-registered
      Research Analysts and Investment Advisers. The platform itself does not provide
      investment advice. Past performance is not indicative of future results.
    </div>
  );
}
