-- ACTION REQUIRED: Set GEMINI_API_KEY in Supabase Edge Function secrets.
-- Go to: Supabase Dashboard → Project Settings → Edge Functions → Secrets
-- Add secret: GEMINI_API_KEY = your Google AI Studio API key (from aistudio.google.com)
-- Without this secret, the generate-ai-report edge function has no LLM provider and will always fail.
-- The .env file does NOT propagate to edge functions — secrets must be set in the dashboard.
SELECT 1;