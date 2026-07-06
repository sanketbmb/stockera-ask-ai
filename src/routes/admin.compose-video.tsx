// Stage 4G APPLY-2 — Route for the unified RA video composer (draft-only).
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import VideoComposer from "@/pages/admin/VideoComposer";

const search = z.object({
  queryId: fallback(z.string().uuid().optional(), undefined).default(undefined),
  answerId: fallback(z.string().uuid().optional(), undefined).default(undefined),
  savedAnswerId: fallback(z.string().uuid().optional(), undefined).default(undefined),
});

export const Route = createFileRoute("/admin/compose-video")({
  validateSearch: zodValidator(search),
  head: () => ({
    meta: [
      { title: "Compose Video Answer — Stockera Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <RequireAnalyst>
      <VideoComposer />
    </RequireAnalyst>
  ),
});
