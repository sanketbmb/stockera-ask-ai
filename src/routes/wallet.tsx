import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import Wallet from "@/pages/Wallet";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "Wallet — Stockera" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <RequireAuth><Wallet /></RequireAuth>,
});
