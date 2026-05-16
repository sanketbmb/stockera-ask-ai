import { createFileRoute } from "@tanstack/react-router";
import Privacy from "@/pages/Privacy";
import { PublicShell } from "@/components/layout/PublicShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Ask The Expert by Stockera" },
      { name: "description", content: "What data we collect, how we store it, and the choices you have." },
      { property: "og:url", content: "/privacy" },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
  component: () => (
    <PublicShell eyebrow="Legal" title="Privacy Policy">
      <Privacy />
    </PublicShell>
  ),
});
