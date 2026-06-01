import { createFileRoute } from "@tanstack/react-router";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import AdminExports from "@/pages/admin/AdminExports";

export const Route = createFileRoute("/admin/exports")({
  head: () => ({
    meta: [
      { title: "Admin · Exports — Stockera" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <RequireAdmin><AdminExports /></RequireAdmin>,
});
