/**
 * Shared helper to strip signed-URL secrets from any string before it hits a log,
 * error message, or telemetry payload. Used by paid-video playback code paths.
 *
 * Redacts:
 *  - `token=...` query params (Supabase Storage signed URLs)
 *  - `X-Amz-Signature=...` params
 *  - full Supabase storage object paths after `/object/sign/`
 */
export function redactSignedUrl(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);
  s = s.replace(/([?&](?:token|X-Amz-Signature|signature|sig))=[^&#]+/gi, "$1=REDACTED");
  s = s.replace(/\/object\/sign\/[^?\s]+/gi, "/object/sign/REDACTED");
  return s;
}
