import { ExternalLink, ShieldCheck, FileText, AlertTriangle } from "lucide-react";
import { SebiDisclaimer } from "@/components/common/SebiDisclaimer";

export default function SebiCompliance() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="prose-stockera space-y-10 text-foreground">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <ShieldCheck className="h-5 w-5 text-accent" /> Overview
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The Securities and Exchange Board of India (SEBI) regulates two categories of advisory
            professionals relevant to retail investors:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Research Analysts (RA)</span> — regulated under
              SEBI (Research Analysts) Regulations, 2014. They publish research reports and
              recommendations on listed securities.
            </li>
            <li>
              <span className="font-medium text-foreground">Investment Advisers (RIA)</span> — regulated
              under SEBI (Investment Advisers) Regulations, 2013. They provide personalised
              investment advice and may charge a fee for that advice.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <FileText className="h-5 w-5 text-accent" /> How Ask The Expert by Stockera complies
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Verification:</span> Every analyst on the
              platform submits their SEBI registration certificate which is verified against the
              SEBI public registry before activation.
            </li>
            <li>
              <span className="font-medium text-foreground">Disclosure norms:</span> Each video answer
              and report displays the analyst's name, SEBI registration number, and any disclosed
              conflicts of interest as required by SEBI's disclosure framework.
            </li>
            <li>
              <span className="font-medium text-foreground">Fee transparency:</span> Subscription and
              top-up pricing is published in advance, inclusive of GST. There are no hidden fees and
              no commissions on trades — Stockera does not execute trades.
            </li>
            <li>
              <span className="font-medium text-foreground">Suitability:</span> Personalised advice
              from RIAs follows the suitability and risk-profiling norms set out in the SEBI (IA)
              Regulations.
            </li>
          </ul>
        </div>

        <SebiDisclaimer />

        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <AlertTriangle className="h-5 w-5 text-gold" /> Full SEBI disclaimer
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Investments in the securities market are subject to market risks. Read all the related
            documents carefully before investing. Registration granted by SEBI, membership of BASL
            and certification from NISM in no way guarantee performance of the intermediary or
            provide any assurance of returns to investors. The contents on this platform are for
            informational and educational purposes only and are not to be construed as investment
            advice unless explicitly delivered by a SEBI-registered Investment Adviser as part of a
            personalised engagement. Past performance is not indicative of future results.
          </p>
        </div>

        <div>
          <h2 className="font-display text-2xl">SEBI Investor Charter</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Investors are encouraged to read the SEBI Investor Charter on the official SEBI website
            for a full overview of investor rights and the grievance redressal mechanism.
          </p>
          <a
            href="https://www.sebi.gov.in"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            Visit sebi.gov.in <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div>
          <h2 className="font-display text-2xl">Grievance redressal</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Raise a dispute from the query page within 48 hours of receiving an answer, or email
              <a href="mailto:grievance@stockera.in" className="text-accent hover:underline"> grievance@stockera.in</a>.
              We respond within 3 working days.
            </li>
            <li>
              If unresolved, escalate to the analyst's compliance officer (contact shown on the
              analyst profile) within 14 days.
            </li>
            <li>
              If still unresolved, file a complaint on the SEBI SCORES portal at
              <a href="https://scores.gov.in" target="_blank" rel="noreferrer" className="text-accent hover:underline"> scores.gov.in</a>.
            </li>
          </ol>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm">
            <span className="font-medium text-foreground">Compliance contact:</span>{" "}
            <a href="mailto:grievance@stockera.in" className="text-accent hover:underline">grievance@stockera.in</a>
          </p>
          <p className="mt-1 text-sm">
            <span className="font-medium text-foreground">SEBI SCORES portal:</span>{" "}
            <a href="https://scores.gov.in" target="_blank" rel="noreferrer" className="text-accent hover:underline">
              scores.gov.in
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
