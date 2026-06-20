// Stage 3A demo-only top-up. Founder demo accounts only.
// Hard-gated by: profiles.founder_beta = true AND runtime_config('demo_topup').enabled = true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function istDay(): string {
  // YYYY-MM-DD in Asia/Kolkata
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user?.id) return json({ error: "unauthorized" }, 401);
  const user_id = userRes.user.id;

  // Gate 1: founder_beta
  const { data: prof } = await supabase
    .from("profiles").select("founder_beta").eq("id", user_id).maybeSingle();
  if ((prof as any)?.founder_beta !== true) {
    return json({ error: "forbidden", reason: "not_founder_beta" }, 403);
  }

  // Gate 2: demo flag
  const { data: cfg } = await supabase
    .from("stock_picker_runtime_config")
    .select("config_value")
    .eq("config_key", "demo_topup")
    .maybeSingle();
  const enabled = (cfg as any)?.config_value?.enabled === true;
  if (!enabled) return json({ error: "forbidden", reason: "demo_disabled" }, 403);

  const idem = `demo:${user_id}:${istDay()}`;
  const { data: r, error: rerr } = await supabase.rpc("credit_wallet_topup", {
    p_user_id: user_id,
    p_points: 100,
    p_source: "demo_grant",
    p_idempotency_key: idem,
    p_metadata: { kind: "demo", granted_at: new Date().toISOString() },
  });
  if (rerr) {
    console.error("DEMO_TOPUP_RPC_ERROR", rerr);
    return json({ error: "rpc_failed", detail: rerr.message }, 500);
  }
  const status = (r as any)?.status ?? "unknown";
  const new_balance = (r as any)?.new_balance ?? null;
  return json({ status, new_balance, idempotency_key: idem });
});
