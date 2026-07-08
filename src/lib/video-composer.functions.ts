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
    // APPLY-3: optional target answerId for update (edit flow).
    answerId: z.string().uuid().optional(),
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

function buildInsert(data: z.infer<typeof payloadSchema>, queryId: string | null, resolvedStockMasterId: string | null): Record<string, unknown> {
  const insert: Record<string, unknown> = {
    answer_type: "video",
    expert_id: data.expertId,
    query_id: queryId,
    category: data.category,
    video_title: data.title,
    video_description: data.description,
    question_addressed_override: data.questionAddressed ?? null,
    custom_thumbnail_url: data.customThumbnailPath ?? null,
  };
  insert.stock_master_id = resolvedStockMasterId;
  if (data.category === "stock_specific") {
    insert.unlock_price_credits = data.priceCredits ?? null;
  } else {
    insert.unlock_price_credits = null;
  }
  if (data.source.kind === "upload" || data.source.kind === "record") {
    insert.source_kind = data.source.kind;
    insert.paid_video_storage_path = data.source.storagePath;
    insert.video_thumbnail = data.source.thumbnailStoragePath ?? null;
    insert.video_duration_sec = data.source.durationSec ?? undefined;
    insert.external_url = null;
    insert.external_provider = null;
    insert.youtube_video_id = null;
  } else {
    insert.source_kind = "external";
    insert.paid_video_storage_path = null;
    const yt = parseYoutubeId(data.source.externalUrl);
    if (yt) {
      insert.youtube_video_id = yt;
      insert.external_provider = "youtube";
      insert.external_url = data.source.externalUrl;
    } else {
      insert.youtube_video_id = null;
      insert.external_provider = "link";
      insert.external_url = data.source.externalUrl;
    }
  }
  return insert;
}

// Resolve `symbol → stock_master.id` server-side. SymbolPicker only sends
// { symbol, name } from the client, so we look up the canonical master row
// (NSE preferred over BSE, matching resolveStockBySymbol semantics).
async function resolveStockMasterId(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  data: z.infer<typeof payloadSchema>,
): Promise<string | null> {
  if (!data.stock) return null;
  if (data.stock.stockMasterId) return data.stock.stockMasterId;
  const sym = data.stock.symbol.trim().toUpperCase();
  const { data: rows } = await admin
    .from("stock_master")
    .select("id, exchange")
    .ilike("symbol", sym)
    .in("exchange", ["NSE", "BSE"])
    .limit(4);
  if (!rows || rows.length === 0) return null;
  const nse = rows.find((r) => r.exchange === "NSE");
  return ((nse ?? rows[0]).id as string) ?? null;
}

export const saveVideoComposerDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => payloadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertStaff(context.userId);
    if (!isAdmin && data.expertId !== context.userId) {
      throw new Error("Forbidden: analysts can only author under their own profile");
    }
    const admin = await getAdmin();

    let queryId: string | null = data.queryId ?? null;
    if (data.category === "stock_specific" && !queryId && data.stock && !data.answerId) {
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

    const resolvedStockMasterId = await resolveStockMasterId(admin, data);
    const base = buildInsert(data, queryId, resolvedStockMasterId);
    let answerId: string;
    if (data.answerId) {
      const { data: existing, error: readErr } = await admin
        .from("answers")
        .select("id, expert_id, query_id")
        .eq("id", data.answerId)
        .maybeSingle();
      if (readErr || !existing) throw new Error("Draft not found");
      if (!isAdmin && existing.expert_id !== context.userId) {
        throw new Error("Forbidden: not your draft");
      }
      const patch = { ...base } as Record<string, unknown>;
      if (existing.query_id && !queryId) patch.query_id = existing.query_id;
      const { error: upErr } = await admin
        .from("answers")
        .update(patch as never)
        .eq("id", data.answerId);
      if (upErr) throw new Error(upErr.message);
      answerId = data.answerId;
    } else {
      const insert = { ...base, is_published: false };
      const { data: row, error } = await admin
        .from("answers")
        .insert(insert as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      answerId = row.id as string;
    }

    await admin.from("audit_events").insert({
      event_type: data.answerId ? "video_composer.draft_updated" : "video_composer.draft_saved",
      actor_id: context.userId,
      resource_type: "answer",
      resource_id: answerId,
      payload: {
        category: data.category,
        source_kind: data.source.kind,
        query_id: queryId,
      } as never,
    });
    return { answerId, queryId };
  });

// ---------------------------------------------------------------------------
// APPLY-3: publishComposerVideoAnswer — category-aware publish. Never touches
// wallet_ledger, video_entitlements, curated, discover, or 4F.1 RPCs.
// ---------------------------------------------------------------------------
export const publishComposerVideoAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ answerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertStaff(context.userId);
    const admin = await getAdmin();

    const { data: row, error } = await admin
      .from("answers")
      .select(
        "id, expert_id, answer_type, category, source_kind, external_provider, external_url, youtube_video_id, paid_video_storage_path, video_title, video_description, unlock_price_credits, stock_master_id, query_id, is_published",
      )
      .eq("id", data.answerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Answer not found");
    if (row.answer_type !== "video") throw new Error("Not a video answer");
    if (!isAdmin && row.expert_id !== context.userId) throw new Error("Forbidden: not your draft");
    if (!isAdmin) throw new Error("Forbidden: only admins may publish");

    const missing: string[] = [];
    if (!row.video_title?.trim()) missing.push("video_title");
    if (!row.video_description || row.video_description.trim().length < 40) missing.push("video_description");
    if (!row.expert_id) missing.push("expert_id");

    const kind = row.source_kind ?? "external";
    if (kind === "upload" || kind === "record") {
      if (!row.paid_video_storage_path) missing.push("paid_video_storage_path");
    } else {
      if (!row.external_url) missing.push("external_url");
    }
    if (row.category === "stock_specific") {
      if (!row.unlock_price_credits) missing.push("unlock_price_credits");
      if (!row.stock_master_id) missing.push("stock_master_id");
      if (!row.query_id) missing.push("query_id");
      if (row.external_provider === "youtube") {
        throw new Error("YouTube is not allowed for stock_specific videos");
      }
    } else if (row.category !== "general") {
      throw new Error("Unknown category");
    }
    if (missing.length) throw new Error(`Cannot publish — missing: ${missing.join(", ")}`);

    const { error: upErr } = await admin
      .from("answers")
      .update({ is_published: true })
      .eq("id", data.answerId);
    if (upErr) throw new Error(upErr.message);

    await admin.from("audit_events").insert({
      event_type: "video_composer.published",
      actor_id: context.userId,
      resource_type: "answer",
      resource_id: data.answerId,
      payload: { category: row.category, source_kind: kind } as never,
    });
    return { answerId: data.answerId, published: true, category: row.category };
  });

// ---------------------------------------------------------------------------
// APPLY-3: loadComposerDraft — fetch a row for edit prefill.
// ---------------------------------------------------------------------------
export const loadComposerDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ answerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertStaff(context.userId);
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("answers")
      .select(
        "id, expert_id, query_id, category, source_kind, external_provider, external_url, youtube_video_id, paid_video_storage_path, video_thumbnail, custom_thumbnail_url, video_title, video_description, question_addressed_override, unlock_price_credits, stock_master_id, video_duration_sec, is_published, stock_master:stock_master_id(id, symbol, company_name), queries:query_id(id, stock_symbol, stock_name, query_text)",
      )
      .eq("id", data.answerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");
    if (!isAdmin && row.expert_id !== context.userId) throw new Error("Forbidden");
    return row;
  });
