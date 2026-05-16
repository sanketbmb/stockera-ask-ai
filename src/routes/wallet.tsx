import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { makePlaceholder } from "./post-query";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "Wallet — Stockera" }] }),
  component: () => {
    const View = makePlaceholder("Wallet", "Top up credits and view your transaction history.");
    return <RequireAuth><View /></RequireAuth>;
  },
});
