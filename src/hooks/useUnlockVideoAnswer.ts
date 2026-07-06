// Stage 4F.2 APPLY-2 — mutation hook wrapping the 4F.1 `unlockVideoAnswer`
// server fn. This is the ONLY unlock mutation path used by the UI.
//
// On success invalidates:
//   • ["video-answer", answerId]      → getVideoAnswer flips locked→unlocked
//   • ["my-unlocked-videos"]          → My Queries tab refreshes
//   • ["profile"] / auth refresh      → wallet balance chip updates
//
// Insufficient-funds and idempotent-replay responses are surfaced via the
// RPC's `status` field on the returned data (not thrown), so the modal can
// render distinct UX for each without a second network hop.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { unlockVideoAnswer } from "@/lib/video-answers.functions";

export interface UnlockResult {
  status: string; // "ok" | "already_unlocked" | "insufficient_credits" | ...
  entitlement_id?: string;
  credits_used?: number;
  new_balance?: number;
  balance?: number;
  required?: number;
}

export function useUnlockVideoAnswer(answerId: string | null | undefined) {
  const fn = useServerFn(unlockVideoAnswer);
  const qc = useQueryClient();
  return useMutation<UnlockResult, Error, void>({
    mutationFn: async () => {
      if (!answerId) throw new Error("Missing answerId");
      return (await fn({ data: { answerId } })) as UnlockResult;
    },
    onSuccess: async (res) => {
      if (!answerId) return;
      if (res.status === "ok" || res.status === "already_unlocked") {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["video-answer", answerId] }),
          qc.invalidateQueries({ queryKey: ["my-unlocked-videos"] }),
          qc.invalidateQueries({ queryKey: ["profile"] }),
        ]);
      }
    },
  });
}
