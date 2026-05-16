import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/layout/PublicShell";
import { FIRM } from "@/lib/firm-details";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/risk-disclosure")({
  head: () => ({
    meta: [
      { title: "Risk Disclosure Document — Stockera" },
      {
        name: "description",
        content:
          "Risk Disclosure Document for research and advisory services offered by Stockera Technology Private Limited (SEBI RA INH000019071).",
      },
      { property: "og:title", content: "Risk Disclosure Document — Stockera" },
      { property: "og:description", content: "Risks of investing in Indian securities markets." },
    ],
    links: [{ rel: "canonical", href: "/risk-disclosure" }],
  }),
  component: RiskDisclosurePage,
});

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 font-display text-2xl text-foreground">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

function RiskDisclosurePage() {
  return (
    <PublicShell
      eyebrow="SEBI Compliance"
      title="Risk Disclosure Document"
      subtitle={`Issued by ${FIRM.legalName} • SEBI Reg. No. ${FIRM.sebiRegNumber}`}
    >
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm leading-relaxed text-foreground">
            <strong>Investment in securities market is subject to market risks. Read all the related documents carefully before investing.</strong>{" "}
            Registration granted by SEBI and certification from NISM in no way guarantee performance of the intermediary or provide any assurance of returns to investors.
          </p>
        </div>

        <H>1. General market risk</H>
        <P>The price of listed securities fluctuates based on macro-economic conditions, company performance, regulatory action, geopolitical events and investor sentiment. Past performance is not indicative of future results, and you may lose part or all of your invested capital.</P>

        <H>2. Concentration risk</H>
        <P>Following a single recommendation, sector view or analyst opinion may result in concentrated exposure to one stock or theme. We strongly recommend diversification across sectors and asset classes.</P>

        <H>3. Liquidity risk</H>
        <P>Mid-cap and small-cap stocks may have lower trading volumes. Exiting such positions during volatile sessions may result in significant price impact or inability to execute at the intended price.</P>

        <H>4. Leverage / derivatives risk</H>
        <P>Recommendations involving futures, options or margin trading carry the risk of losses exceeding the initial capital deployed. Such products are suitable only for investors who fully understand the mechanics and have the financial capacity to bear losses.</P>

        <H>5. Model and AI-assisted research risk</H>
        <P>Stockera uses AI-assisted research as a preliminary input. AI outputs may contain factual errors, outdated information or hallucinations. Final published recommendations are reviewed by a SEBI-registered Research Analyst, but investors must independently verify material facts before acting.</P>

        <H>6. Information risk</H>
        <P>Recommendations are based on information believed to be reliable at the time of issue. Stockera does not guarantee the accuracy, completeness or timeliness of third-party data sources, including exchange feeds, news providers and company filings.</P>

        <H>7. No assured returns</H>
        <P>Neither Stockera nor any of its Research Analysts offer guaranteed, fixed or assured returns of any kind. Any communication promising assured returns is fraudulent and should be reported to <a className="text-primary underline" href={FIRM.scoresUrl}>SEBI SCORES</a> immediately.</P>

        <H>8. Conflict of interest</H>
        <P>Stockera and its analysts may hold positions in securities under coverage. All such positions and any related-party transactions are disclosed in the relevant research report as required under Regulation 19 of SEBI (Research Analysts) Regulations, 2014.</P>

        <H>9. Tax risk</H>
        <P>Profits from securities transactions are subject to taxation under Indian law. Tax treatment depends on the investor's individual circumstances and may change. Investors should consult a qualified tax advisor.</P>

        <H>10. Operational risk</H>
        <P>Service availability may be affected by maintenance, outages of third-party providers (AI gateway, payment processors, exchanges) or force majeure events. Stockera is not liable for losses arising from delayed or unavailable service beyond its reasonable control.</P>

        <H>11. Cyber-security risk</H>
        <P>Investors must safeguard their account credentials. Stockera will never ask for OTPs, broker passwords or trading PINs. Phishing and impersonation attempts should be reported to {FIRM.email}.</P>

        <H>Acknowledgement</H>
        <P>By using Stockera's services, you confirm that you have read this Risk Disclosure Document, understood its contents, and accept the risks associated with investing in the Indian securities markets.</P>

        <p className="mt-12 text-xs text-muted-foreground">
          Issued under SEBI (Research Analysts) Regulations, 2014 and the SEBI Master Circular for Research Analysts.
        </p>
      </div>
    </PublicShell>
  );
}
