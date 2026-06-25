import { createFileRoute } from "@tanstack/react-router";
import Privacy from "@/pages/Privacy";
import { PublicShell } from "@/components/layout/PublicShell";

const SITE_ORIGIN = "https://asktheexpert.lovable.app";
const TITLE = "Privacy Policy — Stockera Technology Private Limited";
const DESCRIPTION = "How Stockera collects, uses, and protects your personal data. GDPR-aware and compliant with Indian data protection law.";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_ORIGIN}/privacy` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/privacy` }],
  }),
  component: () => (
    <PublicShell eyebrow="Legal" title="Privacy Policy">
      <Privacy />
    </PublicShell>
  ),
});
