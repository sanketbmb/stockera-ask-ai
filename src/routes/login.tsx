import { createFileRoute } from "@tanstack/react-router";
import Login from "@/pages/auth/Login";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign In — Ask The Expert by Stockera" }, { name: "robots", content: "noindex,nofollow" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: Login,
});
