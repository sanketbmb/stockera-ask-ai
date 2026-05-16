import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import PostQueryPage from "@/pages/PostQuery";

export const Route = createFileRoute("/post-query")({
  head: () => ({ meta: [{ title: "Ask a Question — Stockera" }, { name: "description", content: "Submit your stock question. AI report instantly, expert video within 24h." }] }),
  component: () => <RequireAuth><PostQueryPage /></RequireAuth>,
});
