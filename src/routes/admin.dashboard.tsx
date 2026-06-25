import { createFileRoute } from "@tanstack/react-router";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import AdminDashboard from "@/pages/admin/AdminDashboard";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Expert Dashboard — Stockera" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <RequireAnalyst><AdminDashboard /></RequireAnalyst>,
});
