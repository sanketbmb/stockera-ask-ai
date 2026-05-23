## Goal

Let analysts attach a downloadable "Analyst Report" (a free giveaway file — PDF, DOC, XLS, image) to any query they answer. Surface that report to the user everywhere their answer appears (My Queries cards, /report/$queryId AI section, Expert Analysis section) with a clear "Analyst Report (giveaway report)" label, plus view + download.

## 1. Database (migration)

Add report fields to `public.answers`:
- `report_url text` — public URL in storage
- `report_filename text` — original filename for the download UI
- `report_mime text` — to pick the right icon (pdf/doc/xls/image)
- `report_size_bytes integer`
- `report_label text default 'Analyst Report'` — small label users see ("giveaway report")

Create a new public storage bucket `analyst-reports` (public read so users can download/preview by URL). Storage policies:
- Public SELECT on objects in `analyst-reports`
- INSERT/UPDATE/DELETE restricted to users with `analyst` or `admin` role (via `has_role`), folder = `${query_id}/...`

No changes to RLS on `answers` — existing policies already gate writes to the assigned analyst and reads to the query owner / published answers.

## 2. Analyst upload UI (admin side)

### `TextAnswerModal.tsx` (Dashboard → "Answer this query")
Add an optional **Analyst Report** section above the footer:
- File input (accept `.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg`)
- Max 15 MB, show filename + size + remove button after pick
- On Publish: if a file is selected, upload to `analyst-reports/${queryId}/${uuid}-${filename}` using the browser supabase client, get the public URL, then include `report_url`, `report_filename`, `report_mime`, `report_size_bytes` in the `answers` insert.

### `VideoAnswerUpload.tsx` (Upload Video flow)
Same optional Analyst Report picker so video answers can also ship with a giveaway report.

### Super Admin "Pending Queries" / queue rows
Add a small "Attach report" affordance on each pending row that opens the same TextAnswerModal pre-targeted at that query (the admin already has analyst privileges).

## 3. User-facing report card (shared component)

New `src/components/report/AnalystReportPill.tsx`:
- Small label row: `ANALYST REPORT · giveaway report`
- File icon (pdf/doc/xls/img by mime), filename, size
- Two buttons: **View** (opens `report_url` in new tab) and **Download** (anchor with `download={filename}`)
- Renders nothing when `report_url` is missing

Wire it into all three surfaces (also include the field in the supabase selects):

1. **`QueryHistoryCard.tsx`** (`/my-queries`) — show the pill inside the existing expert-answer block; also show it under the AI-answered card when an answer with a report exists.
2. **`ExpertAnswerSection.tsx`** (`/report/$queryId` Expert Analysis) — render the pill inside the text-answer Card, right under the verdict.
3. **`/report/$queryId` top header** — render a compact version of the pill in the AI Report header strip (top-left under the report title) when the most recent published answer for the query has a report attached. This needs the report fields added to the `answers` select in `ExpertAnswerSection` and a small prop bubble-up or a parallel query on the report route.

In `MyQueries.tsx` extend the `answers` select to include the new `report_*` columns.

## 4. Download UX

- Storage bucket is public → direct download via `<a href={report_url} download={report_filename}>`. No server function needed.
- Mime-based icon + a "Giveaway · free" micro-badge so it's obvious there's no charge.

## 5. Out of scope (to keep this tight)
- No payments / paywall on the report (always free giveaway, per user).
- No analytics on downloads (can add later).
- No edit-after-publish for the attached file (analyst would delete + re-publish, same as current answers).

## Technical notes
- `src/integrations/supabase/types.ts` regenerates automatically after the migration runs.
- Uploads use the browser client (`supabase.storage.from('analyst-reports').upload(...)`) since the analyst is authenticated; RLS on the bucket gates writes.
- All new UI uses existing semantic tokens; no new colors.

```text
answers table
  + report_url
  + report_filename
  + report_mime
  + report_size_bytes
  + report_label

storage
  + bucket: analyst-reports (public read, analyst/admin write)

UI
  TextAnswerModal       → file picker + upload on publish
  VideoAnswerUpload     → same picker
  SuperAdmin queue row  → "Attach report" entry point
  AnalystReportPill     → shared view/download card
    used in: QueryHistoryCard, ExpertAnswerSection, report header
```
