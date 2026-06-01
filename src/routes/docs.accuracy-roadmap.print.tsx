// Public printable for the Stockera Accuracy Roadmap.
// noindex/nofollow — internal documentation route consumed by Browserless.
// No token gate: fully static (no per-user data).

import { createFileRoute } from "@tanstack/react-router";
import { AccuracyRoadmap } from "@/components/docs/AccuracyRoadmap";

export const Route = createFileRoute("/docs/accuracy-roadmap/print")({
  head: () => ({
    meta: [
      { title: "Stockera — Accuracy Roadmap (Print)" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccuracyRoadmap,
});
