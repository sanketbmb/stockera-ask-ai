import { createFileRoute, useParams } from "@tanstack/react-router";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import VideoAnswerEditor from "@/pages/admin/VideoAnswerEditor";

export const Route = createFileRoute("/admin/videos/$answerId/edit")({
  head: () => ({
    meta: [
      { title: "Edit Video Answer — Stockera Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: EditRoute,
});

function EditRoute() {
  const { answerId } = useParams({ from: "/admin/videos/$answerId/edit" });
  return (
    <RequireAnalyst>
      <VideoAnswerEditor mode="edit" answerId={answerId} />
    </RequireAnalyst>
  );
}
