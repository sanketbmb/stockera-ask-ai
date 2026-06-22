## D1) `supabase/functions/ask-claude/index.ts` — verbatim

### Lines 440–490

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

### Lines 880–940

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

### Deployed function version / timestamp

I do not have a tool that returns the Supabase Edge Function deployment version number or deploy timestamp from the dashboard. The most recent deploy I performed in this thread was `ask-claude` at `2026-06-22 07:43:55 UTC` (reported earlier). For the authoritative version+timestamp please check: https://supabase.com/dashboard/project/pwicwmnutyahscbreqvg/functions/ask-claude/details

## D2) Variables used at the L908 gate

- **`mode`** — assigned at **L403**: `const mode = body?.mode;` where `body = await req.json()`. Validated at L404 to be either `"report_followup"` or `"homepage_assistant"`. For Open follow-ups it equals `"report_followup"`.
- **`followup_mode`** — assigned at **L417**: `const followup_mode: "explain" | "open" = body?.followup_mode === "open" ? "open" : "explain";`. Strictly `"explain"` unless the request body contains the literal string `"open"`.
- **`arow`** — assigned at **L889** from `supabase.from("ai_followups").insert({...}).select("id").single()`, awaited. If `aerr` is non-null, code returns 500 at **L905** before reaching the gate. Therefore at L908 either we have already returned, or `arow` is a row object — but `arow?.id` can still be falsy if PostgREST returned `data: null` despite no error (uncommon for `.single()` after a successful insert, but possible).

The assignment is definitely BEFORE the debit gate (L889 → L908).

## D3) Frontend invoke body — `src/components/report/AskClaudeFollowup.tsx` L219–226

```ts
const { data, error } = await supabase.functions.invoke("ask-claude", {
  body: {
    mode: "report_followup",       // literal string
    query_id: <redacted>,
    thread_id: <redacted>,
    user_message: <redacted>,
    followup_mode: <"explain" | "open">,
  },
});
```

Top-level keys: `mode`, `query_id`, `thread_id`, `user_message`, `followup_mode`. None are nested. `mode` is the literal string `"report_followup"`. `followupMode` state in the component is `"explain"` by default and toggles to `"open"` when the user picks the **Ask anything** tab (see L86 `useState<FollowupMode>("explain")` and toggle buttons at L494/L504).

## D4) Repo grep — debit flags

```
$ rg -n "STAGE_3A_DEBIT_ENABLED|MONETIZATION_ENABLED|DEBIT_ENABLED|debit.*flag|skip.*debit"
src/components/stock-picker/StockPickerFlow.tsx:276:      // no batch_id, so we skip the debit and notify the user — option (b).
```

- `STAGE_3A_DEBIT_ENABLED`: **0 matches**.
- `MONETIZATION_ENABLED`: **0 matches**.
- `DEBIT_ENABLED`: **0 matches**.
- `debit.*flag`: **0 matches**.
- `skip.*debit`: 1 match, unrelated (comment in `StockPickerFlow.tsx` about Stock Picker batch handling, not follow-ups).

`stock_picker_runtime_config` rows: this table is used for things like `paywall_v1_enabled`, `welcome_bonus`, `first_topup_bonus`, `action_costs`, `active_universe_snapshot_id`, `compute_fundamentals_twelvedata_fallback_enabled`, `video_answer_promo`. **`ask-claude/index.ts` does not read from `stock_picker_runtime_config` at all** (verified via grep — zero references in that file). Therefore no runtime-config flag can be silently disabling the Open-mode debit.

## D5) Execution order in `ask-claude/index.ts`

a) **Assistant row INSERT** into `ai_followups`: **L889–L904** (`const { data: arow, error: aerr } = await supabase.from("ai_followups").insert({...}).select("id").single();`), with `if (aerr) return json(..., 500)` at L905.

b) **Debit gate** runs at **L908**.

c) (a) is **BEFORE** (b). Linear flow, no branching between them.

d) Yes — `arow` is the result of step (a), and the `await` on the insert resolves before L905's error check, which is itself before L908. So by the time the gate evaluates, `arow` is either a row object (proceed) or the function has already returned 500 (gate never runs).

## D6) Diagnostic logging — confirmation

**Yes, confirmed.** When you approve the fix, I will insert the following block immediately before the L908 gate, deploy `ask-claude`, and leave it in place for at least one Open-mode UAT cycle:

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

No other code change is bundled with this log — it is purely observational, and will reveal which of the 5 conditions is false on the production rows you cited (`a76d85b3…` and `5f9ec188…`).

## Hard stops re-confirmed

No files written. No deploy. No migration. Razorpay / subscriptions / Analyst Video / homepage untouched. Awaiting founder `APPLY DEBIT FIX`.