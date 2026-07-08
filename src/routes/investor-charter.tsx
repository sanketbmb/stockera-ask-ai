import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/layout/PublicShell";
import { FIRM } from "@/lib/firm-details";
import { Card } from "@/components/ui/card";

const SITE_ORIGIN = "https://asktheexpert.in";
const TITLE = "Investor Charter — SEBI Research Analyst Disclosure | Stockera";
const DESCRIPTION = "Investor charter, services offered, rights and obligations under SEBI Research Analyst Regulations, 2014. Stockera Technology Private Limited · INH000019071.";

export const Route = createFileRoute("/investor-charter")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_ORIGIN}/investor-charter` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/investor-charter` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
            { "@type": "ListItem", position: 2, name: "Investor Charter", item: `${SITE_ORIGIN}/investor-charter` },
          ],
        }),
      },
    ],
  }),
  component: InvestorCharterPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl text-foreground">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function InvestorCharterPage() {
  return (
    <PublicShell
      eyebrow="SEBI Compliance"
      title="Investor Charter"
      subtitle={`Research Analyst — ${FIRM.legalName} (SEBI Reg. No. ${FIRM.sebiRegNumber})`}
    >
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <Card className="border-border p-6">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Name of Research Analyst</dt><dd className="font-medium text-foreground">{FIRM.legalName}</dd></div>
            <div><dt className="text-muted-foreground">SEBI Registration No.</dt><dd className="font-medium text-foreground">{FIRM.sebiRegNumber}</dd></div>
            <div><dt className="text-muted-foreground">Type of Registration</dt><dd className="font-medium text-foreground">{FIRM.sebiType}</dd></div>
            <div><dt className="text-muted-foreground">Validity</dt><dd className="font-medium text-foreground">{FIRM.validity}</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted-foreground">Registered Office</dt><dd className="font-medium text-foreground">{FIRM.address}</dd></div>
            <div><dt className="text-muted-foreground">Email</dt><dd className="font-medium text-foreground">{FIRM.email}</dd></div>
            <div><dt className="text-muted-foreground">Phone</dt><dd className="font-medium text-foreground">{FIRM.phone}</dd></div>
          </dl>
        </Card>

        <Section title="A. Vision">
          <p>To enable Indian retail investors to make informed investment decisions through transparent, unbiased, evidence-based research, delivered with integrity and in full compliance with SEBI (Research Analysts) Regulations, 2014.</p>
        </Section>

        <Section title="B. Mission">
          <ul className="list-disc space-y-2 pl-5">
            <li>Provide independent and well-reasoned research recommendations on listed Indian securities.</li>
            <li>Disclose all conflicts of interest and the basis of every recommendation.</li>
            <li>Maintain records of all recommendations and research methodology for a minimum of 5 years.</li>
            <li>Educate investors on the risks associated with capital markets.</li>
          </ul>
        </Section>

        <Section title="C. Services provided to investors">
          <ul className="list-disc space-y-2 pl-5">
            <li>Written research reports on individual stocks listed on NSE / BSE.</li>
            <li>AI-assisted preliminary analysis backed by SEBI-registered Research Analyst review.</li>
            <li>Query-based recommendations on buy / hold / sell with target price, stop-loss and time horizon.</li>
            <li>Educational content explaining valuation, technicals and macro context.</li>
          </ul>
        </Section>

        <Section title="D. Rights of investors">
          <ul className="list-disc space-y-2 pl-5">
            <li>Receive research reports that clearly state assumptions, risks and the basis of the recommendation.</li>
            <li>Receive a copy of the terms and conditions and the fee schedule before any paid service is rendered.</li>
            <li>Right to withdraw consent at any time and request deletion of personal data (subject to record-keeping obligations).</li>
            <li>Right to file a grievance and have it resolved within 30 days as per SEBI norms.</li>
            <li>Right to escalate unresolved grievances to SEBI SCORES or SMART ODR.</li>
          </ul>
        </Section>

        <Section title="E. Do's for investors">
          <ul className="list-disc space-y-2 pl-5">
            <li>Always deal with SEBI-registered Research Analysts — verify registration on sebi.gov.in.</li>
            <li>Read the research report in full, including disclaimers and assumptions.</li>
            <li>Pay fees only through banking channels in the name of the registered entity. Insist on a receipt.</li>
            <li>Maintain a personal record of recommendations received and trades executed.</li>
            <li>Consider your own risk profile, financial situation and investment horizon before acting.</li>
          </ul>
        </Section>

        <Section title="F. Don'ts for investors">
          <ul className="list-disc space-y-2 pl-5">
            <li>Do not deal with unregistered entities offering "tips", "assured returns" or "profit sharing".</li>
            <li>Do not pay fees in cash or to personal bank accounts of individuals.</li>
            <li>Do not share trading account credentials or OTPs with anyone, including the Research Analyst.</li>
            <li>Do not act on rumours, social media tips or unsolicited messages.</li>
            <li>Do not treat past performance of any recommendation as a guarantee of future returns.</li>
          </ul>
        </Section>

        <Section title="G. Grievance redressal mechanism">
          <p>Investors may raise grievances at <Link to="/grievance-redressal" className="text-primary underline">/grievance-redressal</Link> or write to <a className="text-primary underline" href={`mailto:${FIRM.email}`}>{FIRM.email}</a>. The firm shall acknowledge grievances within 24 hours and resolve them within 30 days of receipt.</p>
          <p>If the investor is not satisfied with the resolution, the complaint may be escalated to SEBI via the SCORES portal at <a className="text-primary underline" href={FIRM.scoresUrl} target="_blank" rel="noreferrer">scores.sebi.gov.in</a>, or referred to online dispute resolution via <a className="text-primary underline" href={FIRM.smartOdrUrl} target="_blank" rel="noreferrer">smartodr.in</a>.</p>
        </Section>

        <Section title="H. Expectations from investors">
          <ul className="list-disc space-y-2 pl-5">
            <li>Provide complete and accurate information at the time of onboarding.</li>
            <li>Read the Risk Disclosure Document before subscribing to any paid service.</li>
            <li>Acknowledge that all investments in securities markets carry market risk.</li>
          </ul>
        </Section>

        <Section title="I. Timelines for service">
          <ul className="list-disc space-y-2 pl-5">
            <li>AI preliminary report: within minutes of query submission.</li>
            <li>Research Analyst review on flagged queries: within 24 working hours.</li>
            <li>Grievance acknowledgement: within 24 hours. Resolution: within 30 days.</li>
            <li>Refund (where applicable): within 7 working days of approval.</li>
          </ul>
        </Section>

        <p className="mt-12 text-xs text-muted-foreground">
          Last reviewed: {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.
          This Investor Charter is published in accordance with SEBI Circular SEBI/HO/IMD/IMD-II CIS/P/CIR/2021/0685 and subsequent amendments.
        </p>
      </div>
    </PublicShell>
  );
}
