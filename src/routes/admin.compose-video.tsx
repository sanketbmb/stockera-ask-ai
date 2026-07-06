// Stage 4G APPLY-2 — Route for the unified RA video composer (draft-only).
import { createFileRoute } from "@tanstack/react-router";
import { RequireAnalyst } from "@/components/auth/RequireAuth";
import VideoComposer from "@/pages/admin/VideoComposer";

interface ComposerSearch {
  queryId?: string;
  answerId?: string;
  savedAnswerId?: string;
}

export const Route = createFileRoute("/admin/compose-video")({
  validateSearch: (raw: Record<string, unknown>): ComposerSearch => {
    const pickStr = (k: string) => (typeof raw[k] === "string" && (raw[k] as string).length > 0 ? (raw[k] as string) : undefined);
    return {
      queryId: pickStr("queryId"),
      answerId: pickStr("answerId"),
      savedAnswerId: pickStr("savedAnswerId"),
    };
  },
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
