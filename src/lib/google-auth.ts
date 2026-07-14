import { supabase } from "@/integrations/supabase/client";

/**
 * Safe same-origin path used as post-auth destination.
 * Rejects protocol-relative (//host), absolute URLs, and non-/ inputs.
 */
export function sanitizeNext(next: unknown): string {
  if (typeof next !== "string") return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

/**
 * Kick off Google OAuth. Session is finalized at /auth/callback which then
 * navigates to `next` (or /dashboard).
 */
export async function startGoogleOAuth(next?: string) {
  const target = sanitizeNext(next);
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`;
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
}
