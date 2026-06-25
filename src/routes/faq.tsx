import { createFileRoute } from "@tanstack/react-router";
import FAQ, { FAQ_SECTIONS } from "@/pages/FAQ";
import { PublicShell } from "@/components/layout/PublicShell";

const SITE_ORIGIN = "https://asktheexpert.lovable.app";
const TITLE = "Frequently Asked Questions — Ask The Expert by Stockera";
const DESCRIPTION = "Answers about SEBI registration, pricing, video turnaround time, refund policy, and how Stockera's AI + analyst workflow protects retail investors.";

const sanitize = (t: string) => t.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_SECTIONS.flatMap((s) =>
    s.items.map((it) => ({
      "@type": "Question",
      name: sanitize(it.q),
      acceptedAnswer: { "@type": "Answer", text: sanitize(it.a) },
    })),
  ),
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
    { "@type": "ListItem", position: 2, name: "FAQ", item: `${SITE_ORIGIN}/faq` },
  ],
};

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_ORIGIN}/faq` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/faq` }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(faqLd) },
      { type: "application/ld+json", children: JSON.stringify(breadcrumbLd) },
    ],
  }),
  component: () => (
    <PublicShell
      eyebrow="Help center"
      title="Frequently asked questions"
      subtitle="Can't find what you're looking for? Email support@stockera.in."
    >
      <FAQ />
    </PublicShell>
  ),
});
