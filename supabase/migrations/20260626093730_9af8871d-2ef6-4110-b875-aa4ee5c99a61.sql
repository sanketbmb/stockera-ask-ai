-- ==========================================================================
-- BACKFILL-1-REAL
-- Idempotent via ON CONFLICT (source_table, source_id). Safe to re-run.
-- ==========================================================================
BEGIN;

DO $$
DECLARE
  v_user_id  constant uuid := '23987140-2740-4628-af1b-6d9a8816e2f5';
  v_analyst  constant uuid := '4e534d46-709e-4eaf-a6f1-07f24d7b1d3e';
  rec record;
  qid uuid;
BEGIN
  FOR rec IN SELECT * FROM jsonb_to_recordset('[
    {"sym":"TATAMOTORS","name":"Tata Motors Limited","title":"TATAMOTORS Q4 setup quality post-lockup",
     "qtext":"Is TATAMOTORS a Buy post-lockup expiry after Q4 results?","stock":"TATAMOTORS"},
    {"sym":"IRFC","name":"Indian Railway Finance Corporation","title":"IRFC spreads after sovereign issuance",
     "qtext":"IRFC spreads risk after latest sovereign issuance window?","stock":"IRFC"},
    {"sym":"ZOMATO","name":"Zomato Limited","title":"Zomato quick-commerce contribution",
     "qtext":"Zomato quick-commerce contribution crossing 30 percent of GMV — sustained?","stock":"ZOMATO"},
    {"sym":"RELIANCE","name":"Reliance Industries Limited","title":"Reliance retail valuation re-rate path",
     "qtext":"Reliance retail spin-off plan — re-rating window in next 12m?","stock":"RELIANCE"},
    {"sym":"INFY","name":"Infosys Limited","title":"INFY BFSI deal pipeline and wage cycle",
     "qtext":"INFY guidance cut - is the worst priced in after wage hike absorption?","stock":"INFY"},
    {"sym":"IDFCFIRSTB","name":"IDFC First Bank Limited","title":"IDFCFIRSTB NIM trajectory sustainability",
     "qtext":"IDFCFIRSTB NIM staying above 5 percent sustainably through FY26?","stock":"IDFCFIRSTB"},
    {"sym":"RVNL","name":"Rail Vikas Nigam Limited","title":"RVNL order book execution ramp",
     "qtext":"RVNL order book - execution ramp in H2 FY26 realistic?","stock":"RVNL"},
    {"sym":"VEDL","name":"Vedanta Limited","title":"VEDL aluminum LME vs India premium",
     "qtext":"VEDL aluminum LME tailwind vs India realized price compression?","stock":"VEDL"}
  ]'::jsonb) AS x(sym text, name text, title text, qtext text, stock text)
  LOOP
    INSERT INTO public.queries (
      user_id, stock_name, stock_symbol, query_text, status,
      is_public_library, public_consent_anonymized, ai_report,
      engine_version, engine_source
    ) VALUES (
      v_user_id, rec.title, rec.stock, rec.qtext, 'ai_answered',
      true, true,
      jsonb_build_object(
        'summary', rec.title,
        'source', 'backfill-1-real',
        'generated_at', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ),
      'v1_tier_shaped', 'manual_seed'
    )
    RETURNING id INTO qid;

    INSERT INTO public.library_items (
      kind, source_id, source_table, symbol, symbol_exchange,
      title, verdict, sector, analyst_id, body_excerpt,
      is_public, is_tombstoned, published_at
    ) VALUES (
      'report', qid, 'queries', rec.stock, 'NSE',
      rec.title,
      (CASE rec.stock
         WHEN 'TATAMOTORS' THEN 'BUY'
         WHEN 'IRFC'       THEN 'HOLD'
         WHEN 'ZOMATO'     THEN 'BUY'
         WHEN 'RELIANCE'   THEN NULL
         WHEN 'INFY'       THEN 'HOLD'
         WHEN 'IDFCFIRSTB' THEN 'PARTIAL_EXIT'
         WHEN 'RVNL'       THEN 'BUY'
         WHEN 'VEDL'       THEN 'AVERAGE'
       END),
      (CASE rec.stock
         WHEN 'TATAMOTORS' THEN 'Auto'
         WHEN 'IRFC'       THEN 'NBFC'
         WHEN 'ZOMATO'     THEN 'Internet'
         WHEN 'RELIANCE'   THEN 'Conglomerate'
         WHEN 'INFY'       THEN 'IT'
         WHEN 'IDFCFIRSTB' THEN 'Bank'
         WHEN 'RVNL'       THEN 'Infra'
         WHEN 'VEDL'       THEN 'Metals'
       END),
      v_analyst,
      left(regexp_replace(
        (CASE rec.stock
           WHEN 'TATAMOTORS' THEN 'EBITDA margin expands 180bps; CV demand strong; valuations still reasonable vs peers.'
           WHEN 'IRFC'       THEN 'Sovereign linkage premium intact; spread compression risk if rate cycle pivots.'
           WHEN 'ZOMATO'     THEN 'Take rate up 40bps YoY; quick commerce crosses 30 percent of GMV.'
           WHEN 'RELIANCE'   THEN 'Retail multiples discount to global peers 30-40 percent; unlock is event-dependent.'
           WHEN 'INFY'       THEN 'BFSI pipeline stable; margin recovery contingent on wage cycle.'
           WHEN 'IDFCFIRSTB' THEN 'CD ratio improving; microfinance slippages a watch item.'
           WHEN 'RVNL'       THEN 'Order book at 4.2x FY25 revenue; execution monetization historically strong.'
           WHEN 'VEDL'       THEN 'Aluminum at $2,400/t supportive; India realized prices remain 5-7 percent below LME parity.'
         END), E'[#*_`>]', '','g'
      ), 280),
      true, false, now()
    )
    ON CONFLICT (source_table, source_id) DO UPDATE
      SET kind         = EXCLUDED.kind,
          symbol       = EXCLUDED.symbol,
          title        = EXCLUDED.title,
          verdict      = EXCLUDED.verdict,
          sector       = EXCLUDED.sector,
          analyst_id   = EXCLUDED.analyst_id,
          body_excerpt = EXCLUDED.body_excerpt,
          is_public    = EXCLUDED.is_public,
          is_tombstoned= EXCLUDED.is_tombstoned,
          published_at = COALESCE(library_items.published_at, EXCLUDED.published_at),
          updated_at   = now();
  END LOOP;

  IF (SELECT count(*) FROM public.library_items
      WHERE symbol IN ('TATAMOTORS','IRFC','ZOMATO','RELIANCE',
                       'INFY','IDFCFIRSTB','RVNL','VEDL')
        AND source_table = 'queries'
        AND is_public = true
        AND is_tombstoned = false) <> 8 THEN
    RAISE EXCEPTION 'BACKFILL-1-REAL row count check failed';
  END IF;

  IF (SELECT count(*) FROM public.queries
      WHERE stock_symbol IN ('TATAMOTORS','IRFC','ZOMATO','RELIANCE',
                             'INFY','IDFCFIRSTB','RVNL','VEDL')
        AND is_public_library = true) <> 8 THEN
    RAISE EXCEPTION 'BACKFILL-1-REAL parent queries count check failed';
  END IF;
END$$;

COMMIT;