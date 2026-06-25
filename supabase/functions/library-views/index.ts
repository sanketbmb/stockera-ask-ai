// @ts-nocheck
// Stockera library-views — L2 view-logger.
// POST /library-views { item_id } → { ok: true }
// Best-effort: drops on rate-limit, never throws to caller.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "*";

const CORS = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", ...CORS } });
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// In-memory per-IP rate limit: 10 inserts / minute.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (b.count >= 10) return false;
  b.count += 1;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const itemId = (body?.item_id ?? "").toString();
    if (!UUID_RE.test(itemId)) return json({ error: "invalid_item_id" }, 400);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!rateLimit(ip)) return json({ error: "rate_limited" }, 429);

    let viewerUserId: string | null = null;
    const authH = req.headers.get("Authorization");
    if (authH?.startsWith("Bearer ")) {
      try {
        const { data } = await anon.auth.getUser(authH.slice(7));
        viewerUserId = data?.user?.id ?? null;
      } catch (_e) { /* ignore */ }
    }

    await admin.from("library_item_views").insert({ item_id: itemId, viewer_user_id: viewerUserId });
    return json({ ok: true });
  } catch (e) {
    return json({ error: "view_log_failed", message: (e as Error).message }, 500);
  }
});
