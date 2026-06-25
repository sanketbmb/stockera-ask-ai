import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import MyQueries from "@/pages/MyQueries";

export const Route = createFileRoute("/my-queries")({
  head: () => ({ meta: [{ title: "My Queries — Stockera" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <RequireAuth><MyQueries /></RequireAuth>,
});
