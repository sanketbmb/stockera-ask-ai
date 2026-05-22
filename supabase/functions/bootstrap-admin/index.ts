// @ts-nocheck
// One-shot admin bootstrap. Idempotent. Safe to leave deployed.
// Reads ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD from Edge Function secrets.
// Never logs the email or password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");
    const ADMIN_INITIAL_PASSWORD = Deno.env.get("ADMIN_INITIAL_PASSWORD");

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ ok: false, error: true, code: "MISSING_RUNTIME",
        message: "Supabase runtime secrets missing" }, 500);
    }
    if (!ADMIN_EMAIL || !ADMIN_INITIAL_PASSWORD) {
      return json({ ok: false, error: true, code: "MISSING_BOOTSTRAP_SECRETS",
        message: "Bootstrap secrets not configured. Set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD in Edge Function Secrets, then invoke this function once." }, 500);
    }
    console.log("STEP 1: secrets read");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // STEP 2 — idempotency guard
    const { data: existing, error: roleErr } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1);
    if (roleErr) {
      return json({ ok: false, error: true, code: "ROLE_CHECK_FAILED",
        message: roleErr.message }, 500);
    }
    if (existing && existing.length > 0) {
      console.log("STEP 2: admin already exists, exiting");
      return json({ ok: false, reason: "admin_already_exists" }, 409);
    }
    console.log("STEP 2: no existing admin found");

    // STEP 3 — create auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_INITIAL_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Stockera Admin" },
    });
    if (createErr || !created?.user) {
      return json({ ok: false, error: true, code: "CREATE_USER_FAILED",
        message: createErr?.message ?? "createUser returned no user" }, 500);
    }
    const uid = created.user.id;
    console.log("STEP 3: auth user created");

    // STEP 4 — upsert profile (handle_new_user trigger may already have inserted)
    const { error: profErr } = await admin
      .from("profiles")
      .upsert({ id: uid, full_name: "Stockera Admin", onboarding_completed: true });
    if (profErr) {
      console.error("STEP 4 profile upsert error:", profErr.message);
    } else {
      console.log("STEP 4: profile upserted");
    }

    // STEP 5 — insert admin role (trigger inserts 'user'; we add 'admin')
    const { error: roleInsErr } = await admin
      .from("user_roles")
      .insert({ user_id: uid, role: "admin" });
    if (roleInsErr) {
      return json({ ok: false, error: true, code: "ROLE_INSERT_FAILED",
        message: roleInsErr.message }, 500);
    }
    console.log("STEP 5: admin role granted");

    // STEP 6 — audit
    await admin.from("audit_events").insert({
      event_type: "admin_bootstrapped",
      actor_id: uid,
      resource_type: "user",
      resource_id: uid,
      payload: { method: "bootstrap_endpoint" },
    });
    console.log("STEP 6: audit recorded");

    return json({ ok: true, user_id: uid });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("BOOTSTRAP_UNHANDLED", message);
    return json({ ok: false, error: true, code: "UNHANDLED", message }, 500);
  }
});
