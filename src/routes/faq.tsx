import { createFileRoute } from "@tanstack/react-router";
import FAQ from "@/pages/FAQ";
import { PublicShell } from "@/components/layout/PublicShell";

const SITE_ORIGIN = "https://asktheexpert.lovable.app";
const TITLE = "Frequently Asked Questions — Ask The Expert by Stockera";
const DESCRIPTION = "Answers about SEBI registration, pricing, video turnaround time, refund policy, and how Stockera's AI + analyst workflow protects retail investors.";

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
