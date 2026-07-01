export const EASE = {
  snap: [0.22, 0.61, 0.36, 1] as const,
  smooth: [0.4, 0, 0.2, 1] as const,
};

export const DURATION = {
  instant: 0.12,
  fast: 0.2,
  base: 0.35,
  slow: 0.45,
  slower: 0.6,
};

// ── MOTION-DNA BATCH 2 additions ─────────────────────────────
// New named tokens for hero waterfall, SEBI pulse, marquee masks.
// Existing EASE / DURATION exports above remain unchanged.
export const EASE_OUT_SOFT = [0.16, 1, 0.3, 1] as const;
export const EASE_OUT_FIRM = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = EASE.smooth;

export const DUR = {
  heroHeadline: 0.8,
  heroSub: 0.7,
  heroCard: 0.6,
  chipPop: 0.4,
  trustFade: 0.3,
  sebiPulse: 4,
} as const;

export const DELAY = {
  sebiBar: 0,
  headline: 0.12,
  sub: 0.32,
  card: 0.47,
  chipsStart: 0.7,
  chipsStagger: 0.08,
  trustRow: 0.9,
} as const;
