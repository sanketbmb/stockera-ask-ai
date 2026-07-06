import { createFileRoute } from "@tanstack/react-router";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import VideoAnswersList from "@/pages/admin/VideoAnswersList";

export const Route = createFileRoute("/admin/videos")({
  head: () => ({
    meta: [
      { title: "Video Answers — Stockera Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <RequireAnalyst><VideoAnswersList /></RequireAnalyst>,
});
