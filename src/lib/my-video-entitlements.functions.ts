// Stage 4F.2 APPLY-2 — My Queries read helper for the caller's own unlocked
// videos. This is the ONE approved non-4F.1 read path (founder decision #1).
//
// Contract:
//   • Auth-only via requireSupabaseAuth (personal list — never anon).
//   • Returns ONLY safe display metadata for cards.
//   • NEVER returns youtube_video_id, embed URL, or any playable field.
//     Playback truth remains getVideoAnswer (4F.1) called from /v/$answerId.
//   • poster_thumb is derived from youtube_video_id server-side (same
//     i.ytimg.com public artifact as 4F.1) — the raw id is stripped.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface MyUnlockedVideo {
  answerId: string;
  queryId: string | null;
  symbol: string | null;
  stockName: string | null;
  verdict: string | null;
  unlockPriceCredits: number | null;
  videoDurationSec: number | null;
  posterThumb: string | null;
  publishedAt: string | null;
  unlockedAt: string;
  creditsUsed: number;
}

export const listMyUnlockedVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyUnlockedVideo[]> => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    // 1) User-scoped read of video_entitlements via RLS.
    const { data: ents, error: entErr } = await supabase
      .from("video_entitlements")
      .select("answer_id, credits_used, unlocked_at")
      .eq("user_id", userId)
      .order("unlocked_at", { ascending: false });
    if (entErr) throw new Error(entErr.message);
    if (!ents?.length) return [];

    const answerIds = Array.from(new Set(ents.map((e: any) => e.answer_id as string)));

    // 2) Metadata fetch via admin client — RLS on `answers` is variable;
    // admin read is limited to the columns needed for a card, and the raw
    // youtube_video_id is dropped before returning (only poster_thumb URL
    // — the same public artifact 4F.1 already exposes — leaves the server).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error: aErr } = await supabaseAdmin
      .from("answers")
      .select(
        "id, query_id, verdict, unlock_price_credits, video_duration_sec, youtube_video_id, created_at",
      )
      .in("id", answerIds)
      .eq("answer_type", "video")
      .eq("is_published", true);
    if (aErr) throw new Error(aErr.message);

    const answerMap = new Map<string, any>();
    (rows ?? []).forEach((r: any) => answerMap.set(r.id, r));

    const queryIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.query_id).filter(Boolean)),
    ) as string[];
    let queryMap = new Map<string, { symbol: string | null; stockName: string | null }>();
    if (queryIds.length) {
      const { data: qs, error: qErr } = await supabaseAdmin
        .from("queries")
        .select("id, stock_symbol, stock_name")
        .in("id", queryIds);
      if (qErr) throw new Error(qErr.message);
      (qs ?? []).forEach((q: any) =>
        queryMap.set(q.id, { symbol: q.stock_symbol ?? null, stockName: q.stock_name ?? null }),
      );
    }

    return ents
      .map((e: any): MyUnlockedVideo | null => {
        const a = answerMap.get(e.answer_id);
        if (!a) return null;
        const q = a.query_id ? queryMap.get(a.query_id) : undefined;
        const posterThumb = a.youtube_video_id
          ? `https://i.ytimg.com/vi/${a.youtube_video_id}/hqdefault.jpg`
          : null;
        return {
          answerId: a.id,
          queryId: a.query_id ?? null,
          symbol: q?.symbol ?? null,
          stockName: q?.stockName ?? null,
          verdict: a.verdict ?? null,
          unlockPriceCredits: a.unlock_price_credits ?? null,
          videoDurationSec: a.video_duration_sec ?? null,
          posterThumb,
          publishedAt: a.created_at ?? null,
          unlockedAt: e.unlocked_at,
          creditsUsed: e.credits_used,
        };
      })
      .filter((x): x is MyUnlockedVideo => x !== null);
  });
