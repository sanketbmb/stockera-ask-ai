# Stage 4F.1 — Video Answers: Data Model + Entitlement Transaction (PLAN ONLY)

Scope of 4F.1 is deliberately narrow: get the **backend contract** for video answers correct and prove it end-to-end with a scripted UAT. **No UI surfaces** in 4F.1 — those land in 4F.2 (Library / MasterSearch / My Queries / stock-page Videos & Blogs) and 4F.3 (analyst upload flow).

Founder-confirmed constraints re-stated:

1. YouTube unlisted URLs only, oEmbed-validated. No direct hosting, no live streams, no auto-transcripts.
2. Per-video analyst-set credit price.
3. Permanent per-user entitlement (no rewatch window, no bundles).
4. No tier gating — any logged-in user can pay-per-video. Locked cards surfaced to everyone (logged-in or anonymous).
5. Bundle unlock, refunds UI, tier gating all **out of scope v1**.

---

## 1. Schema changes (single migration)

### 1a. Extend `public.answers`

```sql
ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS youtube_video_id      text,
  ADD COLUMN IF NOT EXISTS video_duration_sec    integer,
  ADD COLUMN IF NOT EXISTS unlock_price_credits  integer;

-- Enforce: if answer_type='video', youtube_video_id + unlock_price_credits must be present.
ALTER TABLE public.answers
  ADD CONSTRAINT answers_video_shape_chk
  CHECK (
    answer_type <> 'video'
    OR (youtube_video_id IS NOT NULL
        AND unlock_price_credits IS NOT NULL
        AND unlock_price_credits > 0)
  );

-- YouTube video id format guard (11-char base64url-ish).
ALTER TABLE public.answers
  ADD CONSTRAINT answers_youtube_video_id_fmt_chk
  CHECK (youtube_video_id IS NULL OR youtube_video_id ~ '^[A-Za-z0-9_-]{11}$');
```

`video_url` (existing column) is kept as the canonical unlisted URL; `youtube_video_id` is the derived embed handle. `answer_type` already exists in the enum.

### 1b. New `public.video_entitlements`

```sql
CREATE TABLE public.video_entitlements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answer_id     uuid NOT NULL REFERENCES public.answers(id) ON DELETE CASCADE,
  credits_used  integer NOT NULL CHECK (credits_used > 0),
  ledger_entry_id uuid REFERENCES public.wallet_ledger(id),
  unlocked_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, answer_id)
);

GRANT SELECT ON public.video_entitlements TO authenticated;
GRANT ALL    ON public.video_entitlements TO service_role;

ALTER TABLE public.video_entitlements ENABLE ROW LEVEL SECURITY;

-- Owner read only. Writes ONLY via SECURITY DEFINER RPC below (no insert policy).
CREATE POLICY "own entitlements read"
  ON public.video_entitlements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
```

### 1c. Extend `public.library_items`

```sql
ALTER TABLE public.library_items
  ADD COLUMN IF NOT EXISTS answer_id uuid REFERENCES public.answers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_library_items_answer_id
  ON public.library_items(answer_id) WHERE answer_id IS NOT NULL;
```

The `fn_project_answer_to_library` trigger already inserts a `library_items` row of `kind='video'` for every published answer; extend it in the same migration to also populate `answer_id = NEW.id`. No new surfaces in 4F.1 — this is just a stable join key for 4F.2.

### 1d. Atomic unlock RPC (`SECURITY DEFINER`)

Server-side transaction is the ONLY writer to `video_entitlements`. Debit + entitlement are one atomic unit; idempotency key is `video_unlock:{user_id}:{answer_id}` so a client retry can never double-debit.

```sql
CREATE OR REPLACE FUNCTION public.unlock_video_answer(p_answer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user      uuid := auth.uid();
  v_price     integer;
  v_existing  uuid;
  v_debit     jsonb;
  v_entry_id  uuid;
  v_new_ent   uuid;
  v_idem      text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('status','unauthenticated');
  END IF;

  SELECT unlock_price_credits INTO v_price
    FROM public.answers
   WHERE id = p_answer_id
     AND answer_type = 'video'
     AND is_published = true;

  IF v_price IS NULL THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;

  -- Idempotent: already unlocked → return success without any debit.
  SELECT id INTO v_existing
    FROM public.video_entitlements
   WHERE user_id = v_user AND answer_id = p_answer_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status','already_unlocked','entitlement_id',v_existing);
  END IF;

  v_idem := 'video_unlock:' || v_user::text || ':' || p_answer_id::text;

  -- Atomic: wallet_apply_debit already advisory-locks per user and honours idempotency.
  v_debit := public.wallet_apply_debit(
               p_user_id         => v_user,
               p_action_key      => 'video_answer',
               p_points          => v_price,
               p_query_id        => NULL,
               p_idempotency_key => v_idem);

  IF v_debit->>'status' NOT IN ('ok','idempotent_replay') THEN
    RETURN v_debit;   -- insufficient_funds etc. bubbles up as-is
  END IF;

  v_entry_id := NULLIF(v_debit->>'entry_id','')::uuid;

  INSERT INTO public.video_entitlements
    (user_id, answer_id, credits_used, ledger_entry_id)
  VALUES
    (v_user, p_answer_id, v_price, v_entry_id)
  ON CONFLICT (user_id, answer_id) DO NOTHING
  RETURNING id INTO v_new_ent;

  RETURN jsonb_build_object(
    'status','ok',
    'entitlement_id', v_new_ent,
    'credits_used', v_price,
    'new_balance', v_debit->'new_balance'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_video_answer(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.unlock_video_answer(uuid) TO authenticated;
```

Why this shape:

- `wallet_apply_debit` is the project's canonical debit path (advisory-locked, idempotent, ledger-writing). Reusing it means one code path for balance math and one entry in `wallet_ledger`.
- The RPC is the ONLY writer to `video_entitlements` — no client insert policy exists — so the "no double-debit" and "no fake entitlement" invariants are enforced at the DB layer, not by frontend discipline.
- `already_unlocked` short-circuits BEFORE the debit call, so a user hard-refreshing the modal cannot be charged twice even if idempotency key infra changes.

---

## 2. Server functions (client-safe modules)

Three server functions land under `src/lib/video-answers.functions.ts`. No UI wiring in 4F.1 — these are the callable contract 4F.2 will consume.


| Fn                                      | Auth                               | Purpose                                                                      | Return                                                                                                    |
| --------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `unlockVideoAnswer({ answerId })`       | `requireSupabaseAuth`              | Calls `public.unlock_video_answer` RPC                                       | `{ status, entitlement_id?, credits_used?, new_balance?, ... }`                                           |
| `getVideoAnswer({ answerId })`          | `requireSupabaseAuth`              | Returns locked stub or unlocked payload based on `video_entitlements` join   | `{ locked: true, price, poster_thumb, duration_sec, analyst } | { locked: false, youtube_video_id, ... }` |
| `listVideoAnswersForSymbol({ symbol })` | public (server publishable client) | Locked-only public list for stock-page tab (no youtube_video_id in response) | `Array<{ answer_id, title, price, duration_sec, analyst, published_at }>`                                 |


Notes:

- `getVideoAnswer` uses the authenticated `supabase` from middleware context so RLS on `video_entitlements` scopes the join to the caller.
- `listVideoAnswersForSymbol` uses the server publishable client (no session), reads only from `library_items`/`answers` joined columns that a `TO anon` SELECT policy already permits. It **never** returns `youtube_video_id`. This is the "locked cards surfaced to everyone" surface.
- Poster thumbnail is derived server-side as `https://i.ytimg.com/vi/{id}/hqdefault.jpg` and returned only in the locked stub — not sensitive.

---

## 3. Client bearer wiring

Confirm `src/start.ts` middleware already attaches the Supabase bearer token to `useServerFn` calls (used by earlier authenticated fns). No new client middleware needed. Route-loader rule stands: `unlockVideoAnswer` and `getVideoAnswer` are called from **components** (`useServerFn` + event handler / `useQuery`), never from a public-route loader.

---

## 4. Files touched in 4F.1

Backend / DB:

1. **new migration** — 1a (answers cols + checks), 1b (video_entitlements + grants + RLS + owner-read policy), 1c (library_items.answer_id + index + `fn_project_answer_to_library` update), 1d (`unlock_video_answer` RPC + grant).

Client-safe server fns (client module graph, protected by import guards):
2. **new** `src/lib/video-answers.functions.ts` — the 3 server fns above.

Types:
3. **edit** `src/integrations/supabase/types.ts` — auto-regenerated post-migration (Lovable pipeline handles this; not a manual edit).

**Not touched in 4F.1** (deferred to 4F.2 / 4F.3):

- `VideosBlogsTab.tsx`, `VideoAnswerPaymentModal.tsx`, `BookAnalystVideoButton.tsx`, `VideoAnswerUpload.tsx`
- `library-search/index.ts`, MasterSearch, My Queries, `/r/$queryId`
- `answers.answer_type='video'` producer path in `AnalystAnswerPanel.tsx` (still current text-only path; 4F.3 flips it)

---

## 5. UAT (backend-only, scripted, must pass before 4F.1 CLOSED)

Founder runs against a seeded published video answer (one-time seed via the insert tool, not a migration):

1. **Locked read (anon)** — `listVideoAnswersForSymbol({ symbol: 'INFY' })` from unauthenticated client returns the seeded row; response contains `price`, `duration_sec`, `poster_thumb`, and **must not** contain `youtube_video_id` or `video_url`.
2. **Locked read (authed, not yet unlocked)** — `getVideoAnswer({ answerId })` returns `{ locked: true, ... }`, no `youtube_video_id`.
3. **First unlock** — `unlockVideoAnswer({ answerId })` returns `status:'ok'`, debits exactly `unlock_price_credits`, writes one `wallet_ledger` row (`entry_type='debit_video_answer'`, negative amount), writes one `video_entitlements` row with matching `ledger_entry_id`.
4. **Idempotent replay** — same call within same session returns `status:'already_unlocked'`, ledger row count unchanged, entitlement row count unchanged, balance unchanged.
5. **Post-unlock read** — `getVideoAnswer({ answerId })` returns `{ locked: false, youtube_video_id, ... }`.
6. **Insufficient funds path** — drain wallet, call unlock on a fresh answer → `status:'insufficient_funds'`; no entitlement row created; no debit ledger row written.
7. **Concurrent unlock** — two parallel calls for the same (user, answer) result in exactly ONE `video_entitlements` row and ONE debit (advisory lock + UNIQUE constraint).
8. **RLS** — user B cannot SELECT user A's `video_entitlements` row (returns empty).

Acceptance criteria for CLOSURE:

- All 8 checks PASS.
- Migration re-runnable (idempotent DDL, all `IF NOT EXISTS` / `ADD CONSTRAINT` guarded).
- No writes to `video_entitlements` are possible from any client-side path (verified by attempted anon and authed `.insert()` both returning permission error).

---

## 6. Sequence and STOP points

1. Founder reviews this plan.
2. On approval → APPLY (single migration + one new `.functions.ts` file).
3. Seed one demo video answer via insert tool (one row in `answers`, one in `library_items` via trigger).
4. Run 8-check UAT.
5. STOP for founder audit before 4F.2 (surfaces) opens.

**Do not** chain into 4F.2 without explicit re-authorisation.  
  
APPROVED — Stage 4F.1 PLAN accepted, with mandatory corrections before APPLY.

Stage status update:

- 4D.1 is now CLOSED. Founder UAT passed on production.

- Analytics tab loads successfully on [https://asktheexpert.lovable.app/stock/INFY](https://asktheexpert.lovable.app/stock/INFY)

- No “This page didn’t load” error

- No console TypeError

- 4D.1 public sentiment shape is live and compliant

4F.1 approval is PLAN-only with 3 required corrections:

1. Migration must be truly rerunnable.

Do not rely on plain ADD CONSTRAINT / CREATE POLICY assumptions.

Guard constraints, policies, and trigger/function updates so the migration is safely re-runnable.

2. Public locked-list read path must be explicit.

Do not assume existing anon/public policies already allow the exact library_items + answers projection needed by listVideoAnswersForSymbol().

Before APPLY, confirm either:

- existing policies already cover it, or

- 4F.1 migration adds the minimal required public read policy for locked stubs.

3. answers video-shape constraint must match the stated canonical model.

If video_url remains the canonical unlisted YouTube URL and youtube_video_id is derived, then answer_type='video' must require:

- video_url IS NOT NULL

- youtube_video_id IS NOT NULL

- unlock_price_credits IS NOT NULL AND > 0

Additional note:

In UAT, do not hardcode a wallet_ledger entry_type string unless that is already canonical in the project.

It is enough to verify:

- exactly one debit ledger row exists

- amount matches unlock_price_credits

- ledger row links to entitlement via ledger_entry_id

- duplicate unlock does not create a second debit

If these corrections are adopted, 4F.1 may proceed to APPLY:

- single migration

- one new video-answers.functions.ts module

- regenerated Supabase types

Then run the 8-check backend UAT and STOP for founder audit before 4F.2.

&nbsp;