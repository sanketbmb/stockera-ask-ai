import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/upload-answer/$queryId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/compose-video" as never,
      search: { queryId: params.queryId } as never,
    });
  },
  component: () => null,
});
