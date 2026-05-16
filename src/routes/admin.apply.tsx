import { createFileRoute } from "@tanstack/react-router";
import AnalystApplication from "@/pages/admin/AnalystApplication";

export const Route = createFileRoute("/admin/apply")({
  head: () => ({ meta: [{ title: "Apply as Analyst — Stockera" }] }),
  component: AnalystApplication,
});
