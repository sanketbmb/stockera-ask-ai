import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import Referral from "@/pages/Referral";

export const Route = createFileRoute("/referral")({
  head: () => ({ meta: [{ title: "Refer & Earn — Stockera" }] }),
  component: () => <RequireAuth><Referral /></RequireAuth>,
});
