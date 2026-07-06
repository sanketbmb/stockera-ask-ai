import { createFileRoute } from "@tanstack/react-router";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import CuratedEditor from "@/pages/admin/CuratedEditor";

export const Route = createFileRoute("/admin/curated/new")({
  head: () => ({
    meta: [
      { title: "New Curated Item — Stockera Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <RequireAnalyst><CuratedEditor /></RequireAnalyst>,
});
