import { createFileRoute } from "@tanstack/react-router";
import SebiCompliance from "@/pages/SebiCompliance";
import { PublicShell } from "@/components/layout/PublicShell";

const SITE_ORIGIN = "https://asktheexpert.lovable.app";
const TITLE = "SEBI Compliance Overview — Research Analyst INH000019071 | Stockera";
const DESCRIPTION = "Overview of SEBI Research Analyst Regulations 2014 compliance at Stockera Technology Private Limited. Registration, supervision, audit, and investor protection.";

export const Route = createFileRoute("/sebi-compliance")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_ORIGIN}/sebi-compliance` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/sebi-compliance` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
            { "@type": "ListItem", position: 2, name: "SEBI Compliance", item: `${SITE_ORIGIN}/sebi-compliance` },
          ],
        }),
      },
    ],
  }),
  component: () => (
    <PublicShell
      eyebrow="Compliance"
      title="SEBI compliance"
      subtitle="How Stockera works with SEBI-registered Research Analysts and Investment Advisers."
    >
      <SebiCompliance />
    </PublicShell>
  ),
});
