## SP-DEMO-HOTFIX — Revised (v2) Six-fix atomic changeset

STRICT: plan → full diff after approval → deploy → verify. This revision incorporates founder corrections 1–5.

---

### FIX 1 — Public-first fetch in `report.$queryId.tsx` (unchanged)

**File:** `src/routes/report.$queryId.tsx` (queryFn L611–659; Retry L213).

Rewrite `queryFn` so it takes the PUBLIC path first for any row that is public-library-eligible, regardless of user state:

```ts
const publicFirst = async () => {
  try {
    const res = await fetchPublicRow({ data: { queryId } });
    return res.found ? (res.row as any) : null;
  } catch { return null; }
};
const isPublicUsable = (r:any) =>
  r && r.is_public_library === true && r.library_tombstoned_at == null && r.ai_report != null;

if (!user) {
  const pub = await publicFirst();
  if (!pub) { const e:any = new Error("Results contain 0 rows"); e.code="PGRST116"; throw e; }
  return pub;
}
const pub = await publicFirst();
if (isPublicUsable(pub)) return pub;
try {
  // existing supabase.from("queries")…single() + analyst join — UNCHANGED
} catch (err:any) {
  if (/unauthorized|invalid or expired token/i.test(String(err?.message ?? ""))) {
    const retryPub = await publicFirst();
    if (isPublicUsable(retryPub)) return retryPub;
  }
  throw err;
}
```

Retry button already wired to `refetch()` — leave intact. No RLS/schema change.

---

### FIX 1B — StepStory public demo access (NEW — CRITICAL MISS)

**File:** `src/components/landing/StepStory.tsx` (`goReport`, L71–89).

For `DEMO_REPORT_ID = "4f71e760-ded3-42c5-a1b4-6dbe005345b1"`, NEVER force login. All Step 2 + Step 3 sample cards must navigate directly to `/report/$queryId` for anon AND authed users:

```ts
const goReport = (view?: "text" | "video", hash?: string) => {
  // DEMO report is public — no login gate. Only private/non-demo report
  // flows should ever route through /login.
  navigate({
    to: "/report/$queryId",
    params: { queryId: DEMO_REPORT_ID },
    search: view ? ({ view } as never) : undefined,
    hash,
  });
};
```

Remove the entire `if (!user) { … /login redirect … }` branch. `user` (via `useAuth`) still imported but unused for demo — remove the import and `const { user } = useAuth();` if no other reference remains (verified: only used inside `goReport`).

**File:** `src/components/common/AuthGatedReportLink.tsx` (L5).

Add the demo id to the whitelist so any card that ever wraps the demo report is exempt:

```ts
const PUBLIC_DEMO_REPORT_IDS = new Set<string>([
  "4f71e760-ded3-42c5-a1b4-6dbe005345b1",
]);
```

(Current callers — MasterLibraryCard, RecentVideoAnalyses, PublicAnswersMarquee — pass row-driven ids; whitelisting the demo id is defensive and correct.)

Non-demo / private report flows keep existing login redirect behavior (unchanged).

---

### FIX 2 — Video-first layout for SBIN demo with verified free M&M sample (unchanged)

**Verified free sample (SQL confirmed):**
- `answers.id = 90683d05-715c-4f4e-8acb-ce4f0aae102e`
- `category=general`, `source_kind=external`, `youtube_video_id=daj-U65js2E`
- `stock_master.symbol=M&M`, `company_name=MAHINDRA & MAHINDRA LTD`
- `unlock_price_credits=NULL` (free), `is_published=true`

**File:** `src/routes/report.$queryId.tsx` — inside `TierShapedReportContent` render, just before `<AIReportCardV2 …/>` (~L473):

```tsx
const DEMO_QUERY_ID = "4f71e760-ded3-42c5-a1b4-6dbe005345b1";
const DEMO_VIDEO_ANSWER_ID = "90683d05-715c-4f4e-8acb-ce4f0aae102e";
{queryId === DEMO_QUERY_ID && viewMode === "video" && (
  <DemoVideoTopBlock answerId={DEMO_VIDEO_ANSWER_ID} />
)}
```

Add small co-located `DemoVideoTopBlock` component that fetches the general-video payload via `getPublicGeneralVideoAnswer` (already in `src/lib/general-video-playback.functions.ts`) and renders a YouTube iframe from `youtube_video_id` with title + RA byline. On error, renders `null` (existing `ViewModeTopBlock` still renders below it as premium-human-analysis CTA).

For any OTHER queryId + `view=video`, current behavior preserved. No paid-video / unlock / paywall / wallet changes.

---

### FIX 3 — Deep-link anchors — exact mapping, no approximations

**Verified anchors in render tree:**
- `StockAnalysisReport.tsx` L997 `quick-verdict`, L1116 `risk-reward`, L1177 `action-strategy`, L1204 `trade-levels`, L1307 `what-can-go-wrong` (already has `scrollMarginTop:96`), L1338 `expert-insight`
- `ExpertAnswerSection.tsx` L77/L106 `expert-analysis`
- **Missing:** `technical-map`, `fundamental-view`, `delivered-in-60`

**Additions to `StockAnalysisReport.tsx`:**
- Add `id="fundamental-view" style={{ scrollMarginTop: 96 }}` on the pillar-cards grid wrapper at **L1065** (`<motion.section variants={gridContainer} className="grid grid-cols-1 gap-3 md:grid-cols-3">`). This is the visible strip where the Fundamental pillar card lives.
- Add `id="technical-map"` on the **existing** technical-details section. Grep in build turn will confirm the exact `<motion.section>` that renders the technical pillar detail block (candidates at L2079/L2189/L2306); id attaches to whichever wrapper is the technical-detail card for the shipped tier. If no distinct technical wrapper exists, `technical-map` maps to `trade-levels` (real, present) as a documented single fallback and the plan-diff will state which choice was made.

**Additions to `ExpertAnswerSection.tsx`:**
- Add `id="delivered-in-60"` and `scrollMarginTop:96` on the existing 60-minute turnaround wrapper — the same `<section>` that already carries `id="expert-analysis"` at L77 and L106. Wrap by adding an inner `<div id="delivered-in-60" style={{scrollMarginTop:96}}>` at the top of that section (does not duplicate id, does not create a new section).

**Final Step 3 anchor map (StepStory `TEXT_CARDS`):**

| Sub-card | Anchor |
|---|---|
| Quick Verdict | `quick-verdict` |
| Technical Map | `technical-map` (added; falls back to `trade-levels` if the technical detail wrapper doesn't exist for this tier) |
| Fundamental View | `fundamental-view` (added) |
| Action Strategy | `action-strategy` |
| Risk–Reward Score | `risk-reward` |
| What Can Go Wrong? | `what-can-go-wrong` |
| Expert Insight | `expert-insight` |
| Delivered in 60 min | `delivered-in-60` (added) |

`VIDEO_CARDS` currently all point to `expert-analysis`. Remap `VIDEO_CARDS` anchors to the same 8 targets (video-first layout keeps the full report below, so anchors resolve correctly).

Existing hash-scroll effect at `report.$queryId.tsx` L557–581 already handles smooth scroll with retry — no change.

No new sections invented; only ids added to existing wrappers.

---

### FIX 4 — Library visibility — AUDIT ONLY (no code change)

Grep + policy audit conclusive:
- `src/routes/library.index.tsx:67-79` and `src/components/library/MasterLibraryGrid.tsx:10-21` — both filter ONLY `.eq("is_public", true).eq("is_tombstoned", false)`. **No `user_id` filter anywhere.**
- `library_items` RLS `library_items_select_public_or_owner` — public branch requires joined `queries.public_consent_anonymized = true`; authed users satisfy this branch identically to anon, then get an ADDITIONAL owner branch. Authed users see a SUPERSET, never a subset, of what anon sees.
- `<MyAiReportsSection />` is unconditional at `library.index.tsx:207`; it self-renders empty state when signed-out and owner list when signed-in. No auth gate to remove.

**No proven code root cause → no code change in this diff.**

Requested from founder for future stage:
1. One authed user id where the symptom reproduces.
2. Screenshot of that user's `/library` vs incognito `/library`.

Likely non-code causes: `queries.public_consent_anonymized=false` on rows the founder expects to see, or stale react-query cache in the reporting user's tab.

---

### FIX 5 — `PasswordInput` component + 7 replacements (unchanged)

**New file:** `src/components/ui/PasswordInput.tsx` — thin wrapper around existing `<Input>`:
- local `useState<boolean>(false)`, `type = show ? "text" : "password"`
- absolutely-positioned right-inset `<button type="button" aria-pressed={show} aria-label={show ? "Hide password" : "Show password"}>` with `Eye` / `EyeOff` from `lucide-react` (already in deps)
- forwards ref + all `<Input>` props; defaults to masked; button never submits

**Replacements** (verified via G7):
- `src/pages/auth/Login.tsx` L120
- `src/pages/auth/Signup.tsx` L111, L114
- `src/pages/Settings.tsx` L138
- `src/pages/admin/AnalystApplication.tsx` L228, L231
- `src/pages/admin/AdminLogin.tsx` L105

No `/forgot-password` route exists in repo (magic-link only). No form-logic changes.

---

### FIX 6 — Remove ALL unlabeled floating decorative dots on public / auth pages

**Audit results** (verified via grep + surrounding-context read):

| Location | Kind | Verdict |
|---|---|---|
| `HomeAnalystCta.tsx:33` `hac-video-glint` white dot on video-icon | **Unlabeled, floating, decorative** | **REMOVE** span + purge unused `hac-video-glint` keyframe from `src/styles.css` (if defined) |
| `HeroSection.tsx:132` accent dot | Inline INSIDE the "SEBI Registered Analysts • INH000019071" pill | LABELED — keep |
| `HomeAnalystCta.tsx:116-118` green pulse | Inline part of "LIVE" indicator | LABELED — keep |
| `HeroDemoCard.tsx:157` accent dot | Chart-plot marker, decorative on the hero demo card | Presentational data-viz element on decorative mock chart — keep (not a floating orphan) |
| `SiteFooter.tsx:54` red bullet | Bullet next to a footer list item text | LABELED — keep |
| `LiveDemandBlock.tsx:140` green dot | Inline with "live" text | LABELED — keep |
| `pages/auth/Login.tsx`, `pages/auth/Signup.tsx`, `components/auth/*` | Grepped — no floating decorative dots present | Nothing to remove |

**Only surgical removal:** the `hac-video-glint` span in `HomeAnalystCta.tsx:33`. If after this change the founder points at another dot in screenshots, one-word confirmation removes that too.

---

### C. Files changed (line ranges)

1. `src/routes/report.$queryId.tsx` — queryFn L611-659 rewrite; insert `DemoVideoTopBlock` mount ~L473 + component definition ~L200.
2. `src/components/landing/StepStory.tsx` — `goReport` L71-89 (drop login branch), `useAuth` import cleanup, `TEXT_CARDS` L26-35 and `VIDEO_CARDS` L38-47 anchor remap.
3. `src/components/common/AuthGatedReportLink.tsx` L5 — add demo id to whitelist.
4. `src/components/analysis/StockAnalysisReport.tsx` — add `id="fundamental-view"` @ L1065 wrapper; add `id="technical-map"` on existing technical-detail wrapper (exact line resolved in diff turn).
5. `src/components/report/ExpertAnswerSection.tsx` — add inner `<div id="delivered-in-60" style={{scrollMarginTop:96}}>` inside existing `expert-analysis` sections at L77 and L106.
6. `src/components/ui/PasswordInput.tsx` — NEW.
7. `src/pages/auth/Login.tsx` L120, `src/pages/auth/Signup.tsx` L111,L114, `src/pages/Settings.tsx` L138, `src/pages/admin/AnalystApplication.tsx` L228,L231, `src/pages/admin/AdminLogin.tsx` L105 — swap to `<PasswordInput>`.
8. `src/components/landing/HomeAnalystCta.tsx` L33 — delete decorative span; purge unused `hac-video-glint` keyframe from `src/styles.css` (only if orphaned after removal).

**No changes** to: schema, migrations, RLS, RPCs, edge functions, wallet/unlock/entitlement/pricing/analytics/stock-logo, package.json, bun.lock, routeTree.gen.ts, library fetch code.

---

### F. UAT plan (U1–U12) — filled after deploy

| # | Check | Result |
|---|---|---|
| U1 | Incognito SBIN demo URL renders | ☐ |
| U2 | Authed session same URL renders | ☐ |
| U3 | Expired-token session (cookie cleared) renders via public-first fallback | ☐ |
| U4 | Home Step 2 textual card → SBIN report text layout (anon + authed, no /login detour) | ☐ |
| U5 | Home Step 2 video card → SBIN report with M&M video block on top, then AI report, no unlock (anon + authed) | ☐ |
| U6 | Home Step 3 × 8 sub-cards each smooth-scroll to correct real anchor | ☐ |
| U7 | New authed user /library sees both MyAI + public grid (audit deferred; no code shipped) | N/A this stage |
| U8 | Password toggle works on Login, Signup, Settings, AnalystApplication, AdminLogin | ☐ |
| U9 | No orphan decorative dot on home / login / signup / hero / auth | ☐ |
| U10 | `bunx tsgo --noEmit` exits 0 | ☐ |
| U11 | `git diff package.json bun.lock` empty | ☐ |
| U12 | Wallet credits unchanged; INFY unlock still passes | ☐ |

---

### G. Deviations / risks / blockers

- **FIX 4 not shipped** — audit-only; no code change. Awaits founder repro artefacts.
- **FIX 3 `technical-map` fallback** — if grep in the diff turn reveals no distinct technical-detail wrapper (only pillar mini-cards), `technical-map` will map to `trade-levels` and this will be explicit in the diff notes.
- **FIX 6 scope** — removes the single verified orphan (`hac-video-glint`). If any other unlabeled dot exists that grep missed (unlikely), pass a screenshot in approval and it'll be swept in the diff turn.
- Removing the login gate from `goReport` intentionally reduces friction ONLY for the single demo id; every other in-app report link still enforces auth via `AuthGatedReportLink` / `RequireAuth`.

---

### H. STOP — WAITING FOR FOUNDER APPROVAL — NOT DEPLOYED

Reply `APPROVED — DEPLOY` and I will produce the full unified diff, apply it, deploy, and run U1–U12.
