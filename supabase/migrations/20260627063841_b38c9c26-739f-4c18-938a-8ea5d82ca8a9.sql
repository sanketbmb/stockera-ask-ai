-- L4C-5 — Bulk backfill of historical AI-answered queries into public.library_items.
-- 29 rows promoted
-- 1 dropped for PII hint
-- dropped id: 3ca1571b-0255-48f2-9639-3f1ca02f4c47
--
-- Verdict source path:  ai_report->'final_verdict'->>'action'
-- Summary source path:  COALESCE(ai_report->'final_verdict'->>'summary_reason', ai_report->>'summary')
-- Verdict literals outside the library_items CHECK whitelist
-- (BUY, HOLD, AVERAGE, EXIT, PARTIAL_EXIT, WAIT) are normalized:
--   WATCHLIST -> WAIT, SELL -> EXIT, AVOID -> EXIT, else NULL.
-- Generated columns search_tsv and trgm_blob are not written.
-- Rollback: see review_sql/20260627070000_l4c5_bulk_backfill_30_rollback.sql

WITH ids(qid) AS (
  VALUES
    ('842f7f85-870d-4b4e-9ba2-3b242a43ce0d'::uuid),
    ('8e40d420-c5be-4446-9dc4-4fc3f19ed575'::uuid),
    ('d3b8dcd1-c502-4c7e-916e-f5f2e84e3886'::uuid),
    ('ede8f263-3e4c-4e3d-b922-6630b35a4fba'::uuid),
    ('0208b577-876a-4016-8ff2-6c0050e6cc09'::uuid),
    ('1771284f-63b2-4a13-a6b2-32f1865a2b18'::uuid),
    ('29151231-58ac-4c6e-8900-8ae6d74e0e88'::uuid),
    ('92d4aa03-e778-4d17-a111-79954f578241'::uuid),
    ('5f69c470-9765-430c-9259-97506144c817'::uuid),
    ('5d5efee6-fe05-4b84-a2f0-b03ec037d4d1'::uuid),
    ('424be866-3e9a-4294-8fb4-48b7ba4227ef'::uuid),
    ('75bb3af9-b058-4b4c-8597-e6dc162afd61'::uuid),
    ('570b0b79-728b-4d34-bae9-1fcb29290346'::uuid),
    ('54e36ae3-9b7a-4d0a-b46b-818734b525dd'::uuid),
    ('cde623ee-8518-4d7a-9424-dc0326fcf2ed'::uuid),
    ('10806cec-7fb5-4600-a7dd-b3395c397989'::uuid),
    ('720ad8cd-02c1-418f-b1ab-11820a5afbde'::uuid),
    ('f605362e-ae22-43c8-a64d-491e4f894aec'::uuid),
    ('d5dbcdd7-4f11-4085-b389-c7357781c061'::uuid),
    ('178bc6cf-fbff-4527-837c-a84151e36735'::uuid),
    ('1740e034-a3ef-4452-b24f-156bf56fe993'::uuid),
    ('d98008c0-de9e-4956-9e4c-eea70ea0365d'::uuid),
    ('8a05b965-098d-423e-b34c-c28143f097b1'::uuid),
    ('76881640-ad4d-4f6c-a4e3-62d50e5b18ab'::uuid),
    ('76fdb83d-925d-424b-bf1e-662196fc3c70'::uuid),
    ('20a17101-95a5-4bcc-9a18-b611f098ea55'::uuid),
    ('369d2b73-2ad2-4d2c-ab19-16afee6f5eaa'::uuid),
    ('1c109845-87c0-4fcd-b30b-c6158fab0b00'::uuid),
    ('6c4c83bf-e50c-4f0e-b221-14e3284bf2d1'::uuid)
)
INSERT INTO public.library_items
  (kind, source_id, source_table, symbol, title, verdict, sector,
   analyst_id, body_excerpt, is_public, is_tombstoned, published_at)
SELECT
  'report',
  q.id,
  'queries',
  public.fn_normalize_symbol(COALESCE(q.stock_symbol, q.stock_name)),
  left(COALESCE(q.query_text, q.stock_name, ''), 140),
  CASE upper(q.ai_report->'final_verdict'->>'action')
    WHEN 'BUY' THEN 'BUY'
    WHEN 'HOLD' THEN 'HOLD'
    WHEN 'AVERAGE' THEN 'AVERAGE'
    WHEN 'EXIT' THEN 'EXIT'
    WHEN 'PARTIAL_EXIT' THEN 'PARTIAL_EXIT'
    WHEN 'WAIT' THEN 'WAIT'
    WHEN 'WATCHLIST' THEN 'WAIT'
    WHEN 'SELL' THEN 'EXIT'
    WHEN 'AVOID' THEN 'EXIT'
    ELSE NULL
  END,
  NULLIF(q.sector_canonical, ''),
  q.assigned_analyst_id,
  left(
    regexp_replace(
      COALESCE(
        q.ai_report->'final_verdict'->>'summary_reason',
        q.ai_report->>'summary',
        ''
      ),
      E'[#*_`>]', '', 'g'
    ),
    280
  ),
  true,
  false,
  COALESCE(q.created_at, now())
FROM public.queries q
JOIN ids ON ids.qid = q.id;

UPDATE public.queries
SET
  is_public_library = true,
  public_consent_at = now(),
  public_consent_anonymized = false
WHERE id IN (
  '842f7f85-870d-4b4e-9ba2-3b242a43ce0d','8e40d420-c5be-4446-9dc4-4fc3f19ed575',
  'd3b8dcd1-c502-4c7e-916e-f5f2e84e3886','ede8f263-3e4c-4e3d-b922-6630b35a4fba',
  '0208b577-876a-4016-8ff2-6c0050e6cc09','1771284f-63b2-4a13-a6b2-32f1865a2b18',
  '29151231-58ac-4c6e-8900-8ae6d74e0e88','92d4aa03-e778-4d17-a111-79954f578241',
  '5f69c470-9765-430c-9259-97506144c817','5d5efee6-fe05-4b84-a2f0-b03ec037d4d1',
  '424be866-3e9a-4294-8fb4-48b7ba4227ef','75bb3af9-b058-4b4c-8597-e6dc162afd61',
  '570b0b79-728b-4d34-bae9-1fcb29290346','54e36ae3-9b7a-4d0a-b46b-818734b525dd',
  'cde623ee-8518-4d7a-9424-dc0326fcf2ed','10806cec-7fb5-4600-a7dd-b3395c397989',
  '720ad8cd-02c1-418f-b1ab-11820a5afbde','f605362e-ae22-43c8-a64d-491e4f894aec',
  'd5dbcdd7-4f11-4085-b389-c7357781c061','178bc6cf-fbff-4527-837c-a84151e36735',
  '1740e034-a3ef-4452-b24f-156bf56fe993','d98008c0-de9e-4956-9e4c-eea70ea0365d',
  '8a05b965-098d-423e-b34c-c28143f097b1','76881640-ad4d-4f6c-a4e3-62d50e5b18ab',
  '76fdb83d-925d-424b-bf1e-662196fc3c70','20a17101-95a5-4bcc-9a18-b611f098ea55',
  '369d2b73-2ad2-4d2c-ab19-16afee6f5eaa','1c109845-87c0-4fcd-b30b-c6158fab0b00',
  '6c4c83bf-e50c-4f0e-b221-14e3284bf2d1'
);