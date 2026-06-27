BEGIN;

-- PII-REGEX-2A
-- Purpose:
--   Codify the locked PII hazard prose from docs/master-library-spec.md v3.1
--   into a reusable SQL function:
--     public.fn_has_pii_hint(text) -> boolean
--
-- Scope:
--   - NO widening in 2A
--   - NO trigger creation
--   - NO data mutation
--   - Self-test stays inside the same transaction so any failure
--     aborts the migration and the function never lands.
--
-- Locked token set (exact transcription only):
--   1) Email addresses (RFC-light)
--   2) Phone numbers (10-13 digits, optional +, spaces, dashes)
--   3) Aadhaar-style 12-digit groups (optional spaces)
--   4) PAN cards ([A-Z]{5}[0-9]{4}[A-Z])
--   5) "my profit"
--   6) "my loss"
--   7) "my capital"
--   8) "purchased at"
--   9) "holding from"
--  10) "entered at"
--  11) "bought at"
--  12) "average price"
--  13) "avg price"
--
-- Human override locked separately:
--   2B will widen forward and grandfather the 6 already-live rows
--   by UUID allowlist. 2A intentionally does NOT widen.

CREATE OR REPLACE FUNCTION public.fn_has_pii_hint(p_text text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $fn$
DECLARE
  v_text text := COALESCE(p_text, '');
BEGIN
  IF btrim(v_text) = '' THEN
    RETURN FALSE;
  END IF;

  RETURN
    -- 1) Email (RFC-light)
    v_text ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'

    OR

    -- 2) Phone numbers: optional +, digits with optional spaces/dashes,
    --    roughly aligned to the locked 10-13 digit prose
    v_text ~* '(^|[^0-9])\+?\d[\d\s-]{8,13}\d([^0-9]|$)'

    OR

    -- 3) Aadhaar-style 12-digit groups, optional spaces
    v_text ~* '(^|[^0-9])\d{4}\s?\d{4}\s?\d{4}([^0-9]|$)'

    OR

    -- 4) PAN
    v_text ~* '(^|[^A-Z0-9])[A-Z]{5}[0-9]{4}[A-Z]([^A-Z0-9]|$)'

    OR

    -- 5-13) Exact phrase patterns, no widening beyond DOCS-1c lock-set
    v_text ~* '\y(my profit|my loss|my capital|purchased at|holding from|entered at|bought at|average price|avg price)\y';
END;
$fn$;

COMMENT ON FUNCTION public.fn_has_pii_hint(text)
IS 'PII-REGEX-2A: codification of DOCS-1c spec lock-set (4 structured + 9 phrase tokens). Lock-set corrected from super-agent draft to restore my profit / my loss / my capital phrases per DOCS-1c line 337. No widening beyond spec, no triggers.';

DO $selftest$
DECLARE
  v_positive_text text;
  v_negative_ids uuid[] := ARRAY[
    '842f7f85-870d-4b4e-9ba2-3b242a43ce0d'::uuid,
    '8e40d420-c5be-4446-9dc4-4fc3f19ed575'::uuid,
    'd3b8dcd1-c502-4c7e-916e-f5f2e84e3886'::uuid,
    'ede8f263-3e4c-4e3d-b922-6630b35a4fba'::uuid,
    '0208b577-876a-4016-8ff2-6c0050e6cc09'::uuid,
    '1771284f-63b2-4a13-a6b2-32f1865a2b18'::uuid,
    '29151231-58ac-4c6e-8900-8ae6d74e0e88'::uuid,
    '92d4aa03-e778-4d17-a111-79954f578241'::uuid,
    '5f69c470-9765-430c-9259-97506144c817'::uuid,
    '5d5efee6-fe05-4b84-a2f0-b03ec037d4d1'::uuid,
    '424be866-3e9a-4294-8fb4-48b7ba4227ef'::uuid,
    '75bb3af9-b058-4b4c-8597-e6dc162afd61'::uuid,
    '570b0b79-728b-4d34-bae9-1fcb29290346'::uuid,
    '54e36ae3-9b7a-4d0a-b46b-818734b525dd'::uuid,
    'cde623ee-8518-4d7a-9424-dc0326fcf2ed'::uuid,
    '10806cec-7fb5-4600-a7dd-b3395c397989'::uuid,
    '720ad8cd-02c1-418f-b1ab-11820a5afbde'::uuid,
    'f605362e-ae22-43c8-a64d-491e4f894aec'::uuid,
    'd5dbcdd7-4f11-4085-b389-c7357781c061'::uuid,
    '178bc6cf-fbff-4527-837c-a84151e36735'::uuid,
    '1740e034-a3ef-4452-b24f-156bf56fe993'::uuid,
    'd98008c0-de9e-4956-9e4c-eea70ea0365d'::uuid,
    '8a05b965-098d-423e-b34c-c28143f097b1'::uuid,
    '76881640-ad4d-4f6c-a4e3-62d50e5b18ab'::uuid,
    '76fdb83d-925d-424b-bf1e-662196fc3c70'::uuid,
    '20a17101-95a5-4bcc-9a18-b611f098ea55'::uuid,
    '369d2b73-2ad2-4d2c-ab19-16afee6f5eaa'::uuid,
    '1c109845-87c0-4fcd-b30b-c6158fab0b00'::uuid,
    '6c4c83bf-e50c-4f0e-b221-14e3284bf2d1'::uuid
  ];

  v_negative_count integer;
  v_negative_hits uuid[];
BEGIN
  -- Guardrail: negative fixture list must be exact and complete.
  IF COALESCE(array_length(v_negative_ids, 1), 0) <> 29 THEN
    RAISE EXCEPTION
      'PII-REGEX-2A self-test aborted: expected exactly 29 negative fixture UUIDs, got %',
      COALESCE(array_length(v_negative_ids, 1), 0);
  END IF;

  -- Positive fixture must exist.
  SELECT q.query_text
    INTO v_positive_text
  FROM public.queries q
  WHERE q.id = '3ca1571b-0255-48f2-9639-3f1ca02f4c47'::uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'PII-REGEX-2A self-test failed: positive fixture row 3ca1571b-0255-48f2-9639-3f1ca02f4c47 not found';
  END IF;

  -- Positive fixture query_text must still contain the "my profit" anchor.
  -- If this fails, the row was edited and the fixture is no longer authoritative.
  IF v_positive_text !~* '\ymy profit\y' THEN
    RAISE EXCEPTION
      'PII-REGEX-2A self-test failed: positive fixture row 3ca1571b… no longer contains "my profit" phrase; fixture may have been edited';
  END IF;

  -- Positive fixture must flag TRUE.
  IF NOT public.fn_has_pii_hint(v_positive_text) THEN
    RAISE EXCEPTION
      'PII-REGEX-2A self-test failed: positive fixture row 3ca1571b-0255-48f2-9639-3f1ca02f4c47 did not flag TRUE';
  END IF;

  -- All 29 negative fixtures must exist.
  SELECT count(*)
    INTO v_negative_count
  FROM public.queries q
  WHERE q.id = ANY (v_negative_ids);

  IF v_negative_count <> 29 THEN
    RAISE EXCEPTION
      'PII-REGEX-2A self-test failed: expected 29 negative fixture rows present in public.queries, found %',
      v_negative_count;
  END IF;

  -- All 29 negative fixtures must flag FALSE.
  SELECT array_agg(q.id ORDER BY q.id)
    INTO v_negative_hits
  FROM public.queries q
  WHERE q.id = ANY (v_negative_ids)
    AND public.fn_has_pii_hint(q.query_text);

  IF v_negative_hits IS NOT NULL THEN
    RAISE EXCEPTION
      'PII-REGEX-2A self-test failed: negative fixture rows incorrectly flagged: %',
      array_to_string(v_negative_hits, ', ');
  END IF;
END;
$selftest$;

COMMIT;