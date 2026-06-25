import { createFileRoute } from "@tanstack/react-router";
import LaunchChecklist from "@/pages/LaunchChecklist";

export const Route = createFileRoute("/dev-checklist")({
  head: () => ({ meta: [{ title: "Launch Checklist — Stockera" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: LaunchChecklist,
});
