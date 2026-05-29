// Stockera Brain — motion tokens & variants for StockAnalysisReport
// Centralized so timing/easing stays consistent across the entire report.
// Premium, restrained, GPU-friendly (transform + opacity only).

import type { Variants, Transition } from "framer-motion";

// Duration tokens (seconds for framer-motion)
export const duration = {
  xfast: 0.12,
  fast: 0.2,
  base: 0.32,
  slow: 0.52,
  cinematic: 0.8,
} as const;

// Easing tokens
export const ease = {
  standard: [0.22, 1, 0.36, 1] as const,
  entrance: [0.16, 1, 0.3, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
};

// Stagger
export const stagger = {
  section: 0.08,
  element: 0.04,
} as const;

// ─── Variants ────────────────────────────────────────────────

// Page-level container — staggers top-level sections
export const pageContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: stagger.section,
      delayChildren: 0.04,
    },
  },
};

// Section fade-up: opacity + 4px translate
export const sectionFadeUp: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.base, ease: ease.entrance },
  },
};

// Verdict label gentle scale
export const verdictScale: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: duration.slow, ease: ease.entrance, delay: 0.08 },
  },
};

// Tier badge slide-in from right
export const tierBadgeSlide: Variants = {
  hidden: { opacity: 0, x: 6 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: duration.base, ease: ease.entrance, delay: 0.16 },
  },
};

// Card grid container with element stagger
export const gridContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: stagger.section,
      delayChildren: 0.04,
    },
  },
};

// Card item — fade + 6px lift
export const cardItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.base, ease: ease.entrance },
  },
};

// Inner metric stagger inside a card
export const innerStaggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: stagger.element, delayChildren: 0.04 },
  },
};

export const innerStaggerItem: Variants = {
  hidden: { opacity: 0, y: 3 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.fast, ease: ease.entrance },
  },
};

// Score bar — width fill
export const barFill: Variants = {
  hidden: { scaleX: 0 },
  visible: {
    scaleX: 1,
    transition: { duration: duration.cinematic, ease: ease.standard },
  },
};

// Subtle one-shot pulse for tier-weighted bars
export const tierPulse: Variants = {
  pulse: {
    scale: [1, 1.02, 1],
    transition: { duration: duration.base, ease: ease.standard },
  },
};

// Price band line draw
export const priceBandLine: Variants = {
  hidden: { scaleX: 0 },
  visible: {
    scaleX: 1,
    transition: { duration: duration.cinematic, ease: ease.standard, delay: 0.1 },
  },
};

// Tab content cross-fade
export const tabContent: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.fast, ease: ease.entrance },
  },
  exit: {
    opacity: 0,
    y: -2,
    transition: { duration: duration.xfast, ease: ease.exit },
  },
};

// Behavioral nudge — slightly delayed reveal
export const nudgeReveal: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.slow, ease: ease.entrance, delay: 0.15 },
  },
};

// Footer quiet fade
export const footerFade: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: duration.slow, ease: ease.standard },
  },
};

// Hover lift transition
export const hoverLift: Transition = {
  duration: duration.fast,
  ease: ease.standard,
};
