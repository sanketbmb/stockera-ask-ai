import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import Dashboard from "@/pages/Dashboard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Stockera" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <RequireAuth><Dashboard /></RequireAuth>,
});
