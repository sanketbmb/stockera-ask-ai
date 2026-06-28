## Scope
Edit `src/components/landing/AnalystShowcase.tsx` and `src/styles.css` only. No logic, no copy beyond what is specified.

## Changes

### 1. Remove disclaimer line
Delete the trailing `<p>` in `AnalystShowcase.tsx`:
> "SEBI registration does not guarantee performance. Educational research only — not investment advice."

(Compliance disclaimer still lives in the global `SiteFooter` and per-report `SymbolCompliance`, so removal here is presentation-only.)

### 2. Glow-up the "More SEBI-registered analysts are joining" card
Replace the muted dashed strip with a premium animated card:

- **Background**: animated multi-stop gradient using brand gold + teal + indigo — `linear-gradient(120deg, #FFF7E0 0%, #FDE68A 25%, #FEF3C7 50%, #E0F7F5 75%, #FFF7E0 100%)`, `background-size: 300% 300%`, animated via new `@keyframes shimmer-warm` (12s ease-in-out infinite).
- **Border**: replace `border-dashed border-border` with a 1px gradient border using a `::before` pseudo-element layered with `mask-composite` trick — gold→teal→indigo stops.
- **Outer glow**: new `.animate-glow-aurora` utility — `box-shadow` keyframes pulsing between gold (`rgba(245,183,49,0.35)`) and teal (`rgba(43,168,160,0.35)`) at 0/50/100%, 4s ease-in-out infinite. Reduced-motion fallback = static soft gold shadow.
- **Floating orbs**: two absolutely-positioned blurred radial-gradient blobs (gold top-left, teal bottom-right) drifting via existing `float-y` utility for depth.
- **Copy contrast**: bump text color to `text-foreground/80`; keep "Post your query" link teal, add subtle underline-on-hover.
- **CTA button**: keep the existing Register button but swap `bg-accent` for a gold→teal gradient (`linear-gradient(135deg, #F5B731 0%, #FFA94D 50%, #2BA8A0 100%)`) with stronger gold-tinted shadow on hover. Preserve the existing sheen sweep and `animate-pulse-glow`.

All animations gated with `motion-reduce:animate-none`.

## Files touched
- `src/components/landing/AnalystShowcase.tsx` — JSX swap for the dashed strip + delete final disclaimer `<p>`.
- `src/styles.css` — add `@keyframes shimmer-warm`, `@keyframes glow-aurora`, `.animate-shimmer-warm`, `.animate-glow-aurora` utilities + reduced-motion guards.

## Out of scope
A1 header pill, A2 SEBI pulse, analyst row card, footer disclaimers, any other section.
