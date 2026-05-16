import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { makePlaceholder } from "@/components/common/Placeholder";

export const Route = createFileRoute("/referral")({
  head: () => ({ meta: [{ title: "Referrals — Stockera" }] }),
  component: () => {
    const View = makePlaceholder("Referral Program", "Earn ₹50 every time a friend joins and asks their first question.");
    return <RequireAuth><View /></RequireAuth>;
  },
});
