import { createFileRoute } from "@tanstack/react-router";
import Pricing from "@/pages/Pricing";
import { PublicShell } from "@/components/layout/PublicShell";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Ask The Expert by Stockera" },
      { name: "description", content: "Simple, transparent pricing. Free, Pro (₹199/mo) and Expert (₹499/mo) plans. Save 20% with annual billing." },
      { property: "og:title", content: "Pricing — Ask The Expert by Stockera" },
      { property: "og:description", content: "Plans for retail investors who want SEBI-verified expert answers." },
      { property: "og:url", content: "/pricing" },
    ],
    links: [{ rel: "canonical", href: "/pricing" }],
  }),
  component: () => <PublicShell><Pricing /></PublicShell>,
});
