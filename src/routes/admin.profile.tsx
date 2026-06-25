import { createFileRoute } from "@tanstack/react-router";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import AnalystProfile from "@/pages/admin/AnalystProfile";

export const Route = createFileRoute("/admin/profile")({
  head: () => ({ meta: [{ title: "My Analyst Profile — Stockera" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <RequireAnalyst><AnalystProfile /></RequireAnalyst>,
});
