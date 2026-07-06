// Stage 4G APPLY-5 — client-side ranking helpers for the Discover feed.
//
// Backend `list_discover_feed` already returns rows sorted by a freshness +
// content-type score. This module adds:
//   - diversify(): guardrail that avoids more than N consecutive items of
//     the same content_type by shuffling the tail forward.
//   - formatFreshness(): human-readable "3h ago / 2d ago".
//   - contentTypeMeta(): label + accent for a given content_type.

export type DiscoverContentType = "ra_video" | "curated" | "ai_report";

export interface DiscoverFeedRow {
  item_id: string;
  content_type: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  stock_master_id: string | null;
  published_at: string | null;
  score: number | null;
}

/**
 * Prevent more than `maxConsecutive` (default 2) items of the same
 * content_type in a row. Stable: preserves relative order within each type.
 * If we cannot find a next-different item within the tail, we accept the
 * repeat and continue.
 */
export function diversify<T extends { content_type: string }>(
  rows: T[],
  maxConsecutive = 2,
): T[] {
  if (rows.length <= maxConsecutive) return rows.slice();
  const out: T[] = [];
  const pool = rows.slice();
  let lastType: string | null = null;
  let streak = 0;

  while (pool.length > 0) {
    let pickIdx = 0;
    if (lastType && streak >= maxConsecutive) {
      const differentIdx = pool.findIndex((r) => r.content_type !== lastType);
      if (differentIdx !== -1) pickIdx = differentIdx;
    }
    const picked = pool.splice(pickIdx, 1)[0];
    out.push(picked);
    if (picked.content_type === lastType) streak += 1;
    else { streak = 1; lastType = picked.content_type; }
  }
  return out;
}

export function formatFreshness(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffSec = Math.max(0, (Date.now() - t) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 30) return `${Math.round(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function contentTypeMeta(t: string): {
  label: string;
  short: string;
  accent: string;
} {
  switch (t) {
    case "ra_video":  return { label: "Analyst video", short: "Video",  accent: "bg-primary/15 text-primary" };
    case "curated":   return { label: "Curated",       short: "News",   accent: "bg-accent/15 text-accent" };
    case "ai_report": return { label: "AI report",     short: "Report", accent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" };
    default:          return { label: t,               short: t,        accent: "bg-muted text-muted-foreground" };
  }
}

export function itemHrefFor(row: DiscoverFeedRow): { path: string; params?: Record<string, string> } | null {
  const [kind, id] = row.item_id.split(":");
  if (!id) return null;
  if (kind === "ra_video") return { path: "/general/$answerId", params: { answerId: id } };
  if (kind === "curated")  return { path: "/curated/$itemId",   params: { itemId: id } };
  if (kind === "ai_report") return { path: "/report/$queryId",  params: { queryId: id } };
  return null;
}
