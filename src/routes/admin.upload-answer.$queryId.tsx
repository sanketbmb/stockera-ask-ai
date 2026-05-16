import { createFileRoute } from "@tanstack/react-router";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import VideoAnswerUpload from "@/pages/admin/VideoAnswerUpload";

export const Route = createFileRoute("/admin/upload-answer/$queryId")({
  head: () => ({ meta: [{ title: "Upload Video Answer — Stockera" }] }),
  component: () => <RequireAnalyst><VideoAnswerUpload /></RequireAnalyst>,
});
