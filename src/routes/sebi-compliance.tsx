import { createFileRoute } from "@tanstack/react-router";
import SebiCompliance from "@/pages/SebiCompliance";
import { PublicShell } from "@/components/layout/PublicShell";

export const Route = createFileRoute("/sebi-compliance")({
  head: () => ({
    meta: [
      { title: "SEBI Compliance — Ask The Expert by Stockera" },
      { name: "description", content: "How Ask The Expert by Stockera complies with SEBI regulations for Research Analysts and Investment Advisers, plus grievance redressal." },
      { property: "og:title", content: "SEBI Compliance — Ask The Expert by Stockera" },
      { property: "og:description", content: "Verification, disclosure, fee transparency and grievance redressal." },
      { property: "og:url", content: "/sebi-compliance" },
    ],
    links: [{ rel: "canonical", href: "/sebi-compliance" }],
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
