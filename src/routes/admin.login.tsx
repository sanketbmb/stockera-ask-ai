import { createFileRoute } from "@tanstack/react-router";
import AdminLogin from "@/pages/admin/AdminLogin";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin & Expert Portal — Stockera" }] }),
  component: AdminLogin,
});
