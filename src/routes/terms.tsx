import { createFileRoute } from "@tanstack/react-router";
import Terms from "@/pages/Terms";
import { PublicShell } from "@/components/layout/PublicShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Ask The Expert by Stockera" },
      { name: "description", content: "The terms governing your use of Ask The Expert by Stockera." },
      { property: "og:url", content: "/terms" },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
  component: () => (
    <PublicShell eyebrow="Legal" title="Terms of Service">
      <Terms />
    </PublicShell>
  ),
});
