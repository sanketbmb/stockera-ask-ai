import { createFileRoute } from "@tanstack/react-router";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import AdminBacktest from "@/pages/admin/AdminBacktest";

export const Route = createFileRoute("/admin/backtest")({
  head: () => ({ meta: [{ title: "Backtest — Stockera Admin" }] }),
  component: () => <RequireAdmin><AdminBacktest /></RequireAdmin>,
});
