ALTER TABLE public.wallet_ledger
  ADD CONSTRAINT wallet_ledger_entry_type_check_new
  CHECK (entry_type = ANY (ARRAY[
    'welcome_bonus','welcome_expired','topup','topup_bonus',
    'first_topup_free_video','subscription_grant','subscription_rollover_capped',
    'referral_referrer','referral_referee',
    'debit_ai_report','debit_video_answer','debit_live_session',
    'debit_sector_view','debit_stock_picker',
    'admin_grant','admin_revoke','refund_quality','refund_failed_action',
    'debit_followup_open'
  ])) NOT VALID;

ALTER TABLE public.wallet_ledger
  VALIDATE CONSTRAINT wallet_ledger_entry_type_check_new;

ALTER TABLE public.wallet_ledger
  DROP CONSTRAINT wallet_ledger_entry_type_check;

ALTER TABLE public.wallet_ledger
  RENAME CONSTRAINT wallet_ledger_entry_type_check_new
  TO wallet_ledger_entry_type_check;