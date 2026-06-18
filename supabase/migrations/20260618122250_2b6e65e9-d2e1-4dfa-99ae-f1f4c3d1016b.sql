CREATE TABLE public.ai_followups (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_mode     text NOT NULL CHECK (conversation_mode IN ('report_followup','homepage_assistant')),
  thread_id             uuid NOT NULL,
  parent_followup_id    uuid NULL REFERENCES public.ai_followups(id) ON DELETE SET NULL,
  query_id              uuid NULL REFERENCES public.queries(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analyst_id            uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  role                  text NOT NULL CHECK (role IN ('user','assistant','system')),
  content               text NOT NULL,
  sources_used          jsonb NOT NULL DEFAULT '[]'::jsonb,
  route_decision        text NULL CHECK (route_decision IN (
                          'answered_direct',
                          'routed_to_ask_anything',
                          'refused_unsafe',
                          'fallback_used'
                        )),
  routed_query_id       uuid NULL REFERENCES public.queries(id) ON DELETE SET NULL,
  llm_provider          text NULL,
  llm_model             text NULL,
  llm_input_tokens      integer NULL,
  llm_output_tokens     integer NULL,
  llm_cost_usd          numeric(10,5) NULL,
  ip_address            inet NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_followup_requires_query_id
    CHECK (conversation_mode <> 'report_followup' OR query_id IS NOT NULL)
);

GRANT SELECT, INSERT ON public.ai_followups TO authenticated;
GRANT ALL ON public.ai_followups TO service_role;

CREATE INDEX idx_ai_followups_thread        ON public.ai_followups(thread_id, created_at);
CREATE INDEX idx_ai_followups_user_recent   ON public.ai_followups(user_id, created_at DESC);
CREATE INDEX idx_ai_followups_query         ON public.ai_followups(query_id) WHERE query_id IS NOT NULL;
CREATE INDEX idx_ai_followups_mode_recent   ON public.ai_followups(conversation_mode, created_at DESC);

ALTER TABLE public.ai_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_followups_select_own ON public.ai_followups
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY ai_followups_insert_own ON public.ai_followups
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY ai_followups_analyst_read ON public.ai_followups
  FOR SELECT USING (auth.uid() = analyst_id);

CREATE OR REPLACE VIEW public.v_ai_followup_usage_daily AS
SELECT
  date_trunc('day', created_at)        AS day,
  conversation_mode,
  llm_provider,
  COUNT(*)                              AS msg_count,
  COALESCE(SUM(llm_input_tokens),0)     AS input_tokens,
  COALESCE(SUM(llm_output_tokens),0)    AS output_tokens,
  COALESCE(SUM(llm_cost_usd),0)         AS cost_usd
FROM public.ai_followups
WHERE role = 'assistant'
GROUP BY 1,2,3;

GRANT SELECT ON public.v_ai_followup_usage_daily TO authenticated, service_role;