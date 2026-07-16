PLAN
- Target: `supabase/functions/stock-picker-write-audit/index.ts`
- Change: In `runWritePickAudit`, the `supabase.rpc('stock_picker_write_audit_row', ...)` call must pass the three new named parameters to Postgres so it resolves to the 19-param overload instead of the old 16-param overload.
- The three parameters to add (exactly these, and only these) are:
  - `p_was_incumbent: params.p_was_incumbent ?? false`
  - `p_is_top_pick: params.p_is_top_pick ?? false`
  - `p_persistence_reason: params.p_persistence_reason ?? null`
- They must be inserted right after the existing `p_legal_name: params.p_legal_name` line in the RPC call block.
- Anchors left untouched:
  - `runWriteBatchRejection` and its RPC call to `stock_picker_write_batch_rejection_row`
  - HTTP handler, request/response envelope shapes, validation helpers, idempotency logic, regulatory stamp/composite gate logic
  - Every other file, function, table, and migration
- Note: The file in the repo already contains the 19-param RPC call, so the only remaining action after approval is to deploy the current version.

DIFF
```diff
commit 0d5063c4913222769653b59ff31f6e66b068b647
Author: gpt-engineer-app[bot] <159125892+gpt-engineer-app[bot]@users.noreply.github.com>
Date:   Fri Jul 10 08:03:03 2026 +0000

    Changes
    
    Co-authored-by: sanketbmb <251591480+sanketbmb@users.noreply.github.com>

diff --git a/supabase/functions/stock-picker-write-audit/index.ts b/supabase/functions/stock-picker-write-audit/index.ts
index f974904..e9813a9 100644
--- a/supabase/functions/stock-picker-write-audit/index.ts
+++ b/supabase/functions/stock-picker-write-audit/index.ts
@@ -232,8 +232,12 @@ async function runWritePickAudit(
     p_regulatory_status_at_generation: params.p_regulatory_status_at_generation,
     p_reg_no: params.p_reg_no,
     p_legal_name: params.p_legal_name,
+    p_was_incumbent: params.p_was_incumbent ?? false,
+    p_is_top_pick: params.p_is_top_pick ?? false,
+    p_persistence_reason: params.p_persistence_reason ?? null,
   });
 
+
   if (error) {
     if (isUniqueViolationOnConstraint(error as PgErrorLike, UQ_PICK_AUDIT)) {
       return { op: 'write_pick_audit', ok: true, deduped: true };
```

STOP — awaiting your `APPROVED` reply before deploying `stock-picker-write-audit`.