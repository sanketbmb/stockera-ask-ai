## D1) Exact source: `ask-claude/index.ts` lines 440–490

```ts
      .eq("user_id", user_id)
      .eq("role", "user");
    if ((threadCount ?? 0) >= 10) {
      return json({ error: "thread_limit_reached", limit: 10 }, 429);
    }
    const { count: dayCount } = await supabase
      .from("ai_followups")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("role", "user")
      .eq("conversation_mode", "report_followup")
      .gte("created_at", since);
    if ((dayCount ?? 0) >= 50) {
      return json({ error: "daily_limit_reached", limit: 50 }, 429);
    }
  }

  // Stage 3A: Open-mode wallet preflight (20 pts) — founder_beta bypass.
  // INVARIANT: Explain mode is FREE. Never preflight, never debit.
  const OPEN_FOLLOWUP_COST_PTS = 20;
  const isExplainFollowup = mode === "report_followup" && followup_mode === "explain";
  let isBeta = false;
  if (!isExplainFollowup && mode === "report_followup" && followup_mode === "open") {
    const { data: prof } = await supabase
      .from("profiles").select("founder_beta").eq("id", user_id).maybeSingle();
    isBeta = (prof as any)?.founder_beta === true;
    if (!isBeta) {
      const { data: wb } = await supabase
        .from("wallet_balances").select("balance").eq("user_id", user_id).maybeSingle();
      const bal = Number((wb as any)?.balance ?? 0);
      if (bal < OPEN_FOLLOWUP_COST_PTS) {
        return json({
          error: "insufficient_points",
          points_required: OPEN_FOLLOWUP_COST_PTS,
          points_available: bal,
          paywall: true,
        }, 402);
      }
    }
  }



  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // Step 4: Insert user message
  const { error: insertUserErr } = await supabase.from("ai_followups").insert({
    conversation_mode: mode,
    thread_id,
    parent_followup_id,
    query_id: mode === "report_followup" ? query_id : null,
```

## D1) Exact source: `ask-claude/index.ts` lines 880–940

```ts
            title: c.title,
            source: c.source,
            published_at: c.published_at ?? null,
            tool: c.tool,
          })),
        ]
      : [];

  // Step 10: Persist assistant
  const { data: arow, error: aerr } = await supabase.from("ai_followups").insert({
    conversation_mode: mode,
    thread_id,
    query_id: mode === "report_followup" ? query_id : null,
    user_id,
    role: "assistant",
    content: finalText,
    sources_used: sourcesUsedArray,
    route_decision: routeDecision,
    llm_provider: llm.provider,
    llm_model: llm.model,
    llm_input_tokens: llm.input_tokens,
    llm_output_tokens: llm.output_tokens,
    llm_cost_usd: costUsd,
    ip_address: ip,
  }).select("id").single();
  if (aerr) return json({ error: "persist_failed", detail: aerr.message }, 500);

  // Stage 3A: Open-mode post-success debit. Founder_beta bypassed in preflight.
  if (!isExplainFollowup && mode === "report_followup" && followup_mode === "open" && !isBeta && arow?.id) {
    try {
      const idem = `followup_open:${arow.id}`;
      const { data: dr } = await supabase.rpc("wallet_apply_debit", {
        p_user_id: user_id,
        p_action_key: "followup_open",
        p_points: OPEN_FOLLOWUP_COST_PTS,
        p_query_id: query_id ?? null,
        p_idempotency_key: idem,
      });
      const st = (dr as any)?.status;
      if (st !== "ok" && st !== "idempotent_replay") {
        await supabase.from("wallet_debit_failures").insert({
          user_id, assistant_row_id: arow.id, query_id: query_id ?? null,
          action_key: "followup_open", points_attempted: OPEN_FOLLOWUP_COST_PTS,
          rpc_status: st ?? "null", rpc_payload: dr ?? null, idempotency_key: idem,
        });
        console.error("WALLET_DEBIT_FAIL", { user_id, assistant_row_id: arow.id, status: st });
      }
    } catch (e) {
      console.error("WALLET_DEBIT_THROW", (e as Error).message);
      await supabase.from("wallet_debit_failures").insert({
        user_id, assistant_row_id: arow.id, query_id: query_id ?? null,
        action_key: "followup_open", points_attempted: OPEN_FOLLOWUP_COST_PTS,
        rpc_status: "exception", rpc_payload: { message: (e as Error).message },
        idempotency_key: `followup_open:${arow.id}`,
      });
    }
  }

  // Step 11: Return
  return json({
```

## D2) Variables used at L908

- **`mode` check:** reads local `const mode = body?.mode;` from parsed request JSON at line 403.
- **`followup_mode` check:** reads local `const followup_mode: "explain" | "open" = body?.followup_mode === "open" ? "open" : "explain";` at line 417.
- **`arow` variable:** assigned at lines 889–904 from the assistant insert:

```ts
const { data: arow, error: aerr } = await supabase.from("ai_followups").insert({ ... }).select("id").single();
```

Assignment happens immediately before the debit gate. If the insert succeeds and `.single()` returns the inserted id, `arow?.id` should be present. If `aerr` exists, code returns 500 before the gate. The code does not log the `arow?.id` value before the gate.

## D3) Frontend request body shape on Open-mode submit

From `src/components/report/AskClaudeFollowup.tsx` lines 219–226:

```ts
{
  mode,
  query_id,
  thread_id,
  user_message,
  followup_mode,
}
```

The frontend sends **`mode` and `followup_mode` as separate top-level fields**, not nested under another key.

Open-mode submit uses these top-level keys:

```json
{
  "mode": "...",
  "query_id": "...",
  "thread_id": "...",
  "user_message": "...",
  "followup_mode": "..."
}
```

## D4) Early return / try-catch swallow / feature flag between assistant insert and debit block

Between assistant insert and debit gate:

```ts
if (aerr) return json({ error: "persist_failed", detail: aerr.message }, 500);

// Stage 3A: Open-mode post-success debit. Founder_beta bypassed in preflight.
if (!isExplainFollowup && mode === "report_followup" && followup_mode === "open" && !isBeta && arow?.id) {
```

There is **no early return, try/catch swallow, or feature flag between the assistant row insert and the L908 debit gate**.

I found **no `STAGE_3A_DEBIT_ENABLED`, `MONETIZATION_ENABLED`, or similar debit feature flag** in `ask-claude/index.ts`. The only environment reads in this file are:

```ts
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY
LOVABLE_API_KEY
LLM_PROVIDER
CLAUDE_MODEL
```

So there is no prod flag value to paste for debit enablement.

## D5) Assistant row insert order vs debit block

The assistant row insert happens **BEFORE** the debit block.

Execution order:

1. Build `sourcesUsedArray`.
2. Insert assistant row into `ai_followups` and assign `arow`.
3. If `aerr`, return 500.
4. Run L908 debit gate using `arow?.id`.
5. Return success response.

Therefore, `arow?.id` should not be null due to execution order, assuming `.insert(...).select("id").single()` returns data.

## D6) Temporary diagnostic logging proposal

Confirmed: in the fix deploy, I will include this log immediately before the L908 gate:

```ts
console.log("[debit-gate]", {
  mode,
  followup_mode,
  isExplainFollowup,
  isBeta,
  hasArowId: !!arow?.id,
  gate_passed: !isExplainFollowup && mode === "report_followup"
                && followup_mode === "open" && !isBeta
                && !!arow?.id
});
```

## Diagnosis summary

The deployed code still has `!isBeta` in the post-success debit gate:

```ts
if (!isExplainFollowup && mode === "report_followup" && followup_mode === "open" && !isBeta && arow?.id) {
```

That means founder-beta users will be preflight-bypassed **and debit-bypassed**. The current comment says “Founder_beta bypassed in preflight,” but the code also bypasses post-success debit for beta users.

For non-beta reproductions, the most likely silent skip variable is one of: `followup_mode !== "open"`, `mode !== "report_followup"`, or `!arow?.id`; the proposed `[debit-gate]` log will identify which condition is false on the next deploy.

## Proposed fix plan for later approval only

After founder reply `APPLY DEBIT FIX`:

1. Add the `[debit-gate]` diagnostic log immediately before L908.
2. Remove `!isBeta` from the post-success debit gate so founder-beta only bypasses preflight, not post-success debit.
3. Keep Explain invariant unchanged: Explain mode never preflights and never debits.
4. Do not touch Razorpay, subscriptions, Analyst Video, homepage, deterministic router, query type detection, Stage 2.3.2 context logic, Explain success path, Claude model, Stage 2.3.3 copy, or `Topup.tsx`.
5. Deploy only `ask-claude` if approved.
6. Verify logs and DB evidence only; do not run founder UAT.