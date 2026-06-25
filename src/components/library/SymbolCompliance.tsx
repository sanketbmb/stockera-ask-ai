import { FIRM } from "@/lib/firm-details";

export function SymbolCompliance() {
  return (
    <section className="mx-auto w-full max-w-5xl border-t border-border px-4 py-8 text-xs text-muted-foreground">
      <p className="leading-relaxed">
        All reports reflect analysis at time of publication. Market conditions change. Reports are personal analyst responses published with each user&apos;s consent — they are research, not personalized advice for you.
      </p>
      <p className="mt-3">
        {FIRM.legalName} · SEBI RA {FIRM.sebiRegNumber}
      </p>
      <div className="mt-2 flex gap-4">
        <a href={FIRM.scoresUrl} target="_blank" rel="noreferrer noopener" className="underline hover:text-foreground">
          SEBI SCORES
        </a>
        <a href={FIRM.smartOdrUrl} target="_blank" rel="noreferrer noopener" className="underline hover:text-foreground">
          SMART ODR
        </a>
      </div>
    </section>
  );
}

export default SymbolCompliance;
