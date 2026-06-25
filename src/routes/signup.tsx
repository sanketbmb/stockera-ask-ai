import { createFileRoute } from "@tanstack/react-router";
import Signup from "@/pages/auth/Signup";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign Up — Ask The Expert by Stockera" }, { name: "robots", content: "noindex,nofollow" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    ref: typeof search.ref === "string" ? search.ref : undefined,
  }),
  component: Signup,
});
