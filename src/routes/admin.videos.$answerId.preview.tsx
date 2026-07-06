import { createFileRoute, useParams } from "@tanstack/react-router";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import VideoAnswerPreview from "@/pages/admin/VideoAnswerPreview";

export const Route = createFileRoute("/admin/videos/$answerId/preview")({
  head: () => ({
    meta: [
      { title: "Preview Video Answer — Stockera Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PreviewRoute,
});

function PreviewRoute() {
  const { answerId } = useParams({ from: "/admin/videos/$answerId/preview" });
  return (
    <RequireAnalyst>
      <VideoAnswerPreview answerId={answerId} />
    </RequireAnalyst>
  );
}
