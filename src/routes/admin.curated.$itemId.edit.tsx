import { createFileRoute } from "@tanstack/react-router";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import CuratedEditor from "@/pages/admin/CuratedEditor";

export const Route = createFileRoute("/admin/curated/$itemId/edit")({
  head: () => ({
    meta: [
      { title: "Edit Curated Item — Stockera Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => {
    const { itemId } = Route.useParams();
    return <RequireAnalyst><CuratedEditor itemId={itemId} /></RequireAnalyst>;
  },
});
