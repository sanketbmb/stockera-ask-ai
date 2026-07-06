// Stage 4F.2 APPLY-1 — thin hook wrapper around the 4F.1 `getVideoAnswer`
// server fn. Present in APPLY-1 for downstream consumers; not called by any
// APPLY-1 surface (logged-in state is a static "Unlock coming soon" teaser).
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVideoAnswer } from "@/lib/video-answers.functions";

export function useVideoAnswer(answerId: string | null | undefined, enabled = true) {
  const fn = useServerFn(getVideoAnswer);
  return useQuery({
    queryKey: ["video-answer", answerId],
    enabled: enabled && !!answerId,
    staleTime: 60_000,
    queryFn: () => fn({ data: { answerId: answerId! } }),
  });
}
