-- Tighten queries RLS
DROP POLICY IF EXISTS "queries_own_insert" ON public.queries;
CREATE POLICY "queries_own_insert" ON public.queries FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "queries_own_update" ON public.queries;
CREATE POLICY "queries_own_update" ON public.queries FOR UPDATE
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tighten answers RLS
DROP POLICY IF EXISTS "answers_read_query_owner" ON public.answers;
CREATE POLICY "answers_published_to_query_owner" ON public.answers FOR SELECT
USING (
  is_published = true AND
  EXISTS (SELECT 1 FROM public.queries WHERE id = query_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "answers_expert_own" ON public.answers;
CREATE POLICY "answers_expert_own" ON public.answers FOR SELECT
USING (auth.uid() = expert_id);

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT CHECK (type IN ('ai_report', 'expert_answer', 'referral', 'market', 'system')),
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);

-- Trigger: notify AI report ready
CREATE OR REPLACE FUNCTION public.notify_ai_report_ready()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.status = 'ai_answered' AND (OLD.status IS NULL OR OLD.status != 'ai_answered')) THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.user_id,
            'AI report ready for ' || NEW.stock_name,
            'Your AI analysis is ready. View the full report.',
            'ai_report',
            '/report/' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_ai_report ON public.queries;
CREATE TRIGGER trg_notify_ai_report AFTER INSERT OR UPDATE ON public.queries
FOR EACH ROW EXECUTE FUNCTION public.notify_ai_report_ready();

-- Trigger: notify expert answer published
CREATE OR REPLACE FUNCTION public.notify_expert_answer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _query_user UUID; _stock TEXT;
BEGIN
  IF NEW.is_published = true AND (OLD.is_published IS NULL OR OLD.is_published = false) THEN
    SELECT user_id, stock_name INTO _query_user, _stock FROM public.queries WHERE id = NEW.query_id;
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (_query_user,
            'Expert answered your ' || _stock || ' query',
            CASE WHEN NEW.answer_type = 'video' THEN '🎥 Video answer is ready to watch.' ELSE '📄 Read the expert''s analysis.' END,
            'expert_answer',
            '/my-queries');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_expert_answer ON public.answers;
CREATE TRIGGER trg_notify_expert_answer AFTER INSERT OR UPDATE ON public.answers
FOR EACH ROW EXECUTE FUNCTION public.notify_expert_answer();