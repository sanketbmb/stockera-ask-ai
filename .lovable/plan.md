# Major Query → Report Pipeline Refactor

This is a large, multi-system change. I'll execute it in 5 sequenced phases so each can be verified before the next. Roughly 30–40 file changes, 2 new tables, 1 rewritten edge function, 1 new edge function.

## Phase 1 — Database (Supabase migration)

New tables (RLS enabled, owner-scoped + admin policies + service-role bypass):

- **`ai_reports`** — full columns as specified (intent, ltp_value/timestamp/source, pnl_state, prompt_version, llm_provider/model/tokens/cost, raw_llm_response, rendered_sections, requires_analyst_review, analyst_assigned_id, generated_at).
- **`audit_events`** — append-only (INSERT-only policy, no UPDATE/DELETE), with event_type, actor_id, resource_type/id, payload jsonb, ip, user_agent, occurred_at.

Add `intent` and `pnl_state` columns to `queries` for fast filtering.

## Phase 2 — Wizard Refactor (`/post-query`)

Restructure `QueryForm.tsx` into 3 steps:

1. **Question** — large textarea + 6 example chips + 8 question-type chips. Live intent classifier (regex first, LLM fallback) extracts stock/buy_price/holding from natural language.
2. **Context** — fields dynamically rendered by intent:
   - `stuck_position` / `should_average` → stock + buy price + holding duration
   - `buy_decision` → stock + horizon (no buy price)
   - `educational` / `sector_view` → optional related stock
   - Always: language + analyst preference
   - Auto-detected fields show "✓ Auto-detected — edit if wrong" pill
3. **Review** — clearer pricing copy ("AI report: free · Analyst video: included within 24h").

Other fixes:
- Replace red dots with neutral `Info` icons (lucide-react).
- Real NSE+BSE autocomplete via `/public/data/nse-bse-symbols.json` + Fuse.js (seed file with top ~500 symbols; cron to follow).

## Phase 3 — AI Report Page (`/report/$queryId`)

Rewrite `AIReportCard.tsx`. **Remove:** VERDICT word, stop loss, targets, support/resistance, "Powered by Gemini" footer, fixed 85% confidence.

**Add:**
- **Live Price Card** (LTP from Twelve Data, IST timestamp, exchange badge, source attribution).
- **Position Snapshot Card** (replaces verdict — stock, entry, LTP, P&L%, time held, gray-teal "Awaiting Analyst Review" badge).
- **Analyst Video Countdown** (HH:MM:SS to 24h from submission, analyst name/photo/SEBI reg, 3 "what your analyst will cover" bullets).
- **"What the AI can tell you"** — factual observations only.
- **"What only your analyst can tell you"** — personalized targets/SL/sizing teaser.
- **3-segment Confidence Bar** — Data Coverage / Recency / Specificity.
- **"Why we can't give you a target" tooltip.**
- **Follow-up chat box** at bottom.
- **Sticky compliance footer** — RA reg, BASL, grievance email, SCORES URL, Report ID, generated/market-data timestamps.
- **PDF watermark** — user email + report ID + timestamp on every page (via CSS print + html2canvas already used).

## Phase 4 — Edge Function `generate-ai-report`

New function replacing `gemini-analysis`. Steps a–i exactly as spec:

1. Fetch query → 2. Classify intent (Gemini Flash) → 3. Fetch LTP + financials + news (Twelve Data + Lovable AI grounded search for headlines, since no Perplexity key) → 4. Assemble structured context → 5. LLM call with strict JSON schema (Gemini 2.5 Pro grounded; Claude Opus if `ANTHROPIC_API_KEY` set later) → 6. **Guardrail check** (reject prohibited phrases + reject any non-null target/stop_loss field) → 7. Save to `ai_reports` → 8. Enqueue analyst review → 9. Return JSON.

System prompt saved as `supabase/functions/generate-ai-report/system-prompt.md` v1.0 (paste user-provided text — though I don't see it in the request, I'll author a compliant default and note it for the user to refine).

`pnl_state` is computed server-side (`fresh_entry` | `loss` | `small_gain` | `significant_gain`) and passed as a hard variable into the prompt.

## Phase 5 — Polish + CI

- Repurpose the bold verdict card design for a future `/analyst-video/$queryId` page (stub route, attributed to human RA).
- GitHub Actions workflow `prompt-tests.yml` with 50-query test suite asserting: no prohibited phrases, no numeric targets, intent accuracy >90%, JSON schema valid.
- Audit event firing on: query_submitted, ai_report_generated, analyst_assigned, video_uploaded, video_viewed, followup_sent, pdf_downloaded.

## Open Questions / Assumptions

1. **LLM SYSTEM PROMPT v1.0 block** referenced in PART 4 was not pasted in your message — I'll author a compliant default and you can refine.
2. **News API** — no Perplexity/NewsAPI key in your secrets. I'll use Gemini with Google Search grounding for headlines as a stand-in; swap later when you add a key.
3. **ANTHROPIC_API_KEY** — not in secrets; will leave Claude path behind an `if` and default to Gemini.
4. **NSE/BSE symbols JSON** — I'll seed `/public/data/nse-bse-symbols.json` with the top ~500 most-traded symbols. Daily cron pulling full list can come in a follow-up (would need an upstream source — NSE blocks scraping without headers).
5. **Analyst assignment** — there's no analyst auto-assignment logic today. I'll mark `requires_analyst_review=true` and `analyst_assigned_id=null`; an admin assigns from the dashboard. The countdown card will show "Analyst being assigned…" until then.

## Risk

This is a ~3–4 hour change. The biggest risk is the edge function rewrite breaking the existing report flow mid-way. I'll keep `gemini-analysis` intact until `generate-ai-report` is verified working, then switch `QueryForm.tsx` over in the last step.

**Reply "go" to proceed**, or tell me which open question to resolve first (especially #1 — the system prompt text).
