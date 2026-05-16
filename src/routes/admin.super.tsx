import { createFileRoute } from "@tanstack/react-router";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import SuperAdmin from "@/pages/admin/SuperAdmin";

export const Route = createFileRoute("/admin/super")({
  head: () => ({ meta: [{ title: "Admin Console — Stockera" }] }),
  component: () => <RequireAdmin><SuperAdmin /></RequireAdmin>,
});
