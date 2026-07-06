# Stage 4F.2 — Video Answers: UI Surfaces (PLAN v2 — REVISED)

Revisions vs v1: contract-consistency clarified (§A.1), anti-leak wording rewritten to match 4F.1 reality (§D.5), APPLY-1 logged-in state changed to a non-action teaser (§D.1, §H), and the four blockers answered inline (§F.0).

## A. Objective

Expose the paid-unlock video-answer contract shipped in 4F.1 across five UI surfaces without touching the DB, RPCs, RLS, wallet code, migrations, or any 4F.1 module.

### A.1 Contract read paths — one explicit exception

Default rule: all new video UI reads flow through the three approved 4F.1 server fns only:

- `listVideoAnswersForSymbol` (anon-safe public list)
- `getVideoAnswer` (per-item, authenticated)
- `unlockVideoAnswer` (mutation)

**Single, founder-visible exception (My Queries "Unlocked videos" tab only):** one new client-safe server fn `listMyUnlockedVideos` in `src/lib/my-video-entitlements.functions.ts`. Justification:
- `getVideoAnswer` is per-`answerId`; there is no 4F.1 fn that lists a user's own entitlements. Fanning out per-item requires knowing the IDs first, which is the same problem.
- The fn adds **zero backend contract**: no migration, no RPC, no RLS policy, no wallet touch, no edge function. It is a thin `SELECT` scoped by the authenticated Supabase client (RLS already enforces `auth.uid() = user_id` on `video_entitlements` — proven in 4F.1 UAT check 8).
- Exact file scope: **one new file only** (`src/lib/my-video-entitlements.functions.ts`), consumed **only** by the new My Queries tab (§C.14). Not consumed by any other surface.
- Exception is opt-out: if founder rejects it, drop file §C item marked `[EXCEPTION]` and defer the My Queries tab to a later stage (§H fallback). All four other surfaces remain intact and 100% on the three approved fns.

Analyst upload of new 4F.1-shape rows is 4F.3 — not in this stage. Legacy personal-video-answer flow (Razorpay-demo, MP4 `video_url`) is untouched — see §F.1.

## B. Surfaces in scope

1. **Locked video card** — reusable presentation component consumed by surfaces 2–5.
2. **Stock page** — `/stock/$symbol` `Videos & Blogs` tab.
3. **Library — symbol page** — `/library/$symbol` when tab = `video`.
4. **MasterSearch** — the `videos` section in the search dropdown.
5. **My Queries** — new "Unlocked videos" tab (contract exception per §A.1).
6. **Post-unlock playback route** — `/v/$answerId` (see §F.0.3 for placement).

Out of scope: producing new video rows, blog data model, changes to legacy personal-video pipeline.

## C. Files to touch

New (all frontend):

1. `src/components/video-answers/LockedVideoCard.tsx`
2. `src/components/video-answers/UnlockedVideoCard.tsx`
3. `src/components/video-answers/UnlockVideoModal.tsx`
4. `src/components/video-answers/VideoPosterThumb.tsx` — thumb with fallback if YouTube 404s
5. `src/components/video-answers/VideoAnswerEmbed.tsx` — `<iframe>` on `youtube-nocookie.com`, `rel=0`, `modestbranding=1`, `playsinline`, `origin`
6. `src/components/video-answers/InlinePriceChip.tsx`
7. `src/components/video-answers/copy.ts` — fixed CTA strings, consistent across surfaces
8. `src/routes/_authenticated/v.$answerId.tsx` — see §F.0.3
9. `src/hooks/useVideoAnswer.ts` — wraps `useServerFn(getVideoAnswer)` + `useQuery`
10. `src/hooks/useUnlockVideoAnswer.ts` — wraps `useServerFn(unlockVideoAnswer)` + `useMutation`
11. `src/lib/my-video-entitlements.functions.ts` **[EXCEPTION — §A.1]** — `listMyUnlockedVideos` only

Modified:

12. `src/components/stock-overview/VideosBlogsTab.tsx` — replaces placeholder; two sections (Videos + "Analyst blogs — coming soon" strip)
13. `src/routes/library.$symbol.tsx` — when `kind === 'video'`, card renderer swaps (layout unchanged)
14. `src/components/library/LibraryItemCard.tsx` — dispatch on `kind==='video'` → `LockedVideoCard` / `UnlockedVideoCard`
15. `src/components/library/MasterSearch.tsx` — 4F.1-shape rows in `videos` section render compact locked chip; activation opens `UnlockVideoModal` inline
16. `src/pages/MyQueries.tsx` — add new filter tab `Unlocked videos` alongside existing `Video Answer` tab (legacy untouched)
17. `src/types/library-symbol.ts` — no field addition needed (see §F.0.1 — `source_id` is the answer_id for video rows)

Explicitly NOT touched: `src/lib/video-answers.functions.ts`, any migration/RPC/RLS/wallet code, legacy `VideoAnswerPaymentModal`, `BookAnalystVideoButton`, `HomeAnalystCta`, `AnalystCtaCard`, `AIReportCard*`, `ExpertAnswerSection`, `QueryHistoryCard`, `admin/VideoAnswerUpload.tsx`, `library-symbol`/`library-search` edge fns.

## D. UX behavior by user state

### D.1 `LockedVideoCard` per-user-state matrix

**APPLY-1 (read-only phase — no unlock action possible yet):**

| State | Layout | CTA | Copy |
| --- | --- | --- | --- |
| Anon | Poster, verdict pill, analyst, duration, price chip, lock glyph | Primary `Sign in to unlock — N credits` → `/login?redirect=/v/{answerId}` | Below CTA: "Unlocked answers are yours forever." |
| Logged-in (any balance) | Same layout | **Disabled** button `Unlock coming soon` (aria-disabled, no click handler) | Below CTA: "Analyst video unlocks ship in the next release." No modal, no navigation, no login redirect. |
| Loading | Skeleton same size | — | — |
| Error | Neutral placeholder, "Unavailable" note, retry | — | — |

**APPLY-2 (unlock flow enabled — rewires the logged-in row above):**

| State | Layout | CTA | Copy |
| --- | --- | --- | --- |
| Anon | (unchanged from APPLY-1) | (unchanged) | (unchanged) |
| Logged-in, no entitlement, sufficient balance | Same layout | Primary `Unlock for N credits` → opens `UnlockVideoModal` | Balance hint "You have X credits" |
| Logged-in, no entitlement, insufficient balance | Price chip in destructive tone | Primary `Top up X credits` → `/topup?required={N}` | "You have Y credits · Need N" |
| Logged-in, has entitlement | `UnlockedVideoCard` — poster + play glyph, no lock, no price | Card click → `/v/{answerId}` | "Unlocked · watch anytime" |
| Loading / Error | (unchanged) | — | — |

### D.2 Surface-level empty states

- Stock page Videos section: `No analyst videos yet for {SYMBOL}. Be the first to request one — [Ask an analyst →]` → `/post-query?symbol={SYMBOL}&type=video`. Blogs strip below stays "coming soon".
- Library `video` tab: existing `SymbolEmptyState` reused.
- MasterSearch: current "no matches" copy; `videos` section omits when empty.
- My Queries `Unlocked videos` tab: `You haven't unlocked any analyst videos yet. Browse videos on any stock page or in the library.` with links.

### D.3 Unlock flow (APPLY-2 only, non-optimistic)

1. Click `Unlock for N credits` → `UnlockVideoModal` opens.
2. Modal: analyst + SEBI reg, title, duration, `N credits`, current balance, post-unlock balance preview `Y − N = Z`, primary `Confirm unlock`, secondary `Cancel`.
3. Confirm → button `Unlocking…` + spinner; other controls disabled.
4. `useUnlockVideoAnswer.mutate({ answerId })` — response handling:
   - `ok` → toast "Video unlocked", 1.2s success panel, auto-navigate to `/v/{answerId}`. Invalidate `['video-answer', answerId]`, `['video-answers', symbol]`, `['wallet-balance']`, `['my-unlocked-videos']`.
   - `already_unlocked` → same as `ok` but toast "Already unlocked", no debit displayed.
   - `insufficient_funds` → modal swaps to insufficient panel with `Top up →` → `/topup?required={required}`; no toast.
   - `not_found` → destructive toast, close modal, invalidate list query.
   - `unauthenticated` → redirect to `/login?redirect=/v/{answerId}`.
   - Network error → keep modal open, inline retry, no cache mutation.

### D.4 Post-unlock playback (`/v/$answerId`, APPLY-2)

- Route under `_authenticated/` — Supabase managed gate handles the sign-in redirect (§F.0.3).
- Component uses `useServerFn(getVideoAnswer)` inside `useQuery` (never in a public-route loader).
- `locked: true` (session lost between click and mount) → replace body with `LockedVideoCard` state, no embed.
- `locked: false` → render `VideoAnswerEmbed` (16:9, `youtube-nocookie.com`, `playsinline`, no autoplay), title, analyst attribution + SEBI reg, `Back to {symbol}` link.
- Mobile: full-width, sticky back link. Desktop: max-w-3xl centered.

### D.5 Anti-leak rules (rewritten to match 4F.1 reality)

The public locked surface intentionally exposes `poster_thumb` at `https://i.ytimg.com/vi/{id}/hqdefault.jpg`. The 11-char YouTube video ID is therefore derivable from that URL — this is an **accepted 4F.1 design choice** (video is unlisted, not private; unlock enforces the debit, not URL opacity). It stays that way in 4F.2 unless the founder reopens 4F.1 backend design.

Given that, 4F.2 anti-leak invariants are:

1. **No raw `youtube_video_id` field** anywhere in DOM, JSON payloads, `data-*` attributes, network responses, or client state for locked or anon-viewed cards.
2. **No direct YouTube watch URL** — no `youtube.com/watch?v=…`, `youtu.be/…`, or any string that resolves to a watch page.
3. **No embed URL** — no `youtube.com/embed/…` or `youtube-nocookie.com/embed/…` in locked surfaces.
4. **No playable surface before unlock** — no `<iframe>`, `<video>`, or media element pointing at YouTube on locked cards; the poster is a plain `<img>`.
5. **No `video_url`** (legacy MP4 column) rendered on 4F.2 surfaces.

`poster_thumb` on `i.ytimg.com` is a **known accepted public artifact from 4F.1** and is not treated as a leak.

## E. Data wiring by surface

### E.1 Public locked list (stock page, anon-safe)

- Stock page loader stays SSR-only for `stock-overview` (no extra RPC on page load).
- `<VideosBlogsTab>` fires `useQuery(['video-answers', symbol], listVideoAnswersForSymbol)` on tab mount.
- Anon-safe: 4F.1 contract guarantees no `youtube_video_id` in response.

### E.2 Authed locked read (per-item)

- `useVideoAnswer(answerId)` — `useQuery(['video-answer', answerId], () => getVideoAnswer({ data: { answerId } }))`, `staleTime: 60_000`. Only fired for authenticated users on visible cards.

### E.3 Library symbol page

- Reuses existing `library-symbol` output. For `kind==='video'`, use `source_id` as the answer id (§F.0.1). Locked stub for anon comes from the same list.

### E.4 MasterSearch

- Reuses existing `library-search` output. For `videos` group rows, use `source_id` as the answer id (§F.0.2). Rows without a resolvable answer id fall through to today's behavior.

### E.5 My Queries — Unlocked videos tab **[EXCEPTION — §A.1]**

- `listMyUnlockedVideos` — server fn with `requireSupabaseAuth`. SELECT from `video_entitlements` (RLS-scoped to `auth.uid()`) joined to `answers` (title, `youtube_video_id`, `video_duration_sec`), `analyst_profiles` (display_name, SEBI reg), `queries` (symbol, stock_name). Returns `youtube_video_id` **only** for rows the user is entitled to (RLS proof, 4F.1 UAT #8).
- Consumed by `useQuery(['my-unlocked-videos'])` → renders `UnlockedVideoCard` grid.
- Card click routes to `/v/{answerId}`; the embed there re-verifies entitlement via `getVideoAnswer`.

### E.6 Fallback if §A.1 exception is rejected

Drop file C.11, drop surface B.5, skip §E.5. Everything else ships as-planned. My Queries stays legacy-only until a future stage adds either (a) a new 4F.1 backend fn or (b) approval for this helper.

## F. Risks / blockers

### F.0 Answers to the four gating questions

**F.0.1 Does `library-symbol` already project `answer_id` for video rows?**
**No — and it does not need to.** `library-symbol` selects `id, kind, source_id, source_table, symbol, symbol_exchange, title, verdict, sector, analyst_id, body_excerpt, view_count, published_at` (confirmed at `supabase/functions/library-symbol/index.ts:74`). For `kind==='video'`, `source_table==='answers'` and `source_id` **is** the `answer_id` — that is the definition of that column across the library projection. 4F.2 reads `item.source_id` when `item.kind==='video'`; no edge fn change, no type change (`SymbolLibraryItem.source_id` already `string`). §C.17 accordingly reverts to "no change".

**F.0.2 Does `library-search` already project `answer_id` for video rows?**
**No — and it does not need to.** `library-search` delegates to RPC `fn_library_search` and returns rows typed as `LibraryItem` with `source_id: string`. Same rule as F.0.1 — `source_id` on `kind==='video'` is the answer id. `LibraryItem.source_id` is already in the type. No edge fn / RPC change.

**F.0.3 Does the `_authenticated/` route structure already exist for the watch route?**
**No — not currently present in `src/routes/`.** (Verified: directory absent.) This is a project-managed layout per Supabase auth guards. 4F.2 must NOT hand-author `_authenticated/route.tsx`. Two acceptable paths, founder to pick:
  - **(a) Managed creation:** trigger the Lovable Supabase integration to create the managed `_authenticated/route.tsx` gate, then author `src/routes/_authenticated/v.$answerId.tsx` in the same edit as the first child (so TanStack does not raise a duplicate "/" against `index.tsx` from a childless pathless layout).
  - **(b) Interim placement:** put the route at top-level `src/routes/v.$answerId.tsx` and gate access **inside the component** via `useAuth()` → redirect to `/login?redirect=/v/{answerId}` client-side. Server function protection is already enforced by `requireSupabaseAuth` on `getVideoAnswer`, so no data leaks; the component-level gate is UX polish only. This mirrors what the project already does for `/my-queries` via `RequireAuth`.

Default recommendation: **(b)** for minimum surface area. It composes with the existing `RequireAuth` component (`src/components/auth/RequireAuth.tsx`, already used by `/my-queries`) and avoids introducing a new pathless layout in a stage that is otherwise UI-only.

**F.0.4 If My Queries remains in scope, is its extra read helper the only additional non-4F.1 read path?**
**Yes.** `listMyUnlockedVideos` (in the new `src/lib/my-video-entitlements.functions.ts`) is the sole non-4F.1 read introduced by 4F.2. Every other surface (stock page, library, MasterSearch, watch route, unlock modal) reads exclusively through the three approved 4F.1 fns. Grep-provable at UAT — see §G-0.

### F.1 Discriminator: legacy vs 4F.1 video row

Rule at every dispatch site: 4F.1-shape iff `answer_type='video' AND unlock_price_credits IS NOT NULL AND youtube_video_id IS NOT NULL` (per the DB check constraint). Legacy row (`video_url` set, `unlock_price_credits` NULL) never appears in 4F.1 read paths because `listVideoAnswersForSymbol` and `getVideoAnswer` both filter on the video shape. Confirmed once in UAT §G-16.

### F.2 "& Blogs" naming — no blog model. Keep the tab label; keep a "coming soon" strip. Do not invent a table.

### F.3 SEO — the public list is client-fetched in the stock-page tab, so video counts are not in SSR HTML for `/stock/$symbol`. `/library/$symbol` continues to SSR counts. Acceptable trade-off vs adding a server-fn hop to every stock page load.

### F.4 Legacy CTAs (`BookAnalystVideoButton`, `VideoAnswerPaymentModal`) stay untouched and remain the sole video CTA on `AIReportCard*`, `AnalystCtaCard`, `HomeAnalystCta`.

### F.5 Mobile Safari YouTube embed needs `playsinline`. Wired in §D.4.

### F.6 No changes required to migrations, RPCs, RLS, or wallet code. No 4F.3 work.

## G. UAT

### G-0 · Contract-exception audit

0.1 `rg -n "from \"@tanstack/react-start\"" src/components/video-answers src/routes/v.\$answerId.tsx src/hooks/useVideoAnswer.ts src/hooks/useUnlockVideoAnswer.ts` — every import for backend calls resolves to one of `unlockVideoAnswer | getVideoAnswer | listVideoAnswersForSymbol` from `@/lib/video-answers.functions`. Zero other server-fn imports on 4F.2 files EXCEPT §C.16 which may also import `listMyUnlockedVideos` from `@/lib/my-video-entitlements.functions`.

### G-1 · Anti-leak (rewritten per §D.5)

1. Anon `/stock/INFY` → Videos tab → INFY seed row visible. Assertions:
   - No `youtube_video_id` field in any response body or client state.
   - No `youtube.com/watch`, `youtu.be/`, `youtube.com/embed`, or `youtube-nocookie.com/embed` string in DOM or network payloads.
   - No `<iframe>`/`<video>` element on the card.
   - `video_url` field absent.
   - `poster_thumb` on `i.ytimg.com/vi/…/hqdefault.jpg` present — **accepted**.
2. Anon `/library/INFY` tab=video → repeat 1.
3. Anon MasterSearch `INFY` → row in 🎥 ANALYST VIDEOS section; repeat 1.
4. Anon clicks locked CTA → routes to `/login?redirect=/v/{answerId}`.

### G-2 · APPLY-1 logged-in teaser

5. Logged-in user B on any of the three anon surfaces sees `Unlock coming soon` (disabled, aria-disabled). Click does nothing. No navigation to `/login`. No modal. No network call to `unlockVideoAnswer`.

### G-3 · Logged-in locked (APPLY-2)

6. B (600 credits, no entitlement) sees `Unlock for 499 credits` + "You have 600 credits".
7. Opens modal → 600 → 101 preview.
8. Cancels → no debit, no entitlement, balance 600.

### G-4 · Unlock happy path (APPLY-2)

9. B confirms → toast + success panel + auto-navigate to `/v/{answerId}` → embed renders on `youtube-nocookie`, back link works.
10. `/wallet` shows one new debit `−499`, balance 101.
11. Reload `/stock/INFY` Videos tab → card shows unlocked state.

### G-5 · Idempotent replay (APPLY-2)

12. B revisits card → unlocked state (no modal), click → `/v/{answerId}`. Zero new ledger rows.

### G-6 · Insufficient funds (APPLY-2)

13. Fresh user C (0 credits) → CTA `Top up 499 credits` → `/topup?required=499`. If C reaches modal (race), Confirm returns `insufficient_funds` → panel with `Top up →`. Zero writes.

### G-7 · Auth expiry mid-flow (APPLY-2)

14. B signs out in another tab, then confirms unlock → 401 → redirected to `/login?redirect=/v/{answerId}`. Zero writes.

### G-8 · My Queries [EXCEPTION — skip if §A.1 rejected]

15. A (owns 4F.1 UAT seed unlock) `/my-queries` → new `Unlocked videos` tab lists the seed row. Legacy `Video Answer` tab unchanged.
16. B (unlocked in G-4) → same tab lists the same row.

### G-9 · Regressions

17. Legacy `Book Analyst Video — ₹100` button on `AIReportCard*` still opens the old `VideoAnswerPaymentModal` (Razorpay-demo copy).
18. Existing `Video Answer` tab on `/my-queries` still lists legacy personal-video rows unchanged.
19. `/stock/$symbol` SSR HTML unchanged for Overview / Statistics / Analytics / News / AI Reports tabs.

### G-10 · Mobile

20. iOS Safari `/v/$answerId`: `playsinline` respected; poster fills width; back link visible.
21. Android Chrome: modal scrolls; sticky footer CTA reachable.

Any FAIL → single fix or reopen §F item. Do not proceed to APPLY-2 until APPLY-1 passes.

## H. Recommended APPLY sequence

**Two-pass split so the read-only surface is auditable before any state-changing UI ships.**

### APPLY-1 · Read-only surfaces (no debit possible, no unlock possible)

Files: §C.1 (`LockedVideoCard` with APPLY-1 CTA matrix — anon routes to login, **logged-in shows disabled "Unlock coming soon"**, per §D.1 APPLY-1 table), §C.4 (`VideoPosterThumb`), §C.6 (`InlinePriceChip`), §C.7 (`copy.ts`), §C.9 (`useVideoAnswer`), §C.12 (`VideosBlogsTab`), §C.13 (`library.$symbol.tsx`), §C.14 (`LibraryItemCard` dispatch), §C.15 (`MasterSearch` dispatch).

No modal, no mutation hook, no watch route, no My Queries tab. Logged-in users cannot trigger any unlock or auth redirect.

UAT scope: §G-0, §G-1, §G-2, §G-9, §G-10 (partial — no `/v/$answerId` yet).

### APPLY-2 · Unlock flow + playback + My Queries

Files: §C.2 (`UnlockedVideoCard`), §C.3 (`UnlockVideoModal`), §C.5 (`VideoAnswerEmbed`), §C.8 (`v.$answerId` route per §F.0.3 recommendation (b)), §C.10 (`useUnlockVideoAnswer`), §C.16 (`MyQueries` new tab), §C.11 (`my-video-entitlements.functions.ts`) **[EXCEPTION — omit if founder rejects §A.1]**.

Rewire `LockedVideoCard` CTA per §D.1 APPLY-2 table.

UAT scope: full §G (skip §G-8 if exception rejected).

### Blockers gated before APPLY-1

All four blockers answered in §F.0. Remaining founder decisions:

1. §A.1 exception → **approve** the single new read fn for My Queries, or **reject** and defer My Queries surface.
2. §F.0.3 → confirm route placement approach **(a)** managed `_authenticated/` layout or **(b)** top-level `/v/$answerId` gated by `RequireAuth` component (**recommended**).

STOP after this plan. Do not APPLY without founder sign-off on the two remaining decisions above.
