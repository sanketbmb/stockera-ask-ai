## Goal
Promote your existing account `satawatrishabh@gmail.com` (auth user `efe1db9f-d822-4e9d-85a6-0fe98ab00ddd`) to `admin` so `/admin/login` routes you into `/admin/super`.

## Why your current attempts fail
- `AdminLogin.tsx` requires an `admin` (or `analyst`) row in `public.user_roles`. Your account only has the default `user` row (created by `handle_new_user` trigger).
- `bootstrap-admin` edge function is gated by `ADMIN_EMAIL` + idempotency — it won't help promote an existing user.
- Direct `INSERT` into `user_roles` from the client is blocked by `user_roles_block_non_admin_writes` RLS (chicken-and-egg: only an admin can mint an admin).
- The only safe path to mint the first admin is a server-side migration using the service role (bypasses RLS).

## What I'll do (single migration)
Run one idempotent SQL statement:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('efe1db9f-d822-4e9d-85a6-0fe98ab00ddd', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.audit_events (event_type, actor_id, resource_type, resource_id, payload)
VALUES ('admin_granted', 'efe1db9f-d822-4e9d-85a6-0fe98ab00ddd', 'user',
        'efe1db9f-d822-4e9d-85a6-0fe98ab00ddd',
        jsonb_build_object('method','manual_promotion','email','satawatrishabh@gmail.com'));
```

No schema changes, no policy changes, no code changes. The migration tool runs as service role so RLS doesn't block it.

## After it runs
1. Hard refresh the preview, go to `/admin/login`.
2. Sign in with `satawatrishabh@gmail.com` + your password.
3. `AuthContext` will load `roles = ['user','admin']`, `isAdmin = true`, and you'll land at `/admin/super`.

## Out of scope
- No changes to `bootstrap-admin`, RLS, or `AdminLogin`. Those are working as designed.
- If you later want to promote others, do it from `/admin/super` while signed in as admin (the `user_roles_admin_manage` policy allows it).
