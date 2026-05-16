import { createFileRoute } from "@tanstack/react-router";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import AdminDashboard from "@/pages/admin/AdminDashboard";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Expert Dashboard — Stockera" }] }),
  component: () => <RequireAnalyst><AdminDashboard /></RequireAnalyst>,
});
