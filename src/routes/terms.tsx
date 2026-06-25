import { createFileRoute } from "@tanstack/react-router";
import Terms from "@/pages/Terms";
import { PublicShell } from "@/components/layout/PublicShell";

const SITE_ORIGIN = "https://asktheexpert.lovable.app";
const TITLE = "Terms of Service — Stockera";
const DESCRIPTION = "Terms governing use of asktheexpert.lovable.app, Ask The Expert by Stockera, and all related SEBI Research Analyst services.";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_ORIGIN}/terms` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/terms` }],
  }),
  component: () => (
    <PublicShell eyebrow="Legal" title="Terms of Service">
      <Terms />
    </PublicShell>
  ),
});
