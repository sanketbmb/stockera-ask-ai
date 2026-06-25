import { createFileRoute } from "@tanstack/react-router";
import Pricing from "@/pages/Pricing";
import { PublicShell } from "@/components/layout/PublicShell";

const SITE_ORIGIN = "https://asktheexpert.lovable.app";
const TITLE = "Pricing — ₹100 Video Answers from SEBI-Registered Analysts | Stockera";
const DESCRIPTION = "₹100 personalized video answers from SEBI-registered Research Analysts. ₹499 / ₹999 / ₹1,799 for live 1:1 consultations. Transparent, one-time pricing. No subscription.";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_ORIGIN}/pricing` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/pricing` }],
  }),
  component: () => <PublicShell><Pricing /></PublicShell>,
});
