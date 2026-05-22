# Forensic Diagnostic Report — `queries` insert + AI report generation

No code changes made (plan mode). Findings below.

---

## 1. Schema of `public.queries`

From the live DB schema:

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | — |
| stock_name | text | NO | — |
| stock_symbol | text | YES | — |
| buy_price | numeric | YES | — |
| current_price | numeric | YES | — |
| query_text | text | NO | — |
| query_type | text | YES | — |
| assigned_analyst_id | uuid | YES | — |
| status | query_status (enum) | YES | 'pending' |
| ai_report | jsonb | YES | — |
| intent | text | YES | — |
| pnl_state | text | YES | — |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

**Foreign keys:** none declared on `queries`.

---

## 2. RLS policies on `queries`

- `queries_own` — ALL — `auth.uid() = user_id`
- `queries_own_insert` — INSERT — WITH CHECK `auth.uid() = user_id`
- `queries_own_update` — UPDATE — `auth.uid() = user_id`
- `queries_analyst_read` — SELECT — `auth.uid() = assigned_analyst_id`
- `queries_analyst_update` — UPDATE — analyst or admin
- `queries_admin_read_all` — SELECT — admin

All correctly scoped. Nothing recursive, nothing that would hang.

---

## 3. Triggers on `queries`

**None.** `information_schema.triggers` returned 0 rows for `event_object_table='queries'`. The `notify_ai_report_ready` and `notify_expert_answer` functions exist but are NOT currently attached as triggers to `queries`.

→ The "Thread killed by timeout manager" theory of "trigger calling edge function" does **not** apply — there is no trigger to blame.

## 4. Functions created/modified in last 7 days

**None.** Query returned 0 rows.

---

## 5. Frontend insert — `src/components/query/QueryForm.tsx` lines 147–158

```ts
await supabase.from("queries").insert({
  user_id: user.id,
  stock_name: stockName || (intent === "educational" ? "Educational Query" : "Sector Query"),
  stock_symbol: stockSymbol || null,
  buy_price: buyPrice ? Number(buyPrice) : null,
  current_price: currentPrice ? Number(currentPrice) : null,
  query_text: queryText,
  query_type: intent,
  assigned_analyst_id: analystId,
  status: "pending",
}).select("id").single();
```

## 6. Frontend ↔ schema comparison

| Frontend field | Schema | Match |
|---|---|---|
| user_id | uuid NOT NULL | ✅ |
| stock_name | text NOT NULL (always non-empty via fallback) | ✅ |
| stock_symbol | text NULL | ✅ |
| buy_price | numeric NULL | ✅ |
| current_price | numeric NULL | ✅ |
| query_text | text NOT NULL | ✅ |
| query_type | text NULL | ✅ |
| assigned_analyst_id | uuid NULL | ✅ (assuming valid uuid or null) |
| status | enum query_status | ✅ ('pending' is valid) |

**No mismatches.** The insert payload is shape-correct.

Possible runtime gotcha: if `analystId` is an empty string `""` rather than `null`, the uuid cast would 400 — worth confirming in the QueryForm state init, but this would produce an instant 400, not a thread-timeout.

## 7. Triggers calling edge functions / complex logic

**None on `queries`.** The only complex trigger function in the DB is `handle_new_user` on `auth.users` (referral logic) — unrelated.

→ The "Thread killed by timeout manager" PostgREST errors are **not caused by triggers on `queries`**.

---

## Gemini model usage (your second question)

| Call site | Model |
|---|---|
| `callLLM` (report generation) — direct | `gemini-2.0-flash` |
| `fetchStockData` (LTP fallback) — direct | `gemini-2.0-flash` |
| `callLLM` Lovable fallback | `google/gemini-2.5-pro` via Lovable AI Gateway |

So direct Gemini = 2.0-flash everywhere; only the fallback bumps to 2.5-pro.

---

## API key placement audit

`GEMINI_API_KEY` is read **only** in `supabase/functions/generate-ai-report/index.ts` (lines 9, 217, 256 — `Deno.env.get("GEMINI_API_KEY")`). Supabase secrets already list `GEMINI_API_KEY` as set. No references in `.env`, `wrangler.jsonc`, GitHub workflows, or app code. **One place, already updated.**

---

## Edge function runtime state

`supabase--edge_function_logs` for `generate-ai-report` returned **"No logs found"** — meaning either (a) the function hasn't been invoked since the last deploy, or (b) it's not booting (syntax error / cold-start crash). This matters because if `generate-ai-report` 500s or never returns, the server function `generateAiReport` throws — but the **`queries` insert itself runs before that call** and is independent.

---

## Root-cause hypothesis for the 400 / "Thread killed" symptom

The `queries` insert is **not** the source of the timeout based on schema/RLS/trigger evidence. The most likely real cause of the user-visible failure chain is:

1. `queries` insert succeeds (200).
2. `generateAiReport` server fn calls the edge function.
3. Edge function calls Gemini → if quota / network hangs past the worker limit, the request is killed → frontend shows "Report generation failed".
4. The 400 on `/rest/v1/queries` you saw may be from a **different** call (e.g. the `audit_events` insert, or an analyst-profiles select with a bad filter), not the main query insert.

## Recommended next diagnostic steps (require your approval to execute)

1. Reproduce in the browser, capture the exact `/rest/v1/queries` 400 response body (it includes the Postgres error code/message — that pins it down in 1 read).
2. Invoke the edge function health check: `GET https://pwicwmnutyahscbreqvg.supabase.co/functions/v1/generate-ai-report` — confirms boot + env check.
3. Confirm `analystId` is `null` (not `""`) when no analyst is picked.
4. Tail recent `audit_events` inserts to see if those are the 400s.

Approve and I'll run them — or tell me to proceed straight to fixes.
