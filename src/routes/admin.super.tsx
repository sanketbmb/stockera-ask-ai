import { createFileRoute } from "@tanstack/react-router";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import { makePlaceholder } from "./post-query";

export const Route = createFileRoute("/admin/super")({
  head: () => ({ meta: [{ title: "Admin Console — Stockera" }] }),
  component: () => {
    const View = makePlaceholder("Super Admin Console", "Analyst approvals, platform analytics, and global settings.");
    return <RequireAdmin><View /></RequireAdmin>;
  },
});
