import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/videos/$answerId/edit")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/compose-video" as never,
      search: { answerId: params.answerId } as never,
    });
  },
  component: () => null,
});
