import { createFileRoute } from "@tanstack/react-router";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import VideoAnswerEditor from "@/pages/admin/VideoAnswerEditor";

export const Route = createFileRoute("/admin/videos/new")({
  head: () => ({
    meta: [
      { title: "New Video Answer — Stockera Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <RequireAnalyst>
      <VideoAnswerEditor mode="new" />
    </RequireAnalyst>
  ),
});
