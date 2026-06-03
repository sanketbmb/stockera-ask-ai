ALTER TABLE public.queries DROP CONSTRAINT IF EXISTS queries_query_type_check;
ALTER TABLE public.queries ADD CONSTRAINT queries_query_type_check CHECK (
  query_type IN (
    'buy_decision', 'stuck_position', 'should_average', 'educational',
    'sector_view', 'other', 'sell_or_hold', 'average_down', 'stop_loss',
    'target', 'long_term', 'fresh_entry',
    'existing_position', 'averaging',
    'intraday', 'short-term', 'medium-term', 'long-term'
  )
);