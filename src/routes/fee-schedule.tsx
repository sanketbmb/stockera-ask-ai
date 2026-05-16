import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/layout/PublicShell";
import { FIRM } from "@/lib/firm-details";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/fee-schedule")({
  head: () => ({
    meta: [
      { title: "Fee Schedule — Stockera" },
      {
        name: "description",
        content:
          "Public fee schedule for research and advisory services offered by Stockera Technology Private Limited, SEBI-registered Research Analyst.",
      },
      { property: "og:title", content: "Fee Schedule — Stockera" },
      { property: "og:description", content: "Transparent, SEBI-compliant fees for stock research services." },
    ],
    links: [{ rel: "canonical", href: "/fee-schedule" }],
  }),
  component: FeeSchedulePage,
});

const TIERS = [
  {
    name: "AI Quick Report",
    fee: "₹49",
    period: "per query",
    includes: [
      "AI-assisted research report on one NSE/BSE listed stock",
      "Target price, stop-loss and 1-month outlook",
      "Delivered in minutes",
    ],
  },
  {
    name: "Analyst Review",
    fee: "₹299",
    period: "per query",
    includes: [
      "AI report + manual review by a SEBI-registered Research Analyst",
      "Written rationale and risk assessment",
      "Delivered within 24 working hours",
    ],
  },
  {
    name: "Video Answer",
    fee: "₹599",
    period: "per query",
    includes: [
      "Recorded video walkthrough by a SEBI-registered Research Analyst",
      "Includes chart analysis and entry / exit plan",
      "Delivered within 48 working hours",
    ],
  },
];

function FeeSchedulePage() {
  return (
    <PublicShell
      eyebrow="SEBI Compliance"
      title="Fee Schedule"
      subtitle={`Published fees for services offered by ${FIRM.legalName} (SEBI ${FIRM.sebiType} — ${FIRM.sebiRegNumber}). All fees are in Indian Rupees and inclusive of applicable GST unless stated otherwise.`}
    >
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {TIERS.map((t) => (
            <Card key={t.name} className="flex flex-col border-border p-6">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">{t.name}</p>
              <p className="mt-2 font-display text-4xl text-foreground">{t.fee}</p>
              <p className="text-xs text-muted-foreground">{t.period}</p>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                {t.includes.map((i) => (
                  <li key={i} className="flex gap-2"><span className="text-primary">•</span>{i}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <Card className="mt-10 border-border p-6">
          <h2 className="font-display text-xl text-foreground">Fee charging principles</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Maximum fee charged shall not exceed the limits prescribed by SEBI from time to time under the SEBI (Research Analysts) Regulations, 2014.</li>
            <li>Fees are collected in advance through banking channels in the name of <strong className="text-foreground">{FIRM.legalName}</strong>. We do not accept cash.</li>
            <li>A receipt / invoice is issued automatically on successful payment.</li>
            <li>No performance-linked fee, profit-sharing or "assured return" arrangement is offered.</li>
            <li>Wallet credits are non-transferable and refundable within 7 working days of request, subject to deduction of services already consumed.</li>
          </ul>
        </Card>

        <Card className="mt-6 border-border p-6">
          <h2 className="font-display text-xl text-foreground">Refund and cancellation policy</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>AI Quick Reports are delivered instantly and are non-refundable once generated.</li>
            <li>Analyst Review and Video Answer fees are refundable in full if the analyst has not started work, or on a pro-rata basis otherwise.</li>
            <li>Refund requests may be raised via the <a className="text-primary underline" href="/grievance-redressal">Grievance Redressal</a> page.</li>
          </ul>
        </Card>

        <p className="mt-10 text-xs text-muted-foreground">
          Published in accordance with SEBI (Research Analysts) Regulations, 2014. Last updated:{" "}
          {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.
        </p>
      </div>
    </PublicShell>
  );
}
