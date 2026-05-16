import { createFileRoute } from "@tanstack/react-router";
import FAQ from "@/pages/FAQ";
import { PublicShell } from "@/components/layout/PublicShell";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — Ask The Expert by Stockera" },
      { name: "description", content: "Answers to common questions about queries, experts, pricing, wallet, and SEBI compliance." },
      { property: "og:title", content: "FAQ — Ask The Expert by Stockera" },
      { property: "og:description", content: "Everything you need to know before posting your first query." },
      { property: "og:url", content: "/faq" },
    ],
    links: [{ rel: "canonical", href: "/faq" }],
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
