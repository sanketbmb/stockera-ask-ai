import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import Topup from "@/pages/Topup";

export const Route = createFileRoute("/topup")({
  head: () => ({ meta: [{ title: "Top up — Stockera" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <RequireAuth><Topup /></RequireAuth>,
});
