# Onboarding Flow + Premium UI Polish

Two large workstreams. I'll ship them in order so each is verifiable.

## Part 1 — First-time user onboarding

**Schema change** (migration, requires approval)
- Add `profiles.onboarding_completed boolean default false`

**Library**: `react-joyride` (mature, React 19 compatible, skippable out of the box)

**Tour steps** (4)
1. Dashboard stats cards — "Your queries, AI reports & wallet at a glance"
2. "Post a Query" CTA — "Ask any stock question, get instant AI report"
3. Wallet card — "₹100 free credits = 2 free AI reports"
4. Recent queries / AI report link — "Tap any query to read the full AI report"

**Behavior**
- Triggers on Dashboard mount when `profile.onboarding_completed === false`
- Skippable (Skip button) + Finish button — both set `onboarding_completed = true`
- Brand-styled (teal accent, DM Serif Display headers, rounded popover)
- Stored per-user in DB (not localStorage) so it follows them across devices

**Demo query seed**
- On first Dashboard visit (when `onboarding_completed = false` AND user has 0 queries), insert one sample query:
  - Stock: RELIANCE, query_type: buy_sell, status: ai_answered
  - Pre-filled `ai_report` JSON (verdict, summary, key points, SEBI disclaimer)
- Idempotent: only inserts if the user has zero queries

## Part 2 — Premium UI polish

Done as a batch, semantic tokens only (added to `src/styles.css`).

| # | Item | Approach |
|---|------|----------|
| 1 | Animated counters | `react-countup` on Dashboard StatCards + LiveStatsBar numbers |
| 2 | Particle/grid hero bg | Pure CSS animated grid overlay (no tsparticles dep — lighter, SSR-safe) |
| 3 | Glassmorphism dashboard cards | New `.glass-card` token: `backdrop-blur-xl bg-card/60 border-white/10` |
| 4 | Page transitions | Wrap `<Outlet />` in `__root.tsx` with framer-motion `AnimatePresence` (fade + 8px y) |
| 5 | Branded focus rings | Override `--ring` to teal + add `--shadow-focus-glow` token; apply via global CSS on `:focus-visible` |
| 6 | Custom cursor | `CustomCursor` component, desktop-only (`md:` + pointer-fine media query), scales on `[data-cursor="link"]` and native interactive els |
| 7 | Gradient shimmer H1 | `.text-shimmer` utility: animated `background-position` on gradient-clip text |
| 8 | Scroll-triggered counters | `react-countup` + `react-intersection-observer` on LiveStatsBar |
| 9 | Noise texture overlay | Inline SVG turbulence as `--noise-bg`, applied via `.bg-noise` utility on gradient surfaces |
| 10 | Branded skeletons | Upgrade `PageSkeleton` + add `StockeraSkeleton` with logo mark + shimmer; replace generic `<Skeleton>` usage in key pages (Dashboard, MyQueries, Report) |

## Technical section

**New deps**: `react-joyride`, `react-countup`, `react-intersection-observer`
**New files**:
- `src/components/onboarding/OnboardingTour.tsx`
- `src/lib/seedDemoQuery.ts`
- `src/components/common/CustomCursor.tsx`
- `src/components/common/AnimatedCounter.tsx`
- `src/components/common/StockeraSkeleton.tsx`

**Modified files**: `src/styles.css` (tokens + utilities), `src/routes/__root.tsx` (AnimatePresence + CustomCursor mount), `src/pages/Dashboard.tsx` (tour anchors, counters, glass, seed), `src/components/landing/HeroSection.tsx` (grid bg, shimmer H1), `src/components/landing/LiveStatsBar.tsx` (scroll counters), `src/contexts/AuthContext.tsx` (expose `onboarding_completed` in ProfileRow).

**Migration** runs first (separate approval), then code lands.
