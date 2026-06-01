// Action bucket thresholds — extracted verbatim from generate-stock-analysis
// (pre-audit baseline). FROZEN; do NOT mutate without bumping the version id.
// Mission 1 Part E · Fix 2 (versioning only, no retune).

export type ActionBucketVersionId = "bucket_v1";

export type Action = "BUY" | "HOLD" | "WATCHLIST" | "SELL" | "AVOID";

export type ActionBucketThresholds = {
  // Inclusive lower-bound on overall_score (0–100) for each action.
  BUY: number;
  HOLD: number;
  WATCHLIST: number;
  SELL: number;
  // AVOID is implicit (score below SELL).
};

export type ActionBucketVersion = {
  id: ActionBucketVersionId;
  thresholds: ActionBucketThresholds;
  created_at: string;
  author: string;
  frozen: true;
};

export const ACTION_BUCKETS: Record<ActionBucketVersionId, ActionBucketVersion> = {
  bucket_v1: {
    id: "bucket_v1",
    thresholds: { BUY: 75, HOLD: 60, WATCHLIST: 45, SELL: 30 },
    created_at: "2026-06-01T00:00:00Z",
    author: "system_extracted_v1",
    frozen: true,
  },
};

export const ACTIVE_ACTION_BUCKET: ActionBucketVersionId = "bucket_v1";

export function actionFromScore(
  score: number,
  versionId: ActionBucketVersionId = ACTIVE_ACTION_BUCKET,
): Action {
  const t = ACTION_BUCKETS[versionId].thresholds;
  if (score >= t.BUY) return "BUY";
  if (score >= t.HOLD) return "HOLD";
  if (score >= t.WATCHLIST) return "WATCHLIST";
  if (score >= t.SELL) return "SELL";
  return "AVOID";
}
