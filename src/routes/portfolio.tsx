import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy path — preserved for bookmarks. Redirects to /watchlist.
export const Route = createFileRoute("/portfolio")({
  beforeLoad: () => {
    throw redirect({ to: "/watchlist", replace: true });
  },
});
