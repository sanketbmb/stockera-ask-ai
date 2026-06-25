import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import AnalystPublicProfile from "@/pages/AnalystPublicProfile";

function AnalystRouteComponent() {
  const { analystId } = useParams({ from: "/analyst/$analystId" });

  // HARD-STOP-SAFE MICRO-FIX — force top of page on every analystId change so
  // /analyst/<id> never opens deep-scrolled.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [analystId]);

  return <AnalystPublicProfile />;
}

export const Route = createFileRoute("/analyst/$analystId")({
  head: () => ({ meta: [{ title: "SEBI Analyst — Stockera" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AnalystRouteComponent,
});
