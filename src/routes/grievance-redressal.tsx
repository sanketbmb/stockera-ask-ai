import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/layout/PublicShell";
import { GrievanceForm } from "@/components/grievance/GrievanceForm";
import { FIRM } from "@/lib/firm-details";
import { Card } from "@/components/ui/card";
import { Mail, Phone, MapPin, Clock, ExternalLink } from "lucide-react";

const SITE_ORIGIN = "https://asktheexpert.in";
const TITLE = "Grievance Redressal — SEBI SCORES & SmartODR | Stockera";
const DESCRIPTION = "Grievance redressal process, SEBI SCORES escalation, and SmartODR resolution path for Stockera Research Analyst clients.";

export const Route = createFileRoute("/grievance-redressal")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_ORIGIN}/grievance-redressal` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/grievance-redressal` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
            { "@type": "ListItem", position: 2, name: "Grievance Redressal", item: `${SITE_ORIGIN}/grievance-redressal` },
          ],
        }),
      },
    ],
  }),
  component: GrievanceRedressalPage,
});

function GrievanceRedressalPage() {
  return (
    <PublicShell
      eyebrow="SEBI Compliance"
      title="Grievance Redressal"
      subtitle="We acknowledge every grievance within 24 hours and aim to resolve within 30 days, as required by SEBI."
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Card className="border-border p-6">
            <h2 className="font-display text-xl text-foreground">File a grievance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You'll receive a ticket number by email. Track resolution against a 30-day SLA.
            </p>
            <div className="mt-6">
              <GrievanceForm />
            </div>
          </Card>

          <Card className="mt-6 border-border p-6">
            <h2 className="font-display text-xl text-foreground">Escalation matrix</h2>
            <ol className="mt-4 space-y-4 text-sm text-muted-foreground">
              <li>
                <p className="font-medium text-foreground">Level 1 — Customer Support</p>
                <p>Write to <a className="text-primary underline" href={`mailto:${FIRM.email}`}>{FIRM.email}</a>. Response within 24 hours, resolution within 7 working days.</p>
              </li>
              <li>
                <p className="font-medium text-foreground">Level 2 — Grievance Officer</p>
                <p>{FIRM.grievanceOfficer.name} • <a className="text-primary underline" href={`mailto:${FIRM.grievanceOfficer.email}`}>{FIRM.grievanceOfficer.email}</a> • {FIRM.grievanceOfficer.phone}</p>
                <p>Resolution within 21 working days from escalation.</p>
              </li>
              <li>
                <p className="font-medium text-foreground">Level 3 — Compliance Officer</p>
                <p>{FIRM.complianceOfficer.name} • <a className="text-primary underline" href={`mailto:${FIRM.complianceOfficer.email}`}>{FIRM.complianceOfficer.email}</a></p>
              </li>
              <li>
                <p className="font-medium text-foreground">Level 4 — SEBI SCORES</p>
                <p>If unresolved beyond 30 days, escalate to SEBI via the SCORES portal: <a className="text-primary underline inline-flex items-center gap-1" target="_blank" rel="noreferrer" href={FIRM.scoresUrl}>{FIRM.scoresUrl} <ExternalLink className="h-3 w-3" /></a></p>
              </li>
              <li>
                <p className="font-medium text-foreground">Level 5 — Online Dispute Resolution</p>
                <p>Alternatively, use SEBI's SMART ODR platform: <a className="text-primary underline inline-flex items-center gap-1" target="_blank" rel="noreferrer" href={FIRM.smartOdrUrl}>{FIRM.smartOdrUrl} <ExternalLink className="h-3 w-3" /></a></p>
              </li>
            </ol>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="border-border p-6">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">Contact</p>
            <h3 className="mt-2 font-display text-lg text-foreground">{FIRM.legalName}</h3>
            <p className="mt-1 text-xs text-muted-foreground">SEBI {FIRM.sebiType} — {FIRM.sebiRegNumber}</p>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2"><Mail className="h-4 w-4 shrink-0 text-primary" /><a href={`mailto:${FIRM.email}`} className="break-all">{FIRM.email}</a></li>
              <li className="flex gap-2"><Phone className="h-4 w-4 shrink-0 text-primary" /><a href={`tel:${FIRM.phone.replace(/\s/g, "")}`}>{FIRM.phone}</a></li>
              <li className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-primary" /><span>{FIRM.address}</span></li>
              <li className="flex gap-2"><Clock className="h-4 w-4 shrink-0 text-primary" /><span>Mon – Sat, 10:00 – 18:00 IST</span></li>
            </ul>
          </Card>

          <Card className="border-border p-6">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">SEBI</p>
            <p className="mt-2 text-sm text-muted-foreground">{FIRM.sebiOfficeAddress}</p>
            <a href={FIRM.scoresUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline">
              File on SCORES <ExternalLink className="h-3 w-3" />
            </a>
          </Card>
        </aside>
      </div>
    </PublicShell>
  );
}
