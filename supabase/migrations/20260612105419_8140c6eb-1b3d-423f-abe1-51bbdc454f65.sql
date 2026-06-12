INSERT INTO public.stock_picker_runtime_config (config_key, kind, config_value, description, updated_at) VALUES
  ('news_marketaux_enabled', 'enable_flag', 'true'::jsonb, 'Phase 2X.5: enable Marketaux per-symbol fan-out', now()),
  ('news_rss_fallback_enabled', 'enable_flag', 'true'::jsonb, 'Phase 2X.5: enable Indian RSS fallback', now()),
  ('news_freshness_max_days', 'threshold', '30'::jsonb, 'Phase 2X.5: max age in days for inserted news items', now()),
  ('news_per_symbol_max_items', 'threshold', '5'::jsonb, 'Phase 2X.5: max items per symbol per run', now()),
  ('news_marketaux_request_sleep_ms', 'threshold', '600'::jsonb, 'Phase 2X.5: sleep between Marketaux calls', now()),
  ('news_rss_request_sleep_ms', 'threshold', '400'::jsonb, 'Phase 2X.5: sleep between RSS feed fetches', now()),
  ('news_rss_feed_list', 'identifier', '[{"id":"et_markets","url":"https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"},{"id":"moneycontrol_business","url":"https://www.moneycontrol.com/rss/business.xml"},{"id":"moneycontrol_markets","url":"https://www.moneycontrol.com/rss/marketreports.xml"},{"id":"business_standard_markets","url":"https://www.business-standard.com/rss/markets-106.rss"},{"id":"livemint_markets","url":"https://www.livemint.com/rss/markets"}]'::jsonb, 'Phase 2X.5: Indian financial RSS feed list', now())
ON CONFLICT (config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      kind = EXCLUDED.kind,
      description = EXCLUDED.description,
      updated_at = now();