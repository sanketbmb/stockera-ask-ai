// Stage 4G APPLY-3 — Public playback surface for `category='general'` RA videos.
//
// NO auth. NO wallet. NO entitlement. Only reads answers where
//   category='general' AND is_published=true AND answer_type='video'.
//
// Never touches wallet_ledger / video_entitlements / unlock RPC / curated /
// discover / home surfaces. Signed URLs are short-lived (90 s) and NEVER
// logged (see log-redaction).
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { redactSignedUrl } from "@/lib/log-redaction";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

const answerIdInput = z.object({ answerId: z.string().uuid() });
const symbolInput = z.object({ symbol: z.string().trim().min(1).max(32) });

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Public metadata for a single published general answer.
 * Returns non-URL fields safe for anon consumption plus source hints.
 * For source_kind='upload'|'record', we return NO storage path — callers
 * must mint a signed URL via issuePublicGeneralSignedUrl.
 */
export const getPublicGeneralVideoAnswer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => answerIdInput.parse(input))
  .handler(async ({ data }) => {
    const admin = await loadAdmin();
    const { data: row, error } = await admin
      .from("answers")
      .select(
        "id, expert_id, category, is_published, answer_type, source_kind, external_provider, external_url, youtube_video_id, video_title, video_description, question_addressed_override, custom_thumbnail_url, video_duration_sec, created_at, analyst_profiles:expert_id(display_name, sebi_reg_number)",
      )
      .eq("id", data.answerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.answer_type !== "video" || row.category !== "general" || !row.is_published) {
      return { status: "not_found" as const };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ap = (row as any).analyst_profiles ?? null;
    return {
      status: "ok" as const,
      answer_id: row.id,
      title: row.video_title ?? "Analyst video",
      description: row.video_description ?? "",
      question_addressed: row.question_addressed_override,
      source_kind: (row.source_kind ?? "external") as "upload" | "record" | "external",
      external_provider: row.external_provider,
      youtube_video_id: row.youtube_video_id,
      // external_url returned ONLY for external source_kind — safe: general is free.
      external_url: row.source_kind === "external" ? row.external_url : null,
      thumbnail_url: row.custom_thumbnail_url,
      video_duration_sec: row.video_duration_sec,
      published_at: row.created_at,
      analyst: ap
        ? {
            display_name: ap.display_name as string | null,
            sebi_reg_number: ap.sebi_reg_number as string | null,
          }
        : null,
    };
  });

/**
 * Mint a short-lived (90 s) signed URL for a published general upload/record
 * asset. Public: no auth, no entitlement. Enforces category='general' AND
 * is_published=true so no paid/stock-specific storage can ever leak here.
 * The URL is never logged.
 */
export const issuePublicGeneralSignedUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => answerIdInput.parse(input))
  .handler(async ({ data }) => {
    const admin = await loadAdmin();
    const { data: row, error } = await admin
      .from("answers")
      .select("id, category, is_published, answer_type, source_kind, paid_video_storage_path")
      .eq("id", data.answerId)
      .maybeSingle();
    if (error) throw new Error("lookup_failed");
    if (
      !row ||
      row.answer_type !== "video" ||
      row.category !== "general" ||
      !row.is_published ||
      (row.source_kind !== "upload" && row.source_kind !== "record")
    ) {
      throw new Error("not_streamable");
    }
    const storagePath = row.paid_video_storage_path;
    if (!storagePath) throw new Error("no_storage_path");

    const { data: signed, error: signErr } = await admin.storage
      .from("paid-videos")
      .createSignedUrl(storagePath, 90);
    if (signErr || !signed?.signedUrl) {
      // eslint-disable-next-line no-console
      console.error("general_sign_failed", {
        answerId: data.answerId,
        reason: redactSignedUrl(String(signErr?.message ?? "unknown")),
      });
      throw new Error("sign_failed");
    }
    // eslint-disable-next-line no-console
    console.log("general_signed_url_issued", { answerId: data.answerId, expiresInSec: 90 });
    return { url: signed.signedUrl, expiresAt: new Date(Date.now() + 90_000).toISOString() };
  });

/**
 * List published general RA videos tagged to a given stock symbol.
 * Uses stock_master_id linkage on the answer. Public / anon-safe.
 */
export const listGeneralVideosForSymbol = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => symbolInput.parse(input))
  .handler(async ({ data }) => {
    const sb = publicClient();
    // Resolve symbol → stock_master_id via publishable client + narrow policy.
    const admin = await loadAdmin();
    const { data: sm } = await admin
      .from("stock_master")
      .select("id")
      .ilike("symbol", data.symbol)
      .limit(1)
      .maybeSingle();
    if (!sm?.id) return [];
    const { data: rows, error } = await sb
      .from("answers")
      .select(
        "id, video_title, video_description, source_kind, external_provider, youtube_video_id, custom_thumbnail_url, video_duration_sec, created_at",
      )
      .eq("category", "general")
      .eq("is_published", true)
      .eq("answer_type", "video")
      .eq("stock_master_id", sm.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return [];
    return (rows ?? []).map((r) => ({
      answer_id: r.id,
      title: r.video_title ?? "Analyst video",
      description: r.video_description ?? "",
      source_kind: r.source_kind,
      external_provider: r.external_provider,
      youtube_video_id: r.youtube_video_id,
      thumbnail_url: r.custom_thumbnail_url,
      video_duration_sec: r.video_duration_sec,
      published_at: r.created_at,
    }));
  });
