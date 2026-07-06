import { createFileRoute } from "@tanstack/react-router";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import CuratedList from "@/pages/admin/CuratedList";

export const Route = createFileRoute("/admin/curated")({
  head: () => ({
    meta: [
      { title: "Curated Media — Stockera Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <RequireAnalyst><CuratedList /></RequireAnalyst>,
});
