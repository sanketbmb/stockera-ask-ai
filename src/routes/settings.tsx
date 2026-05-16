import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import Settings from "@/pages/Settings";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Stockera" }] }),
  component: () => <RequireAuth><Settings /></RequireAuth>,
});
