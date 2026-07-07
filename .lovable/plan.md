# Library Videos & Blogs — REVISED PLAN (Path A, no schema change)

## A. Chosen path: **Path A — safer MVP, zero schema change**

MVP surfaces three things in `Videos & Blogs`:

- **No symbol selected** → current free content, verbatim: general videos strip + curated media strip (byte-identical to today's `GeneralTab`).
- **Symbol selected** → two grouped sections:
  1. **Stock-specific analyst videos** (paid, lockable) for that symbol.
  2. **Curated blogs / media** tagged to that symbol.

General videos remain **default-view-only** in this MVP. We do NOT promise "general video tagged to a stock" in Path A. That capability is deferred to a follow-up (see optional Phase 3 below) so we don't touch the current invariant.

## B. Why Path A

Verified invariant on `public.answers`: general rows are created with `query_id = NULL` and `stock_master_id = NULL`; stock-specific rows carry both. Overloading `answers.stock_master_id` for "general video tagged to a stock" would:

- Break the `answers` invariant that today's admin flows, RLS, and `list_public_general_video_answers` all assume.
- Require touching `list_public_general_video_answers` (which explicitly filters general/no-symbol) and the admin editor's category rules.
- Risk leaking general rows into `list_public_video_answers_for_symbol` if that RPC keys off `stock_master_id` alone.

Path A gives the founder 3 of the 4 asks (search, stock-specific paid discovery, tagged blogs) with **zero backend risk** and unlocks the UX. Path B (multi-symbol tagging for general videos) is deferred as an explicit, isolated Phase 3 with its own join table — proposed but not scheduled.

## C. Exact files to touch

**Create (frontend only)**

- `src/components/library/VideosBlogsTab.tsx` — new tab. Composes:
  - `<LibraryStockSearchBar />` (new)
  - `<LibraryFilterChips />` (new — chips: `All · Videos · Blogs · Free · Paid`)
  - Conditional render:
    - No symbol → renders the existing `<GeneralTab />` **as-is** (composition, not re-implementation — preserves current invariant and query keys).
    - Symbol selected → two grouped sections built from the existing server fns listed below.
- `src/components/library/LibraryStockSearchBar.tsx` — debounced autocomplete input.
- `src/components/library/LibraryFilterChips.tsx` — chip state (client-side filter over merged results).
- `src/lib/library-videos.functions.ts` — **one** new server fn only:
  - `searchStockMaster({ q })` → autocomplete over `stock_master(symbol, company_name, exchange)`; returns up to 8 rows. No overlap with existing fns.

**Reuse without modification** (no new wrappers — call these directly)

- `listPublicVideoAnswersForSymbol` (already in `src/lib/video-answers.functions.ts`) — stock-specific paid section.
- `listCuratedForSymbol` from `src/lib/discover.functions.ts` (RPC `list_curated_items_for_symbol`) — tagged blogs section.
- `listPublicGeneralVideoAnswers` + `listPublishedCurated` — only reached via the composed `<GeneralTab />` in the no-symbol branch.
- `LockedVideoCard`, `UnlockedVideoCard`, `UnlockVideoModal`, `VideoPosterThumb` — identical lock/unlock UX to `/stock/$symbol`.
- `CuratedLinkOutCard` — blog cards.

**Modify (minimal)**

- `src/routes/library.index.tsx` — 2 lines: rename `<TabsTrigger>` label `"General"` → `"Videos & Blogs"`, swap `<GeneralTab />` for `<VideosBlogsTab />`. Tab `value="general"` string kept to preserve any deep links.

**Explicit no-change zones** (byte-identical, will be SHA-verified pre/post APPLY)

- `src/components/stock-overview/VideosBlogsTab.tsx` (stock page tab)
- `supabase/functions/stock-overview/index.ts`
- `supabase/functions/public-analysis-fetch/index.ts`
- `supabase/functions/generate-stock-analysis/index.ts`
- `src/hooks/useUnlockVideoAnswer.ts` and any `unlockVideoAnswer` RPC
- `wallet_ledger`, `video_entitlements`, `payments` tables + all wallet server fns
- Legacy ₹100 flow files
- Analytics event contracts (12/3/8 keys)
- `supabase/functions/library-symbol/index.ts`
- `src/components/library/GeneralTab.tsx` (kept, still used by `VideosBlogsTab` in the no-symbol branch)
- `src/lib/discover.functions.ts`, `src/lib/video-answers.functions.ts`, `src/lib/curated.functions.ts` (call sites only — no edits)

## D. Migration / schema change required?

**No.** Path A adds no columns, no tables, no RPCs, no RLS. The one new server fn (`searchStockMaster`) is a plain `SELECT` against existing `stock_master`, wrapped in `createServerFn` with the standard publishable client — no privilege change.

## E. Phased APPLY plan

**Phase 1 — Additive (safe, reversible)**

- Add `library-videos.functions.ts` with only `searchStockMaster`.
- Add `LibraryStockSearchBar`, `LibraryFilterChips`, `VideosBlogsTab`.
- Do **not** wire into the Library route yet. Manual smoke via a temporary dev-only route or via component preview.
- Capture SHAs for the no-change files.

**Phase 2 — Cutover (single 2-line route edit)**

- Rename tab label + swap component in `library.index.tsx`.
- Re-verify no-change SHAs → must be byte-identical.
- Run UAT below.

**Phase 3 (deferred, separate approval)** — Path B extension

- Only if the founder wants "general video tagged to stock" post-MVP.
- Design: new join table `public.answer_stock_tags(answer_id uuid, stock_master_id uuid, PRIMARY KEY(answer_id, stock_master_id))` with GRANTs + RLS mirroring `answers` visibility. Leaves the `answers.stock_master_id IS NULL for general` invariant intact.
- New RPC `list_public_general_video_answers_for_symbol(p_symbol)` joins that table.
- Admin editor gains a multi-symbol tag field.
- Ships as its own migration + admin UI change + new tab section. Not part of the current MVP APPLY.

## F. UAT checklist (Path A scope)

1. ☐ Library → tab labeled **"Videos & Blogs"** (not "General").
2. ☐ No-symbol view = current free content identical to today (visual + network diff clean; `library/general/videos` + `library/general/curated` query keys unchanged).
3. ☐ Type "INFY" in the search bar → INFY resolves via `fn_normalize_symbol`; "Infosys" also resolves via company_name autocomplete.
4. ☐ INFY selected → stock-specific analyst videos section shows the seeded INFY paid video with 499-credit lock chip.
5. ☐ Clicking the locked INFY card opens the **same** `UnlockVideoModal` as `/stock/INFY` (no new unlock code path).
6. ☐ Post-unlock, entitlement check flips the card to unlocked state via existing hook.
7. ☐ INFY selected → curated blogs section shows any curated items with `stock_master_id = INFY`; empty state is a subtle chip, not a full card.
8. ☐ Filter chips: `Videos` hides the curated section; `Blogs` hides the video section; `Free` hides items with `unlock_price_credits > 0`; `Paid` hides free items.
9. ☐ Clear symbol → view returns to the no-symbol default (no stale symbol results).
10. ☐ `/stock/INFY` Videos & Blogs tab is visually and network-identically unchanged.
11. ☐ Wallet ledger / `video_entitlements` writes unchanged (spot-check one unlock end-to-end).
12. ☐ Legacy ₹100 flow files untouched — SHA diff clean.
13. ☐ Analytics events untouched (12/3/8 key contracts preserved).
14. ☐ Mobile 360px: search bar, chips, and grouped cards usable without horizontal scroll.
15. ☐ Path A explicit non-goal verified: general videos do NOT appear in the symbol-selected view (this is deferred to Phase 3).

---

**STOP. Awaiting explicit approval for Phase 1 APPLY. No code changes made yet.**  
  
Founder approval: APPROVED.

Proceed with Library Videos & Blogs — Phase 1 APPLY only.

Do not start Phase 2 or Phase 3.

Locked scope:

- Add `src/lib/library-videos.functions.ts` with only `searchStockMaster`

- Add `src/components/library/LibraryStockSearchBar.tsx`

- Add `src/components/library/LibraryFilterChips.tsx`

- Add `src/components/library/VideosBlogsTab.tsx`

- Do NOT wire into `src/routes/library.index.tsx` yet

- Do NOT modify wallet / entitlements / unlock RPCs / analytics contracts / stock-page VideosBlogsTab / legacy ₹100 flow / schema / RLS / migrations

Important clarification to lock:

- Search by company name or symbol via stock_master lookup/autocomplete

- After selection, use canonical symbol for downstream fetches

- Do not describe company-name resolution as fn_normalize_symbol-only behavior

Implementation rules:

- No-symbol branch in VideosBlogsTab must compose existing GeneralTab as-is

- Symbol-selected branch must show only:

  1. stock-specific analyst videos via existing listPublicVideoAnswersForSymbol

  2. curated/blog items for symbol via existing curated/discover function

- General tagged-to-stock videos are explicitly out of scope for this Phase 1/2 MVP

- No backend privilege changes

- No route cutover yet

Required report:

A. exact files created

B. any out-of-scope touches

C. proof no wire-in to library route yet

D. proof no schema/migration changes

E. proof no wallet/unlock/legacy/analytics touches

F. brief smoke evidence for component behavior

STOP after report.

&nbsp;