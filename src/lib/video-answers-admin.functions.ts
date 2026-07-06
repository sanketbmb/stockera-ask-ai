// Stage 4F.3 APPLY-1 — Video answer authoring server functions.
//
// Admin/analyst only. This module NEVER writes to `video_entitlements` or
// `wallet_ledger`, never touches the legacy MP4 "Book Analyst Video ₹100"
// pipeline (answers.video_url / video_thumbnail / duration_seconds), and
// never reads through the unlock RPC. It writes only the YouTube-family
// authoring columns on `answers` plus the three additive columns shipped in
// the 4F.3 migration (question_addressed_override, video_title, video_description).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseYoutubeId } from "@/lib/youtube-id";

// -------- pricing bounds (enforced server-side; PLAN §B) --------
const PRICE_FLOOR = 49;
const PRICE_CEILING = 999;

// -------- role helpers (lazy admin client per stack rules) --------
async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function userIsAdmin(userId: string): Promise<boolean> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

async function userIsAnalyst(userId: string): Promise<boolean> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "analyst")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

async function assertStaff(userId: string): Promise<{ isAdmin: boolean; isAnalyst: boolean }> {
  const [isAdmin, isAnalyst] = await Promise.all([userIsAdmin(userId), userIsAnalyst(userId)]);
  if (!isAdmin && !isAnalyst) throw new Error("Forbidden: admin or analyst role required");
  return { isAdmin, isAnalyst };
}

/** Load an analyst_profile row and confirm SEBI reg is set. */
async function loadAnalystOrThrow(expertId: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("analyst_profiles")
    .select("id, sebi_reg_number, display_name")
    .eq("id", expertId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Analyst not found");
  if (!data.sebi_reg_number || !String(data.sebi_reg_number).trim()) {
    throw new Error("Analyst has no SEBI registration on file");
  }
  return data;
}

/** Ensure analysts can only act on their own answers; admins may act on any. */
async function assertMayMutateAnswer(userId: string, answerId: string, isAdmin: boolean) {
  if (isAdmin) return;
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("answers")
    .select("id, expert_id")
    .eq("id", answerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Answer not found");
  if (data.expert_id !== userId) throw new Error("Forbidden: not the owning analyst");
}

async function writeAudit(
  actorId: string,
  eventType: string,
  answerId: string,
  payload: Record<string, unknown>,
) {
  const admin = await getAdmin();
  await admin.from("audit_events").insert({
    event_type: eventType,
    actor_id: actorId,
    resource_type: "answer",
    resource_id: answerId,
    payload: payload as never,
  });
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const priceSchema = z
  .number()
  .int()
  .min(PRICE_FLOOR, `Price must be at least ${PRICE_FLOOR} credits`)
  .max(PRICE_CEILING, `Price must be at most ${PRICE_CEILING} credits`);

const textOpt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

const syntheticQuerySchema = z.object({
  symbol: z.string().trim().min(1).max(32),
  stockName: z.string().trim().min(1).max(120),
  exchange: z.string().trim().max(16).optional(),
  questionText: z.string().trim().min(10).max(500),
});

const createDraftSchema = z
  .object({
    youtubeUrl: z.string().trim().min(1),
    expertId: z.string().uuid(),
    queryId: z.string().uuid().optional(),
    syntheticQuery: syntheticQuerySchema.optional(),
    priceCredits: priceSchema,
    verdict: textOpt(32),
    videoTitle: textOpt(140),
    videoDescription: textOpt(400),
    questionAddressedOverride: textOpt(500),
    videoDurationSec: z.number().int().min(1).max(60 * 60 * 4).optional(),
  })
  .refine((v) => v.queryId || v.syntheticQuery, {
    message: "Either queryId or syntheticQuery must be provided",
  });

const updateSchema = z.object({
  answerId: z.string().uuid(),
  patch: z.object({
    youtubeUrl: z.string().trim().min(1).optional(),
    verdict: textOpt(32),
    videoTitle: textOpt(140),
    videoDescription: textOpt(400),
    questionAddressedOverride: textOpt(500),
    videoDurationSec: z.number().int().min(1).max(60 * 60 * 4).optional(),
    priceCredits: priceSchema.optional(),
  }),
});

const answerIdSchema = z.object({ answerId: z.string().uuid() });

const listSchema = z.object({
  status: z.enum(["draft", "published", "all"]).default("all"),
  expertId: z.string().uuid().optional(),
  symbol: z.string().trim().max(32).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

const resolveSchema = z.object({ youtubeUrl: z.string().trim().min(1) });

// ---------------------------------------------------------------------------
// createSyntheticSeedQuery
//   Creates a queries row owned by the current staff user, flagged as a
//   video seed. NOT projected into the public library (is_public_library=false).
// ---------------------------------------------------------------------------
export const createSyntheticSeedQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => syntheticQuerySchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("queries")
      .insert({
        user_id: context.userId,
        stock_symbol: data.symbol.toUpperCase(),
        stock_name: data.stockName,
        query_text: data.questionText,
        query_type: "video_seed",
        is_public_library: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { queryId: row.id as string };
  });

// ---------------------------------------------------------------------------
// createVideoAnswerDraft
// ---------------------------------------------------------------------------
export const createVideoAnswerDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createDraftSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertStaff(context.userId);

    // Analysts may only publish under themselves.
    if (!isAdmin && data.expertId !== context.userId) {
      throw new Error("Forbidden: analysts can only author under their own profile");
    }

    const ytId = parseYoutubeId(data.youtubeUrl);
    if (!ytId) throw new Error("Invalid YouTube URL");

    await loadAnalystOrThrow(data.expertId);

    const admin = await getAdmin();

    // Duplicate check (partial unique index also enforces this).
    const { data: dup } = await admin
      .from("answers")
      .select("id")
      .eq("youtube_video_id", ytId)
      .eq("answer_type", "video")
      .limit(1)
      .maybeSingle();
    if (dup) throw new Error("This YouTube video is already attached to another video answer");

    // Resolve or create the linked query.
    let queryId = data.queryId ?? null;
    if (!queryId && data.syntheticQuery) {
      const { data: q, error: qErr } = await admin
        .from("queries")
        .insert({
          user_id: context.userId,
          stock_symbol: data.syntheticQuery.symbol.toUpperCase(),
          stock_name: data.syntheticQuery.stockName,
          query_text: data.syntheticQuery.questionText,
          query_type: "video_seed",
          is_public_library: false,
        })
        .select("id")
        .single();
      if (qErr) throw new Error(qErr.message);
      queryId = q.id;
    }
    if (!queryId) throw new Error("queryId or syntheticQuery required");

    const { data: inserted, error: insErr } = await admin
      .from("answers")
      .insert({
        query_id: queryId,
        expert_id: data.expertId,
        answer_type: "video",
        is_published: false,
        youtube_video_id: ytId,
        video_duration_sec: data.videoDurationSec ?? null,
        unlock_price_credits: data.priceCredits,
        verdict: data.verdict ?? null,
        video_title: data.videoTitle ?? null,
        video_description: data.videoDescription ?? null,
        question_addressed_override: data.questionAddressedOverride ?? null,
      })
      .select("id")
      .single();
    if (insErr) {
      // Postgres unique_violation
      if ((insErr as { code?: string }).code === "23505") {
        throw new Error("This YouTube video is already attached to another video answer");
      }
      throw new Error(insErr.message);
    }

    await writeAudit(context.userId, "video_answer.draft_created", inserted.id, {
      youtube_video_id: ytId,
      expert_id: data.expertId,
      query_id: queryId,
      unlock_price_credits: data.priceCredits,
    });

    return { answerId: inserted.id as string, queryId };
  });

// ---------------------------------------------------------------------------
// updateVideoAnswer
// ---------------------------------------------------------------------------
export const updateVideoAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertStaff(context.userId);
    await assertMayMutateAnswer(context.userId, data.answerId, isAdmin);

    const admin = await getAdmin();
    const { data: current, error: curErr } = await admin
      .from("answers")
      .select("id, answer_type, youtube_video_id, is_published")
      .eq("id", data.answerId)
      .maybeSingle();
    if (curErr) throw new Error(curErr.message);
    if (!current) throw new Error("Answer not found");
    if (current.answer_type !== "video") throw new Error("Not a video answer");

    const patch: Record<string, unknown> = {};
    let ytChange: { from: string | null; to: string } | null = null;

    if (data.patch.youtubeUrl !== undefined) {
      const ytId = parseYoutubeId(data.patch.youtubeUrl);
      if (!ytId) throw new Error("Invalid YouTube URL");
      if (ytId !== current.youtube_video_id) {
        if (current.is_published && !isAdmin) {
          throw new Error("Only admins may replace the YouTube link on a published video");
        }
        // Duplicate guard
        const { data: dup } = await admin
          .from("answers")
          .select("id")
          .eq("youtube_video_id", ytId)
          .eq("answer_type", "video")
          .neq("id", data.answerId)
          .limit(1)
          .maybeSingle();
        if (dup) throw new Error("This YouTube video is already attached to another video answer");
        patch.youtube_video_id = ytId;
        ytChange = { from: current.youtube_video_id, to: ytId };
      }
    }
    if (data.patch.verdict !== undefined) patch.verdict = data.patch.verdict ?? null;
    if (data.patch.videoTitle !== undefined) patch.video_title = data.patch.videoTitle ?? null;
    if (data.patch.videoDescription !== undefined) patch.video_description = data.patch.videoDescription ?? null;
    if (data.patch.questionAddressedOverride !== undefined)
      patch.question_addressed_override = data.patch.questionAddressedOverride ?? null;
    if (data.patch.videoDurationSec !== undefined) patch.video_duration_sec = data.patch.videoDurationSec;
    if (data.patch.priceCredits !== undefined) patch.unlock_price_credits = data.patch.priceCredits;

    if (Object.keys(patch).length === 0) return { answerId: data.answerId, updated: false };

    const { error: upErr } = await admin.from("answers").update(patch).eq("id", data.answerId);
    if (upErr) {
      if ((upErr as { code?: string }).code === "23505") {
        throw new Error("This YouTube video is already attached to another video answer");
      }
      throw new Error(upErr.message);
    }

    await writeAudit(context.userId, "video_answer.updated", data.answerId, {
      fields: Object.keys(patch),
      yt_change: ytChange,
    });

    return { answerId: data.answerId, updated: true };
  });

// ---------------------------------------------------------------------------
// publishVideoAnswer
// ---------------------------------------------------------------------------
export const publishVideoAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => answerIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertStaff(context.userId);
    await assertMayMutateAnswer(context.userId, data.answerId, isAdmin);

    // MVP: only admins may flip is_published=true (PLAN §B).
    if (!isAdmin) throw new Error("Forbidden: only admins may publish for now");

    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("answers")
      .select(
        "id, answer_type, youtube_video_id, query_id, expert_id, unlock_price_credits, video_duration_sec, video_description",
      )
      .eq("id", data.answerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Answer not found");
    if (row.answer_type !== "video") throw new Error("Not a video answer");

    const missing: string[] = [];
    if (!row.youtube_video_id) missing.push("youtube_video_id");
    if (!row.query_id) missing.push("query_id");
    if (!row.expert_id) missing.push("expert_id");
    if (!row.unlock_price_credits) missing.push("unlock_price_credits");
    if (!row.video_duration_sec) missing.push("video_duration_sec");
    if (!row.video_description || row.video_description.trim().length < 40) missing.push("video_description");
    if (missing.length) throw new Error(`Cannot publish — missing/invalid: ${missing.join(", ")}`);

    await loadAnalystOrThrow(row.expert_id);

    const { error: upErr } = await admin
      .from("answers")
      .update({ is_published: true })
      .eq("id", data.answerId);
    if (upErr) throw new Error(upErr.message);

    await writeAudit(context.userId, "video_answer.published", data.answerId, {});
    return { answerId: data.answerId, published: true };
  });

// ---------------------------------------------------------------------------
// unpublishVideoAnswer
// ---------------------------------------------------------------------------
export const unpublishVideoAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => answerIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertStaff(context.userId);
    await assertMayMutateAnswer(context.userId, data.answerId, isAdmin);

    const admin = await getAdmin();
    const { error } = await admin
      .from("answers")
      .update({ is_published: false })
      .eq("id", data.answerId)
      .eq("answer_type", "video");
    if (error) throw new Error(error.message);

    await writeAudit(context.userId, "video_answer.unpublished", data.answerId, {});
    return { answerId: data.answerId, published: false };
  });

// ---------------------------------------------------------------------------
// listAdminVideoAnswers
// ---------------------------------------------------------------------------
export const listAdminVideoAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertStaff(context.userId);
    const admin = await getAdmin();

    let query = admin
      .from("answers")
      .select(
        "id, expert_id, query_id, is_published, youtube_video_id, video_title, video_description, question_addressed_override, verdict, unlock_price_credits, video_duration_sec, created_at, queries:query_id(stock_symbol, stock_name, query_text), analyst_profiles:expert_id(display_name, sebi_reg_number)",
      )
      .eq("answer_type", "video")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (!isAdmin) query = query.eq("expert_id", context.userId);
    if (data.expertId) query = query.eq("expert_id", data.expertId);
    if (data.status === "draft") query = query.eq("is_published", false);
    if (data.status === "published") query = query.eq("is_published", true);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    let out = rows ?? [];
    if (data.symbol) {
      const s = data.symbol.toUpperCase();
      out = out.filter((r) => {
        const q = (r as { queries?: { stock_symbol?: string | null } }).queries;
        return q?.stock_symbol?.toUpperCase() === s;
      });
    }
    if (data.q) {
      const needle = data.q.toLowerCase();
      out = out.filter((r) => {
        const rr = r as {
          video_title?: string | null;
          question_addressed_override?: string | null;
          queries?: { stock_name?: string | null; query_text?: string | null };
        };
        return (
          rr.video_title?.toLowerCase().includes(needle) ||
          rr.question_addressed_override?.toLowerCase().includes(needle) ||
          rr.queries?.stock_name?.toLowerCase().includes(needle) ||
          rr.queries?.query_text?.toLowerCase().includes(needle)
        );
      });
    }
    return out;
  });

// ---------------------------------------------------------------------------
// resolveYoutubeMetadata
//   Best-effort oEmbed prefill. Failures are non-blocking; caller handles null.
// ---------------------------------------------------------------------------
export const resolveYoutubeMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => resolveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const ytId = parseYoutubeId(data.youtubeUrl);
    if (!ytId) throw new Error("Invalid YouTube URL");

    let title: string | null = null;
    let authorName: string | null = null;
    let thumbnailUrl: string | null = null;
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(
          `https://www.youtube.com/watch?v=${ytId}`,
        )}&format=json`,
        { headers: { accept: "application/json" } },
      );
      if (res.ok) {
        const j = (await res.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        title = j.title ?? null;
        authorName = j.author_name ?? null;
        thumbnailUrl = j.thumbnail_url ?? null;
      }
    } catch {
      // Non-blocking.
    }

    return {
      youtubeVideoId: ytId,
      posterThumb: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      title,
      authorName,
      thumbnailUrl,
    };
  });
