import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { makePlaceholder } from "@/components/common/Placeholder";

export const Route = createFileRoute("/my-queries")({
  head: () => ({ meta: [{ title: "My Queries — Stockera" }] }),
  component: () => {
    const View = makePlaceholder("My Queries", "All your AI reports and expert answers — in one place.");
    return <RequireAuth><View /></RequireAuth>;
  },
});
