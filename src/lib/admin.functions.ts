import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

async function audit(payload: {
  actor_id: string;
  event_type: string;
  resource_type?: string;
  resource_id?: string | null;
  payload: Record<string, unknown>;
}) {
  await supabaseAdmin.from("audit_events").insert({
    event_type: payload.event_type,
    actor_id: payload.actor_id,
    resource_type: payload.resource_type ?? null,
    resource_id: payload.resource_id ?? null,
    payload: payload.payload as never,
  });
}

// ───────────────────────── Overview / stats ─────────────────────────
export const getAdminOverviewStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // Queries with a published expert answer are NOT pending — get those ids first.
    const { data: answered } = await supabaseAdmin
      .from("answers").select("query_id").eq("is_published", true);
    const answeredIds = Array.from(new Set((answered ?? []).map((a) => a.query_id))).filter(Boolean) as string[];
    const notAnsweredFilter = answeredIds.length
      ? `(${answeredIds.map((id) => `"${id}"`).join(",")})`
      : null;

    const pendingBase = () => supabaseAdmin
      .from("queries").select("id", { count: "exact", head: true })
      .in("status", ["pending", "ai_answered", "in_review"]);
    const unassignedBase = () => supabaseAdmin
      .from("queries").select("id", { count: "exact", head: true })
      .in("status", ["pending", "ai_answered", "in_review"])
      .is("assigned_analyst_id", null);

    const [users, pendingApps, todayQueries, pendingQ, unassignedQ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("analyst_profiles").select("id", { count: "exact", head: true }).eq("is_approved", false),
      supabaseAdmin.from("queries").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
      notAnsweredFilter ? pendingBase().not("id", "in", notAnsweredFilter) : pendingBase(),
      notAnsweredFilter ? unassignedBase().not("id", "in", notAnsweredFilter) : unassignedBase(),
    ]);
    return {
      users: users.count ?? 0,
      pendingApplications: pendingApps.count ?? 0,
      queriesToday: todayQueries.count ?? 0,
      pendingQueries: pendingQ.count ?? 0,
      unassignedQueries: unassignedQ.count ?? 0,
    };
  });

export const getPlatformStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [ai, text, vid, ttae] = await Promise.all([
      supabaseAdmin.from("ai_reports").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("answers").select("id", { count: "exact", head: true }).eq("answer_type", "text").eq("is_published", true),
      supabaseAdmin.from("answers").select("id", { count: "exact", head: true }).eq("answer_type", "video").eq("is_published", true),
      supabaseAdmin.from("answers").select("created_at, query_id, queries(created_at)").eq("is_published", true).limit(500),
    ]);
    const samples = (ttae.data ?? []) as Array<{ created_at: string; queries: { created_at: string } | null }>;
    const diffs = samples
      .map((r) => r.queries ? (new Date(r.created_at).getTime() - new Date(r.queries.created_at).getTime()) / 3600000 : null)
      .filter((x): x is number => x !== null && x > 0);
    const avgHours = diffs.length ? diffs.reduce((s, x) => s + x, 0) / diffs.length : 0;
    return {
      aiReports: ai.count ?? 0,
      textAnswers: text.count ?? 0,
      videoAnswers: vid.count ?? 0,
      avgHoursToExpert: Number(avgHours.toFixed(1)),
    };
  });

export const getQueriesPerDay14d = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const since = new Date(); since.setDate(since.getDate() - 13); since.setHours(0, 0, 0, 0);
    const { data } = await supabaseAdmin
      .from("queries")
      .select("created_at")
      .gte("created_at", since.toISOString());
    const buckets: Record<string, number> = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(since); d.setDate(since.getDate() + i);
      buckets[d.toISOString().slice(0, 10)] = 0;
    }
    (data ?? []).forEach((r) => {
      const key = (r.created_at as string).slice(0, 10);
      if (key in buckets) buckets[key] += 1;
    });
    return Object.entries(buckets).map(([date, count]) => ({ date: date.slice(5), count }));
  });

// ───────────────────────── Queries (admin) ─────────────────────────
export const getAllQueriesForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: queries } = await supabaseAdmin
      .from("queries")
      .select("id, stock_name, stock_symbol, query_type, query_text, status, ai_report, assigned_analyst_id, user_id, created_at, buy_price, current_price")
      .order("created_at", { ascending: false })
      .limit(200);

    const userIds = Array.from(new Set((queries ?? []).map((q) => q.user_id)));
    const analystIds = Array.from(new Set((queries ?? []).map((q) => q.assigned_analyst_id).filter(Boolean) as string[]));
    const qIds = (queries ?? []).map((q) => q.id);

    const [profilesRes, analystRes, answersRes, usersRes] = await Promise.all([
      userIds.length ? supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [] }),
      analystIds.length ? supabaseAdmin.from("analyst_profiles").select("id, display_name, sebi_reg_number").in("id", analystIds) : Promise.resolve({ data: [] }),
      qIds.length ? supabaseAdmin.from("answers").select("query_id, answer_type, is_published").in("query_id", qIds).eq("is_published", true) : Promise.resolve({ data: [] }),
      userIds.length ? supabaseAdmin.auth.admin.listUsers({ perPage: 200 }) : Promise.resolve({ data: { users: [] } as { users: Array<{ id: string; email?: string }> } }),
    ]);

    const profMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
    const analystMap = new Map((analystRes.data ?? []).map((a) => [a.id, a]));
    const emailMap = new Map(((usersRes.data?.users ?? []) as Array<{ id: string; email?: string }>).map((u) => [u.id, u.email ?? null]));
    const ansMap = new Map<string, { text: boolean; video: boolean }>();
    (answersRes.data ?? []).forEach((a) => {
      if (!a.query_id) return;
      const r = ansMap.get(a.query_id) ?? { text: false, video: false };
      if (a.answer_type === "text") r.text = true;
      if (a.answer_type === "video") r.video = true;
      ansMap.set(a.query_id, r);
    });

    return (queries ?? []).map((q) => ({
      ...q,
      user_name: profMap.get(q.user_id)?.full_name ?? null,
      user_email: emailMap.get(q.user_id) ?? null,
      analyst_name: q.assigned_analyst_id ? analystMap.get(q.assigned_analyst_id)?.display_name ?? null : null,
      analyst_sebi: q.assigned_analyst_id ? analystMap.get(q.assigned_analyst_id)?.sebi_reg_number ?? null : null,
      has_text_answer: ansMap.get(q.id)?.text ?? false,
      has_video_answer: ansMap.get(q.id)?.video ?? false,
    }));
  });

export const getApprovedAvailableAnalysts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("analyst_profiles")
      .select("id, display_name, sebi_reg_number, sebi_type, is_available")
      .eq("is_approved", true)
      .order("display_name");
    return data ?? [];
  });

export const assignQueryToAnalyst = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { queryId: string; analystId: string }) =>
    z.object({ queryId: z.string().uuid(), analystId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { data: prev } = await supabaseAdmin.from("queries").select("assigned_analyst_id, stock_name").eq("id", data.queryId).single();
    const { error } = await supabaseAdmin
      .from("queries")
      .update({ assigned_analyst_id: data.analystId, status: "in_review" })
      .eq("id", data.queryId);
    if (error) throw new Error(error.message);
    await audit({
      actor_id: context.userId,
      event_type: "admin_action",
      resource_type: "query",
      resource_id: data.queryId,
      payload: { action: "query_assigned", from_analyst: prev?.assigned_analyst_id ?? null, to_analyst: data.analystId },
    });
    await supabaseAdmin.from("notifications").insert({
      user_id: data.analystId,
      type: "assignment",
      title: "New query assigned to you",
      body: `You've been assigned a query on ${prev?.stock_name ?? "a stock"}.`,
      link: "/admin/dashboard",
    });
    return { ok: true };
  });

// ───────────────────────── Users (admin) ─────────────────────────
export const getAllUsersForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, avatar_url, wallet_balance, referral_code, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    const ids = (profiles ?? []).map((p) => p.id);
    const [rolesRes, qCountRes, usersRes] = await Promise.all([
      ids.length ? supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? supabaseAdmin.from("queries").select("user_id").in("user_id", ids) : Promise.resolve({ data: [] }),
      supabaseAdmin.auth.admin.listUsers({ perPage: 200 }),
    ]);
    const rolesMap = new Map<string, string[]>();
    (rolesRes.data ?? []).forEach((r) => {
      const arr = rolesMap.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesMap.set(r.user_id, arr);
    });
    const qCount = new Map<string, number>();
    (qCountRes.data ?? []).forEach((q) => qCount.set(q.user_id, (qCount.get(q.user_id) ?? 0) + 1));
    const emailMap = new Map(((usersRes.data?.users ?? []) as Array<{ id: string; email?: string }>).map((u) => [u.id, u.email ?? null]));

    return (profiles ?? []).map((p) => ({
      ...p,
      email: emailMap.get(p.id) ?? null,
      roles: rolesMap.get(p.id) ?? [],
      queries_count: qCount.get(p.id) ?? 0,
    }));
  });

// ───────────────────────── Analyst approvals ─────────────────────────
export const getAnalystApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: analysts } = await supabaseAdmin
      .from("analyst_profiles")
      .select("*")
      .order("is_approved", { ascending: true })
      .order("created_at", { ascending: false });
    const ids = (analysts ?? []).map((a) => a.id);
    const [profilesRes, usersRes, answersRes] = await Promise.all([
      ids.length ? supabaseAdmin.from("profiles").select("id, full_name").in("id", ids) : Promise.resolve({ data: [] }),
      supabaseAdmin.auth.admin.listUsers({ perPage: 200 }),
      ids.length ? supabaseAdmin.from("answers").select("expert_id").in("expert_id", ids).eq("is_published", true) : Promise.resolve({ data: [] }),
    ]);
    const profMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
    const emailMap = new Map(((usersRes.data?.users ?? []) as Array<{ id: string; email?: string }>).map((u) => [u.id, u.email ?? null]));
    const ansCount = new Map<string, number>();
    (answersRes.data ?? []).forEach((a) => ansCount.set(a.expert_id, (ansCount.get(a.expert_id) ?? 0) + 1));
    return (analysts ?? []).map((a) => ({
      ...a,
      full_name: profMap.get(a.id)?.full_name ?? a.display_name,
      email: emailMap.get(a.id) ?? null,
      total_answers: ansCount.get(a.id) ?? 0,
    }));
  });

export const approveAnalyst = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analystId: string }) => z.object({ analystId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { data: ap, error: apErr } = await supabaseAdmin
      .from("analyst_profiles")
      .update({ is_approved: true, is_available: true })
      .eq("id", data.analystId)
      .select("sebi_reg_number")
      .single();
    if (apErr) throw new Error(apErr.message);
    // Add analyst role idempotently (user_roles has unique(user_id,role))
    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.analystId, role: "analyst" });
    if (insErr && !/duplicate|unique/i.test(insErr.message)) throw new Error(insErr.message);
    await audit({
      actor_id: context.userId,
      event_type: "admin_action",
      resource_type: "analyst_profile",
      resource_id: data.analystId,
      payload: { action: "analyst_approved", sebi_reg: ap?.sebi_reg_number },
    });
    await supabaseAdmin.from("notifications").insert({
      user_id: data.analystId,
      type: "system",
      title: "Application approved",
      body: "You are now a verified Stockera analyst. Sign in to start answering queries.",
      link: "/admin/dashboard",
    });
    return { ok: true };
  });

export const rejectAnalyst = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analystId: string; reason: string }) =>
    z.object({ analystId: z.string().uuid(), reason: z.string().min(10).max(500) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("analyst_profiles")
      .update({ is_approved: false })
      .eq("id", data.analystId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.analystId).eq("role", "analyst");
    await audit({
      actor_id: context.userId,
      event_type: "admin_action",
      resource_type: "analyst_profile",
      resource_id: data.analystId,
      payload: { action: "analyst_rejected", reason: data.reason },
    });
    await supabaseAdmin.from("notifications").insert({
      user_id: data.analystId,
      type: "system",
      title: "Application not approved",
      body: data.reason,
      link: "/admin/profile",
    });
    return { ok: true };
  });

export const setAnalystAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analystId: string; available: boolean }) =>
    z.object({ analystId: z.string().uuid(), available: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("analyst_profiles")
      .update({ is_available: data.available })
      .eq("id", data.analystId);
    if (error) throw new Error(error.message);
    await audit({
      actor_id: context.userId,
      event_type: "admin_action",
      resource_type: "analyst_profile",
      resource_id: data.analystId,
      payload: { action: data.available ? "analyst_reactivated" : "analyst_suspended" },
    });
    return { ok: true };
  });
