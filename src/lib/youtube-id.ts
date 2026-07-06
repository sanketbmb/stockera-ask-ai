// Stage 4F.3 — Pure YouTube URL → 11-char video ID parser.
// Used by both server functions (URL validation, dedup) and client editor.
// No side effects, no network. Safe for SSR + client bundles.

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract the 11-character YouTube video ID from a URL string.
 * Supports:
 *   - https://www.youtube.com/watch?v=<id>       (with any extra params)
 *   - https://youtu.be/<id>                       (short link)
 *   - https://www.youtube.com/shorts/<id>         (shorts)
 *   - https://www.youtube.com/embed/<id>          (embed)
 *   - https://youtube.com/live/<id>               (live permalink, treated same)
 *   - Optional leading/trailing whitespace and http/https/protocol-less URLs
 * Returns null for anything else.
 */
export function parseYoutubeId(input: string | null | undefined): string | null {
  if (!input || typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  // If they pasted a bare 11-char ID, accept it.
  if (ID_RE.test(raw)) return raw;

  let u: URL;
  try {
    // Add protocol if missing so URL() accepts host-only paste.
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtu.be" && host !== "youtube-nocookie.com") {
    return null;
  }

  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    return id && ID_RE.test(id) ? id : null;
  }

  // youtube.com/watch?v=<id>
  if (u.pathname === "/watch") {
    const v = u.searchParams.get("v");
    return v && ID_RE.test(v) ? v : null;
  }

  // /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && ["shorts", "embed", "live", "v"].includes(parts[0])) {
    return ID_RE.test(parts[1]) ? parts[1] : null;
  }

  return null;
}

export function isValidYoutubeId(id: string | null | undefined): boolean {
  return typeof id === "string" && ID_RE.test(id);
}
