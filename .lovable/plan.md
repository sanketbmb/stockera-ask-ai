
# Stage 4F.3 PLAN — Video Answer Publishing

Read-only plan. No files touched. No APPLY.

---

## A. Objective

Give staff a safe, minimal internal workflow to publish a YouTube-hosted analyst video answer into the product so that a user, **before spending credits**, can decide it is worth unlocking. Users must see: what question is being answered, which SEBI-registered analyst is answering, which stock it is about, a short teaser, title/caption, duration, thumbnail, and unlock price.

4F.3 is **authoring + management** on top of the frozen 4F.1 read/unlock contract and the 4F.2 UI. No changes to `unlock_video_answer`, `get_video_answer`, `list_public_video_answers_for_symbol`, `video_entitlements`, wallet logic, or the legacy `Book Analyst Video ₹100` upload path.

---

## B. Publisher roles and permissions

Recommended default: **both**, admin-first.

| Role | Create draft | Edit own draft | Publish | Unpublish | Edit published | Replace YT link | Delete |
|---|---|---|---|---|---|---|---|
| `admin` | ✅ any RA | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (soft) |
| `analyst` (RA) | ✅ own | ✅ own | ⚠️ own, gated by admin toggle (default OFF for MVP) | ✅ own | ✅ own | ✅ own | ❌ |
| user | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Rationale: existing RLS on `answers` already supports both surfaces (`admin_full_access` + `answers_analyst_manage where auth.uid() = expert_id`). For 4F.3 MVP, ship admin-first with a hidden feature flag `analyst_publish_enabled` (config row) — analysts can draft but only admins can flip `is_published=true`. This keeps SEBI-attribution and pricing under review.

Guardrails:
- `expert_id` must reference an `analyst_profiles` row with a non-null `sebi_reg_number`.
- Only `has_role(auth.uid(),'admin')` may set `unlock_price_credits` above a configured ceiling (e.g. 999) or below a floor (e.g. 49) — enforced in the write server fn, not the DB.
- Every publish/unpublish/edit writes an `audit_events` row.

---

## C. Exact surfaces in scope

New (all under existing admin/analyst gating):
1. `/admin/videos` — list + filter (status, analyst, symbol, created_at) with actions (edit / preview / publish / unpublish).
2. `/admin/videos/new` — create video answer (URL-first flow).
3. `/admin/videos/$answerId/edit` — edit draft or published metadata.
4. `/admin/videos/$answerId/preview` — renders the exact user-visible locked card + watch page as the target user would see, without debit (uses `getVideoAnswer` in a `preview=true` server fn variant OR a client-side render of the same components with in-memory metadata — plan §G).

Modified: `AdminDashboard` and (if analyst-publish is enabled) `AnalystProfile` gain a "Video answers" entry point.

Explicitly **out of scope**:
- Legacy `/admin/upload-answer/$queryId` (MP4 upload flow) — untouched.
- Any change to the user-facing 4F.2 surfaces.
- Custom-uploaded thumbnails (deferred, see §F/§G).

---

## D. Exact fields matrix

| Field | Kind | Source / notes |
|---|---|---|
| `answer_type` | **read-only** | Hard-coded `'video'` on insert. |
| YouTube URL | **required** (input only, not persisted directly) | Parsed → `youtube_video_id`. |
| `youtube_video_id` | **auto-derived** | Regex extract from URL (supports `youtu.be/`, `watch?v=`, `shorts/`, `embed/`). Unique per non-null value (see §G). |
| `title` / caption | **required** | New optional column recommended (`video_title`, see §G). If schema stays frozen, derived as "Analyst video on {stock_name}" — same as `fn_project_answer_to_library` today. |
| `body` (short description / teaser) | **required** (min 40 chars, max 400) | Reuses existing `answers.body` text column. Displayed as teaser under the locked card. |
| Question addressed (user-facing) | **required** | Canonical: `query_id` FK → `queries.query_text`. Fallback: staff-authored `question_addressed` text (see §G) when no user query exists (seeded / evergreen videos). |
| `query_id` | **required** | Existing NOT-NULL FK. Publisher must either pick an existing query OR click "Create synthetic query" to insert a system-owned `queries` row (`user_id = <SYSTEM_UID>`, `stock_symbol/name`, `query_text=<question addressed>`, `query_type='video_seed'`). |
| Stock symbol | **required** | Selected from `stock_master`. Written to the linked query row's `stock_symbol` (not to `answers`, which has no symbol column today). |
| Stock name | **auto-derived** | From `stock_master.company_name` given symbol. Written to `queries.stock_name`. |
| Exchange | **auto-derived** | From `stock_master.exchange`. |
| RA / expert answering | **required** | `expert_id` = analyst_profile.id. Dropdown of analysts with non-null `sebi_reg_number`. Admins may pick any; analysts locked to self. |
| `verdict` | **optional** | Free-select from existing verdict labels (`buy`/`hold`/`avoid`/`wait`/…). Surfaced in locked card. |
| `unlock_price_credits` | **required** | Integer, floor/ceiling enforced in server fn (see §B). Default suggestion pulled from `stock_picker_runtime_config.action_costs.video_answer.points` (currently 499). |
| `video_duration_sec` | **auto-derived, editable** | Fetched via YouTube oEmbed / server-side fetch when possible; editable manual override. Non-blocking on missing. |
| `poster_thumb` | **auto-derived** | Always `https://i.ytimg.com/vi/{youtube_video_id}/hqdefault.jpg`. Same public artifact 4F.1 exposes. |
| Custom thumbnail override | **out of scope for 4F.3** | Requires storage bucket + `video_thumbnail` write path. Column already exists; UI deferred to 4F.4 to keep 4F.3 tight. |
| `is_published` | **required action (toggle)** | Boolean; flipped only via explicit "Publish" / "Unpublish" button. Draft = `false`. |
| Publish scheduling | **out of scope** | No `published_at`/scheduled column added. Publish is immediate. |
| Tags / topics | **out of scope** | Deferred; existing library search already indexes symbol + verdict + body. |
| `key_level` / `time_horizon` / `risk_note` | **optional** | Existing columns; reuse as-is. Not surfaced pre-unlock. |
| `created_at` | **read-only** | DB default. |

---

## E. User-visible metadata BEFORE unlock

Rule: whatever a user sees pre-unlock must come from the 4F.1 payloads (`list_public_video_answers_for_symbol` for grids, `get_video_answer` locked branch for the watch route). This plan lists what 4F.3 must ensure is present.

| Surface | Fields shown pre-unlock |
|---|---|
| Stock page video card (`VideosBlogsTab`) | title (or "Analyst video on {stock}"), verdict badge, poster_thumb, duration, price chip, analyst name + "SEBI RA {reg}", "Answered on: {stock_name} ({symbol})". |
| Library card | Same as above plus body_excerpt teaser (already projected by `fn_project_answer_to_library`). |
| MasterSearch dropdown row | title, symbol, price chip, "By {analyst}". |
| Watch page header (locked branch) | title, verdict, stock, analyst attribution, duration, **question addressed** paragraph, short description teaser, unlock CTA. |
| My Queries "Unlocked videos" tab | Post-unlock only — unchanged from 4F.2. |

Explicitly YES pre-unlock: "Question answered: {…}" and "Answered by {RA} · SEBI RA {reg}". These are the founder's core "worth-it?" signals. Both must be added to the 4F.1 `list_…` and `get_video_answer(locked)` payload projections (see §G).

---

## F. File-by-file plan

New files:
- `src/routes/admin.videos.tsx` — list route (RequireAdmin OR RequireAnalyst-with-flag).
- `src/routes/admin.videos.new.tsx` — create route.
- `src/routes/admin.videos.$answerId.edit.tsx` — edit route.
- `src/routes/admin.videos.$answerId.preview.tsx` — preview route (renders LockedVideoCard + WatchPage-like shell using in-memory metadata; NO debit path).
- `src/pages/admin/VideoAnswersList.tsx`
- `src/pages/admin/VideoAnswerEditor.tsx` (shared by new / edit)
- `src/pages/admin/VideoAnswerPreview.tsx`
- `src/components/admin/video-answers/VideoUrlInput.tsx` — URL paste + YT ID derivation + duplicate warning.
- `src/components/admin/video-answers/QuerySelector.tsx` — search existing query OR "Create synthetic query" panel.
- `src/components/admin/video-answers/AnalystSelector.tsx` — RA dropdown gated by SEBI reg.
- `src/components/admin/video-answers/SymbolPicker.tsx` — stock_master search (or reuse existing picker if one exists).
- `src/lib/video-answers-admin.functions.ts` — server fns (see §G): `createVideoAnswerDraft`, `updateVideoAnswer`, `publishVideoAnswer`, `unpublishVideoAnswer`, `listAdminVideoAnswers`, `resolveYoutubeMetadata`, `createSyntheticSeedQuery`.
- `src/hooks/useAdminVideoAnswer.ts` — thin query wrapper for the editor.
- `src/lib/youtube-id.ts` — pure YT-URL → ID parser (reused by SSR + client, no side effects).

Modified files:
- `src/pages/admin/AdminDashboard.tsx` — add "Video answers" tile linking to `/admin/videos`.
- `src/routes/__root.tsx` — none (existing head suffices).
- (If §G additions land) `src/lib/video-answers.functions.ts` — extend the SELECT projections in `listVideoAnswersForSymbol` and the RPC-returned locked payload consumers to include the new safe columns. **RPCs themselves are NOT changed**; the extra columns are new nullable columns on `answers` + `queries` that the RPCs' `SELECT *`-style body already pass through, OR we add them to the RPC in a separate, narrowly-scoped migration (see §G decision).

Untouched (regression firewall):
- `src/pages/admin/VideoAnswerUpload.tsx`
- `src/routes/admin.upload-answer.$queryId.tsx`
- Every 4F.2 file: `LockedVideoCard`, `UnlockVideoModal`, `UnlockedVideoCard`, `VideoAnswerEmbed`, `useUnlockVideoAnswer`, `useVideoAnswer`, `v.$answerId.tsx`, `MyQueries.tsx`.
- Every 4F.1 file: `video-answers.functions.ts` unlock/get mutations, `my-video-entitlements.functions.ts`, RPCs, `video_entitlements`, wallet ledger.

---

## G. Backend / schema changes

Founder rule respected: **surface everything up front — nothing hidden inside the UI plan.**

### G.1 Strictly required (minimum set)

To meet founder requirement E ("question answered + answered by RA before unlock") with the current 4F.1 read RPCs, no new columns are strictly required — `get_video_answer` already returns `analyst`, `stock_name`, `symbol`, `verdict`, and (via `queries.query_text`, joinable by `query_id`) the question text. The **only real gap** is exposing `queries.query_text` inside the locked payload.

**Minimum backend delta:**
1. **Update `get_video_answer` RPC** to include `question_addressed: text` on the locked branch (derived: `COALESCE(a.question_addressed_override, q.query_text)`).
2. **Update `list_public_video_answers_for_symbol` RPC** to include `question_addressed: text` on each row.
3. **New column `answers.question_addressed_override text NULL`** — used only when the linked `queries.query_text` is a synthetic seed or when staff want to rewrite the user's messy question into a clean single sentence. Ships in 4F.3.
4. **New column `answers.video_title text NULL`** — optional caption override; renderers fall back to "Analyst video on {stock_name}". Purely additive.
5. **New column `answers.video_description text NULL`** — short pre-unlock teaser (40–400 chars). Renderers fall back to `body` truncated, then to a stock generic. Purely additive. (Alternative: reuse `body`, but `body` is already the post-unlock long-form; keeping them separate avoids leaking long-form snippets pre-unlock.)

All three columns are nullable additive; **no default backfill**, **no data migration**, **no impact on 4F.2 UI** (which does not read them yet — added to 4F.2 read paths as part of 4F.3 APPLY-2).

### G.2 Nice-to-have, deferred

- `answers.published_at timestamptz` for a "just now / 3d ago" chip that survives edits (today the UI uses `created_at`). Defer to 4F.4 unless the founder wants it in 4F.3.
- Custom thumbnail upload (bucket + upload flow) — defer.
- Scheduling — defer.
- Analyst self-publish flag — config row only, no schema.

### G.3 Not changed

- `video_entitlements`, `wallet_ledger`, `unlock_video_answer` RPC, wallet logic, RLS on any of the above.
- Legacy `answers.video_url` / `video_thumbnail` / `duration_seconds` — untouched; still owned by the legacy `Book Analyst Video ₹100` MP4 pipeline. 4F.3 writes only to the YT-family columns (`youtube_video_id`, `video_duration_sec`, `unlock_price_credits`) plus the three new nullable columns.

### G.4 Server functions (new, all admin/analyst-gated via `requireSupabaseAuth` + role check)

- `createVideoAnswerDraft({ youtubeUrl, expertId, queryId?, syntheticQuery?, priceCredits, verdict?, videoTitle?, videoDescription?, questionAddressedOverride?, videoDurationSec? })` — writes `answers` row with `answer_type='video'`, `is_published=false`. If `syntheticQuery` provided, inserts the query first inside a single transaction (server fn), assigning the caller-configured `SYSTEM_SEED_USER_ID` (config-row, not env — reviewable) as owner.
- `updateVideoAnswer({ answerId, ...patch })` — RLS enforces analyst-owns-answer OR admin.
- `publishVideoAnswer({ answerId })` — validates required fields present; sets `is_published=true`; writes audit row.
- `unpublishVideoAnswer({ answerId })` — flips `is_published=false`; writes audit row. Users with active entitlements retain access (RPC contract already handles this correctly).
- `listAdminVideoAnswers({ status?, expertId?, symbol?, q? })` — admin/analyst listing; RLS scopes analysts to own.
- `resolveYoutubeMetadata({ youtubeUrl })` — server-side fetch of YouTube oEmbed JSON to prefill title suggestion + duration hint. Best-effort; failures are non-blocking.
- `createSyntheticSeedQuery({ symbol, stockName, exchange, questionText })` — helper called by the editor when there is no user query.

### G.5 Migration count

**One** migration in 4F.3: adds three nullable columns and updates the two read RPCs (`get_video_answer`, `list_public_video_answers_for_symbol`) to project `question_addressed`. No RLS changes. No data changes.

---

## H. Draft / edit / publish / unpublish workflow

```
                ┌────────────────────────────┐
                │  /admin/videos  (list)     │
                └───────────┬────────────────┘
                            │ New
                            ▼
   ┌──────────────────────────────────────────────┐
   │ /admin/videos/new — VideoAnswerEditor         │
   │   1. Paste YouTube URL → derive youtube_id    │
   │      • duplicate check on youtube_video_id    │
   │      • oEmbed prefill (title, duration)       │
   │   2. Pick stock (SymbolPicker)                │
   │   3. Pick analyst (AnalystSelector)           │
   │   4. Question addressed:                      │
   │        (a) link existing query, OR            │
   │        (b) synthetic seed (auto-creates       │
   │            queries row via server fn)         │
   │   5. Fill video_title, video_description,     │
   │      verdict, unlock_price_credits            │
   │   6. Save Draft → is_published=false          │
   └───────────┬──────────────────────┬────────────┘
               │                      │
               ▼                      ▼
     ┌──────────────────┐   ┌───────────────────────┐
     │ Preview (locked  │   │ Edit (same editor,    │
     │ + watch shell)   │   │ pre-loaded)           │
     └────────┬─────────┘   └───────────┬───────────┘
              │ Publish                  │
              ▼                          ▼
       ┌──────────────────────────────────────┐
       │ Published → visible on stock page,   │
       │ library, MasterSearch, watch route   │
       │  Unpublish available at any time     │
       └──────────────────────────────────────┘
```

Validation gates before "Publish" is enabled:
- `youtube_video_id` present + parseable
- unique `youtube_video_id` (no other published row uses it)
- `expert_id` set, analyst has SEBI reg
- `query_id` set (real or synthetic)
- `unlock_price_credits` within floor/ceiling
- `video_description` (or `body`) ≥ 40 chars
- `video_duration_sec` present (auto-derived or manual)

Replace YouTube link: allowed on draft freely; on a **published** row it requires an admin (analyst is blocked) and writes an audit row noting the previous ID. It does **not** invalidate existing `video_entitlements` (unlock is per `answer_id`, not per YT ID).

---

## I. Validation & anti-regression rules

Client + server (Zod both sides):
- YouTube URL regex covers `youtu.be`, `watch?v=`, `shorts/`, `embed/`; 11-char ID; anything else → error.
- Duplicate `youtube_video_id` on `INSERT` and on `UPDATE` (partial unique index recommended; add in same migration: `CREATE UNIQUE INDEX ... ON answers(youtube_video_id) WHERE youtube_video_id IS NOT NULL AND answer_type='video'`).
- Price integer bounded server-side.
- `answer_type='video'` immutable after insert (server fn refuses to change it).

Anti-regression firewall:
- No 4F.3 file touches `VideoAnswerUpload.tsx` or the MP4 storage bucket.
- No 4F.3 file imports `unlockVideoAnswer` / `useUnlockVideoAnswer` / `useVideoAnswer` — publisher preview must not be routable through the user unlock path.
- No 4F.3 file writes to `video_entitlements` or `wallet_ledger`.
- Preview route must render `LockedVideoCard` in a mode where the unlock button is disabled/labeled "Preview only" and cannot open `UnlockVideoModal`.
- RPC changes are additive (new columns in return JSON only) — 4F.2 clients ignoring the new fields must keep working.

---

## J. UAT checklist

- **P-1 Auth**: anon/user redirected off `/admin/videos*`; analyst sees only own; admin sees all.
- **P-2 URL parse**: 4 URL shapes accepted, non-YT rejected.
- **P-3 Duplicate**: publishing a second row with the same `youtube_video_id` blocked with a clear error.
- **P-4 Synthetic query**: "Create synthetic query" writes a `queries` row owned by the system UID; the resulting video answer surfaces on the stock page and shows the seeded question in the watch header.
- **P-5 Draft invisible**: `is_published=false` row is absent from `list_public_video_answers_for_symbol`, absent from library, absent from MasterSearch, and locked payload for the watch route returns `not_found` for anon / other users.
- **P-6 Publish**: after Publish, row appears in all four user surfaces within one refetch cycle; locked payload shows `question_addressed`, `analyst.display_name`, `analyst.sebi_reg_number`, `verdict`, price, duration, poster.
- **P-7 Unpublish**: row disappears from all public surfaces; **existing entitlement holders retain playback** on `/v/$answerId` (regression check against 4F.1).
- **P-8 Edit metadata**: title/description/price/verdict edits reflect on the next locked payload fetch; no impact on `video_entitlements`.
- **P-9 Replace YT link (admin)**: allowed; audit row written; entitlement holders still get the new video on `/v/$answerId`. (Admin acknowledges the swap via confirm dialog.)
- **P-10 Replace YT link (analyst)**: blocked on published rows.
- **P-11 Preview**: renders exactly what a locked user sees, unlock button is inert, no debit possible.
- **P-12 Wallet firewall**: full publish → unpublish → edit → republish cycle produces zero rows in `wallet_ledger` and zero rows in `video_entitlements`.
- **P-13 Legacy untouched**: `/admin/upload-answer/$queryId` still uploads MP4s to the legacy `Book Analyst Video ₹100` pipeline unchanged; no shared components leak between the two pages.
- **P-14 Anti-leak carried forward**: no admin surface prints `youtube_video_id` to the DOM outside its owning `VideoAnswerEmbed`; preview uses embed only when user would already be unlocked (never on locked preview).
- **P-15 Mobile**: editor + list + preview usable at 360px.

---

## K. Recommended execution split

Three-part APPLY, each stopping for founder audit:

- **APPLY-1 — Backend delta (single migration + server fns)**
  - Migration: add `answers.question_addressed_override`, `answers.video_title`, `answers.video_description`; partial unique index on `youtube_video_id`; update `get_video_answer` and `list_public_video_answers_for_symbol` to project `question_addressed`.
  - New file `src/lib/video-answers-admin.functions.ts` with all seven server fns.
  - `src/lib/youtube-id.ts` + unit tests.
  - No UI. UAT subset: P-3, P-5 (via direct RPC calls), migration lint clean, RPC return shape verified.

- **APPLY-2 — Admin authoring UI**
  - Routes + pages + components under `admin.videos.*` and `src/pages/admin/VideoAnswer*` and `src/components/admin/video-answers/*`.
  - `AdminDashboard` tile.
  - Wires the APPLY-1 server fns.
  - UAT subset: P-1, P-2, P-4, P-6, P-7, P-8, P-9, P-10, P-11, P-15.

- **APPLY-3 — 4F.2 read-path surfacing of new fields**
  - Add `question_addressed`, `video_title`, `video_description` to `LockedVideoCardItem` and to the watch route locked header.
  - Update `VideosBlogsTab`, `library.$symbol.tsx`, `MasterSearch.tsx` to render the new fields when present (with fallbacks preserved).
  - UAT subset: P-6 end-to-end at user surfaces, P-12, P-13, P-14, G-1 anti-leak re-run.

Stop after each APPLY for founder audit. Do not open 4F.4.

---

STOP for founder review.
