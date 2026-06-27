-- L4C-5 ROLLBACK — reverts the 29-row backfill written by
-- supabase/migrations/20260627070000_l4c5_bulk_backfill_30.sql
-- REVIEW ONLY. Not auto-applied. Apply via SQL editor if rollback is needed.
--
-- 29 rows reverted (same IDs promoted by the forward migration).
-- 1 dropped for PII hint (never promoted): 3ca1571b-0255-48f2-9639-3f1ca02f4c47

BEGIN;

DELETE FROM public.library_items
WHERE source_table = 'queries'
  AND source_id IN (
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

UPDATE public.queries
SET
  is_public_library = false,
  public_consent_at = NULL,
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

COMMIT;
