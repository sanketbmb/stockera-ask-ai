DELETE FROM public.sentiment_cache
WHERE jsonb_array_length(articles) = 0
  AND fetched_at > now() - interval '48 hours';