// Stage 4F.2 APPLY-1 — shared CTA / hint copy for locked video surfaces.
// Kept as pure strings so every surface (stock page, library, MasterSearch)
// renders the exact same wording.

export const VIDEO_COPY = {
  anonCta: (credits: number) => `Sign in to unlock — ${credits} credits`,
  anonHint: "Unlocked answers are yours forever.",
  loggedInDisabledCta: "Unlock coming soon",
  loggedInDisabledHint: "Analyst video unlocks ship in the next release.",
  unavailable: "Unavailable",
  emptyStockVideos: (symbol: string) =>
    `No analyst videos yet for ${symbol}. Be the first to request one.`,
  emptyStockAskCta: "Ask an analyst →",
  blogsComingSoon: "Analyst blogs — coming soon.",
} as const;
