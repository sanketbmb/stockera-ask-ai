import { createFileRoute } from "@tanstack/react-router";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import { makePlaceholder } from "./post-query";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Expert Dashboard — Stockera" }] }),
  component: () => {
    const View = makePlaceholder("Expert Dashboard", "Your assigned queries, video uploads, and payout summary.");
    return <RequireAnalyst><View /></RequireAnalyst>;
  },
});
