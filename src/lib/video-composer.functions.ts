// Stage 4G APPLY-2 — Unified video-composer draft-save server function.
//
// DRAFT-ONLY. This function NEVER publishes; it always inserts with
// is_published=false. It NEVER touches wallet_ledger, video_entitlements,
// unlock RPCs, curated tables, or discover surfaces.
//
// Categories:
//   - "general"        : no stock, no price required; YouTube external ok.
//   - "stock_specific" : stock + price required; YouTube external rejected.
//
// Source kinds:
//   - "upload"   : client uploaded file to paid-videos bucket first; server
//                  records the storage path and thumbnail path.
//   - "record"   : same shape as upload — client records in browser then
//                  uploads to paid-videos.
//   - "external" : an external link (YouTube for general only, or a generic
//                  non-YouTube URL). Server extracts YouTube ID when present.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseYoutubeId } from "@/lib/youtube-id";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertStaff(userId: string): Promise<{ isAdmin: boolean }> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "analyst"]);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r) => r.role as string);
  if (!roles.length) throw new Error("Forbidden: admin or analyst role required");
  return { isAdmin: roles.includes("admin") };
}

const uploadSource = z.object({
  kind: z.literal("upload"),
  storagePath: z.string().trim().min(1),
  thumbnailStoragePath: z.string().trim().min(1).nullable().optional(),
  durationSec: z.number().int().min(1).max(60 * 60 * 4).optional(),
});
const recordSource = z.object({
  kind: z.literal("record"),
  storagePath: z.string().trim().min(1),
  thumbnailStoragePath: z.string().trim().min(1).nullable().optional(),
  durationSec: z.number().int().min(1).max(60 * 60 * 4).optional(),
});
const externalSource = z.object({
  kind: z.literal("external"),
  externalUrl: z.string().trim().url().max(500),
});
const sourceSchema = z.discriminatedUnion("kind", [uploadSource, recordSource, externalSource]);

const stockSchema = z.object({
  symbol: z.string().trim().min(1).max(32),
  stockName: z.string().trim().min(1).max(120),
  stockMasterId: z.string().uuid().optional(),
});

const payloadSchema = z
  .object({
    category: z.enum(["general", "stock_specific"]),
    title: z.string().trim().min(1).max(140),
    description: z.string().trim().min(40).max(400),
    questionAddressed: z.string().trim().max(500).optional(),
    expertId: z.string().uuid(),
    source: sourceSchema,
    stock: stockSchema.optional(),
    priceCredits: z.number().int().min(49).max(999).optional(),
    queryId: z.string().uuid().optional(),
    customThumbnailPath: z.string().trim().min(1).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.category === "stock_specific") {
      if (!v.stock) ctx.addIssue({ code: "custom", path: ["stock"], message: "Stock is required for stock_specific" });
      if (!v.priceCredits) ctx.addIssue({ code: "custom", path: ["priceCredits"], message: "Price is required for stock_specific" });
      if (v.source.kind === "external") {
        const yt = parseYoutubeId(v.source.externalUrl);
        if (yt) {
          ctx.addIssue({
            code: "custom",
            path: ["source"],
            message: "YouTube links are not allowed for stock_specific videos. Upload or record instead.",
          });
        }
      }
    }
  });

export const saveVideoComposerDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => payloadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertStaff(context.userId);
    if (!isAdmin && data.expertId !== context.userId) {
      throw new Error("Forbidden: analysts can only author under their own profile");
    }

    const admin = await getAdmin();

    // Resolve linked query
    let queryId: string | null = data.queryId ?? null;
    if (data.category === "stock_specific" && !queryId && data.stock) {
      const seedText = data.questionAddressed?.trim() || data.title;
      const { data: q, error: qErr } = await admin
        .from("queries")
        .insert({
          user_id: context.userId,
          stock_symbol: data.stock.symbol.toUpperCase(),
          stock_name: data.stock.stockName,
          query_text: seedText,
          query_type: "video_seed",
          is_public_library: false,
        })
        .select("id")
        .single();
      if (qErr) throw new Error(qErr.message);
      queryId = q.id;
    }
    // general category: query_id remains null (allowed by APPLY-1 hardening)

    // Assemble source-specific columns
    const insert: Record<string, unknown> = {
      answer_type: "video",
      is_published: false,
      expert_id: data.expertId,
      query_id: queryId,
      category: data.category,
      video_title: data.title,
      video_description: data.description,
      question_addressed_override: data.questionAddressed ?? null,
      custom_thumbnail_url: data.customThumbnailPath ?? null,
    };
    if (data.category === "stock_specific" && data.stock) {
      insert.stock_master_id = data.stock.stockMasterId ?? null;
      insert.unlock_price_credits = data.priceCredits ?? null;
    }

    if (data.source.kind === "upload" || data.source.kind === "record") {
      insert.source_kind = data.source.kind;
      insert.paid_video_storage_path = data.source.storagePath;
      insert.video_thumbnail = data.source.thumbnailStoragePath ?? null;
      insert.video_duration_sec = data.source.durationSec ?? null;
    } else {
      insert.source_kind = "external";
      const yt = parseYoutubeId(data.source.externalUrl);
      if (yt) {
        insert.youtube_video_id = yt;
        insert.external_provider = "youtube";
        insert.external_url = data.source.externalUrl;
      } else {
        insert.external_provider = "link";
        insert.external_url = data.source.externalUrl;
      }
    }

    const { data: row, error } = await admin
      .from("answers")
      .insert(insert as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await admin.from("audit_events").insert({
      event_type: "video_composer.draft_saved",
      actor_id: context.userId,
      resource_type: "answer",
      resource_id: row.id,
      payload: {
        category: data.category,
        source_kind: data.source.kind,
        query_id: queryId,
      } as never,
    });

    return { answerId: row.id as string, queryId };
  });
