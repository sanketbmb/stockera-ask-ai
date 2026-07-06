import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/videos/new")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/compose-video" as never });
  },
  component: () => null,
});
