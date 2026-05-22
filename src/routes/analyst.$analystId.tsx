import { createFileRoute } from "@tanstack/react-router";
import AnalystPublicProfile from "@/pages/AnalystPublicProfile";

export const Route = createFileRoute("/analyst/$analystId")({
  head: () => ({ meta: [{ title: "SEBI Analyst — Stockera" }] }),
  component: AnalystPublicProfile,
});
