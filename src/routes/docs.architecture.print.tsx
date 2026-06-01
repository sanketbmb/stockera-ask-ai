// Public printable for the Stockera Architecture & Brain Encyclopedia.
// noindex/nofollow — internal documentation route consumed by Browserless.
// No token gate: this document is fully static (no per-user data).

import { createFileRoute } from "@tanstack/react-router";
import { ArchitectureEncyclopedia } from "@/components/docs/ArchitectureEncyclopedia";

export const Route = createFileRoute("/docs/architecture/print")({
  head: () => ({
    meta: [
      { title: "Stockera — Architecture & Brain Encyclopedia (Print)" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ArchitectureEncyclopedia,
});
