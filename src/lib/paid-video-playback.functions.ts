import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { redactSignedUrl } from "@/lib/log-redaction";
import { z } from "zod";

const answerIdInput = z.object({ answerId: z.string().uuid() });

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Confirm entitlement OR admin/analyst-authoring rights, resolve the row,
 * and return the actual playable source for a paid stock_specific answer.
 *
 * Anti-leak: this function must NEVER be called for locked callers. It
 * verifies entitlement (or authoring) server-side before returning URLs.
 * Signed URLs are 90 s TTL and never logged.
 */
export const getPaidVideoPlayback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => answerIdInput.parse(input))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = context as any;
    const userId: string = ctx.userId;
    const admin = await loadAdmin();

    const { data: row, error } = await admin
      .from("answers")
      .select(
        "id, expert_id, category, is_published, answer_type, source_kind, external_provider, external_url, youtube_video_id, paid_video_storage_path",
      )
      .eq("id", data.answerId)
      .maybeSingle();
    if (error || !row) throw new Error("not_found");
    if (row.answer_type !== "video" || row.category !== "stock_specific" || !row.is_published) {
      throw new Error("not_entitled");
    }

    // Authoring shortcut: expert may play back their own row.
    let entitled = row.expert_id === userId;
    if (!entitled) {
      // Or user is admin.
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (roles) entitled = true;
    }
    if (!entitled) {
      const { data: ent } = await admin
        .from("video_entitlements")
        .select("id")
        .eq("user_id", userId)
        .eq("answer_id", data.answerId)
        .maybeSingle();
      if (ent) entitled = true;
    }
    if (!entitled) throw new Error("not_entitled");

    if (row.source_kind === "external") {
      if (row.youtube_video_id) {
        return { kind: "youtube" as const, videoId: row.youtube_video_id };
      }
      if (row.external_url) {
        return { kind: "external" as const, url: row.external_url };
      }
      throw new Error("no_playable_source");
    }

    // upload | record (legacy rows with NULL source_kind assumed 'external' above)
    const storagePath = row.paid_video_storage_path;
    if (!storagePath) throw new Error("no_storage_path");

    const { data: signed, error: signErr } = await admin.storage
      .from("paid-videos")
      .createSignedUrl(storagePath, 90);
    if (signErr || !signed?.signedUrl) {
      // eslint-disable-next-line no-console
      console.error("sign_failed", {
        answerId: data.answerId,
        userId,
        reason: redactSignedUrl(String(signErr?.message ?? "unknown")),
      });
      throw new Error("sign_failed");
    }
    // eslint-disable-next-line no-console
    console.log("paid_video_signed_url_issued", {
      answerId: data.answerId,
      userId,
      expiresInSec: 90,
    });
    return {
      kind: "signed" as const,
      url: signed.signedUrl,
      expiresAt: new Date(Date.now() + 90_000).toISOString(),
    };
  });

/**
 * Back-compat wrapper: existing callers of issuePaidVideoSignedUrl continue
 * to work. Under the hood, this is the storage-only path — errors out for
 * external source_kind rows.
 */
export const issuePaidVideoSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { answerId: string }) => data)
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = context as any;
    const userId: string = ctx.userId;
    const admin = await loadAdmin();

    const { data: ent, error: entErr } = await admin
      .from("video_entitlements")
      .select("id, answer_id, answers!inner(id, paid_video_storage_path, category, is_published)")
      .eq("user_id", userId)
      .eq("answer_id", data.answerId)
      .maybeSingle();
    if (entErr) throw new Error("entitlement_lookup_failed");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const answer = (ent as any)?.answers;
    if (!ent || !answer || answer.category !== "stock_specific" || !answer.is_published) {
      throw new Error("not_entitled");
    }
    if (!answer.paid_video_storage_path) throw new Error("no_storage_path");

    const { data: signed, error: signErr } = await admin.storage
      .from("paid-videos")
      .createSignedUrl(answer.paid_video_storage_path, 90);
    if (signErr || !signed?.signedUrl) {
      // eslint-disable-next-line no-console
      console.error("sign_failed", {
        answerId: data.answerId,
        userId,
        reason: redactSignedUrl(String(signErr?.message ?? "unknown")),
      });
      throw new Error("sign_failed");
    }
    // eslint-disable-next-line no-console
    console.log("paid_video_signed_url_issued", {
      answerId: data.answerId,
      userId,
      expiresInSec: 90,
    });
    return { url: signed.signedUrl, expiresAt: new Date(Date.now() + 90_000).toISOString() };
  });
