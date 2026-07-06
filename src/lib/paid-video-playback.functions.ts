import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { redactSignedUrl } from "@/lib/log-redaction";

/**
 * Mint a short-lived (90 s) signed URL for a paid stock_specific video
 * the caller has an entitlement for. The URL is NEVER logged.
 *
 * Wired to UI in APPLY-3.
 */
export const issuePaidVideoSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { answerId: string }) => data)
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = context as any;
    const supabase = ctx.supabase;
    const userId: string = ctx.userId;

    // 1) confirm entitlement + resolve storage path
    const { data: ent, error: entErr } = await supabase
      .from("video_entitlements")
      .select("id, answer_id, answers!inner(id, paid_video_storage_path, category, is_published)")
      .eq("user_id", userId)
      .eq("answer_id", data.answerId)
      .maybeSingle();

    if (entErr) throw new Error("entitlement_lookup_failed");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = ent as any;
    const answer = row?.answers;
    if (!row || !answer || answer.category !== "stock_specific" || !answer.is_published) {
      throw new Error("not_entitled");
    }
    const storagePath: string | null = answer.paid_video_storage_path;
    if (!storagePath) throw new Error("no_storage_path");

    // 2) mint signed URL via admin client, loaded inside handler
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("paid-videos")
      .createSignedUrl(storagePath, 90);

    if (signErr || !signed?.signedUrl) {
      // Never surface the raw provider error which may include URL fragments.
      // eslint-disable-next-line no-console
      console.error("sign_failed", {
        answerId: data.answerId,
        userId,
        reason: redactSignedUrl(String(signErr?.message ?? "unknown")),
      });
      throw new Error("sign_failed");
    }

    const expiresAt = new Date(Date.now() + 90 * 1000).toISOString();

    // Log only non-secret shape info; never the signed URL itself.
    // eslint-disable-next-line no-console
    console.log("paid_video_signed_url_issued", {
      answerId: data.answerId,
      userId,
      expiresInSec: 90,
    });

    return { url: signed.signedUrl, expiresAt };
  });
