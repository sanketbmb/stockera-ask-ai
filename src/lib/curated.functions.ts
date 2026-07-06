// Stage 4G APPLY-4 — Curated media server functions.
//
// Scope guardrails:
//   - Curated items are FREE. No wallet_ledger / wallet_transactions /
//     video_entitlements writes anywhere in this module.
//   - No 4F.1 RPC signatures are touched.
//   - No paid unlock code path is exposed for curated media.
//
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    },
  );
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertStaff(userId: string): Promise<{ isAdmin: boolean; isAnalyst: boolean }> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "analyst"]);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r) => r.role as string);
  if (!roles.length) throw new Error("Forbidden: admin or analyst role required");
  return { isAdmin: roles.includes("admin"), isAnalyst: roles.includes("analyst") };
}

// ---------------------------------------------------------------------------
// Public: read + view/click counters (existing, retained)
// ---------------------------------------------------------------------------
export const getCuratedItem = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: rows, error } = await sb.rpc("get_curated_item", { p_id: data.id });
    if (error) throw error;
    return rows?.[0] ?? null;
  });

export const recordCuratedView = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; viewer_key?: string | null }) => data)
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: res, error } = await sb.rpc("record_curated_view", {
      p_id: data.id,
      p_viewer_key: data.viewer_key ?? undefined,
    });
    if (error) throw error;
    return res;
  });

export const recordCuratedClickThrough = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; viewer_key?: string | null }) => data)
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: res, error } = await sb.rpc("record_curated_click_through", {
      p_id: data.id,
      p_viewer_key: data.viewer_key ?? undefined,
    });
    if (error) throw error;
    return res;
  });

// ---------------------------------------------------------------------------
// Public: list published curated items (for Library General tab).
// Free content only; no unlock context.
// ---------------------------------------------------------------------------
export const listPublishedCurated = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { limit?: number; offset?: number; category?: "general" | "stock_specific" | null }) =>
      data ?? {},
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    let q = sb
      .from("curated_items")
      .select(
        "id, title, description, custom_thumbnail_url, source_url, source_provider, embed_kind, tags, sector, category, published_at, view_count, click_through_count",
      )
      .eq("is_published", true)
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(data.offset ?? 0, (data.offset ?? 0) + (data.limit ?? 40) - 1);
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------------------------------------------------------------------------
// Admin: list (search, filter, published state)
// ---------------------------------------------------------------------------
export const listAdminCurated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        q: z.string().max(200).optional(),
        provider: z.string().max(60).optional(),
        category: z.enum(["general", "stock_specific"]).optional(),
        published: z.enum(["all", "draft", "published"]).default("all"),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const admin = await getAdmin();
    let q = admin
      .from("curated_items")
      .select(
        "id, title, source_provider, embed_kind, category, is_published, published_at, view_count, click_through_count, updated_at, source_url",
      )
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.provider) q = q.eq("source_provider", data.provider);
    if (data.category) q = q.eq("category", data.category);
    if (data.published === "draft") q = q.eq("is_published", false);
    if (data.published === "published") q = q.eq("is_published", true);
    if (data.q?.trim()) {
      const s = data.q.trim().replace(/[%,]/g, " ");
      q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%,source_url.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------------------------------------------------------------------------
// Admin: load one item for editing
// ---------------------------------------------------------------------------
export const loadCuratedForEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("curated_items")
      .select("*, stock_master:stock_master_id(id, symbol, company_name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");
    return row;
  });

// ---------------------------------------------------------------------------
// Admin: OG scrape (server-side)
// ---------------------------------------------------------------------------
export const scrapeOgForUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ url: z.string().trim().url().max(1000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { scrapeOg } = await import("@/lib/og-scrape.server");
    return await scrapeOg(data.url);
  });

// ---------------------------------------------------------------------------
// Admin: save (draft-safe upsert). Never toggles is_published here.
// ---------------------------------------------------------------------------
const savePayload = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  source_url: z.string().trim().url().max(1000),
  source_provider: z.string().trim().min(1).max(60),
  embed_kind: z.enum(["embed", "link_out"]),
  custom_thumbnail_url: z.string().trim().url().max(1000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  sector: z.string().trim().max(80).nullable().optional(),
  stock_master_id: z.string().uuid().nullable().optional(),
  category: z.enum(["general", "stock_specific"]).default("general"),
  og_scrape_meta: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const saveCuratedDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => savePayload.parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const admin = await getAdmin();

    const row = {
      title: data.title,
      description: data.description ?? null,
      source_url: data.source_url,
      source_provider: data.source_provider.toLowerCase(),
      embed_kind: data.embed_kind,
      custom_thumbnail_url: data.custom_thumbnail_url ?? null,
      tags: data.tags,
      sector: data.sector ?? null,
      stock_master_id: data.category === "stock_specific" ? data.stock_master_id ?? null : null,
      category: data.category,
      og_scrape_meta: (data.og_scrape_meta ?? null) as never,
      posted_by: context.userId,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await admin.from("curated_items").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      await admin.from("audit_events").insert({
        event_type: "curated.draft_updated",
        actor_id: context.userId,
        resource_type: "curated_item",
        resource_id: data.id,
        payload: { provider: row.source_provider, category: row.category } as never,
      });
      return { id: data.id };
    }
    const { data: inserted, error } = await admin
      .from("curated_items")
      .insert({ ...row, is_published: false })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await admin.from("audit_events").insert({
      event_type: "curated.draft_created",
      actor_id: context.userId,
      resource_type: "curated_item",
      resource_id: inserted.id,
      payload: { provider: row.source_provider, category: row.category } as never,
    });
    return { id: inserted.id };
  });

// ---------------------------------------------------------------------------
// Admin: publish / unpublish / delete (admin only for publish/delete)
// ---------------------------------------------------------------------------
export const publishCuratedItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertStaff(context.userId);
    if (!isAdmin) throw new Error("Forbidden: only admins may publish");
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("curated_items")
      .select("id, title, source_url, source_provider, embed_kind, category")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");
    const missing: string[] = [];
    if (!row.title?.trim()) missing.push("title");
    if (!row.source_url?.trim()) missing.push("source_url");
    if (!row.source_provider?.trim()) missing.push("source_provider");
    if (!row.embed_kind) missing.push("embed_kind");
    if (missing.length) throw new Error(`Cannot publish — missing: ${missing.join(", ")}`);

    const { error: upErr } = await admin
      .from("curated_items")
      .update({ is_published: true, published_at: new Date().toISOString() })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    await admin.from("audit_events").insert({
      event_type: "curated.published",
      actor_id: context.userId,
      resource_type: "curated_item",
      resource_id: data.id,
      payload: { provider: row.source_provider, category: row.category } as never,
    });
    return { id: data.id, published: true };
  });

export const unpublishCuratedItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertStaff(context.userId);
    if (!isAdmin) throw new Error("Forbidden: only admins may unpublish");
    const admin = await getAdmin();
    const { error } = await admin
      .from("curated_items")
      .update({ is_published: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await admin.from("audit_events").insert({
      event_type: "curated.unpublished",
      actor_id: context.userId,
      resource_type: "curated_item",
      resource_id: data.id,
      payload: {} as never,
    });
    return { id: data.id, published: false };
  });

export const deleteCuratedItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertStaff(context.userId);
    if (!isAdmin) throw new Error("Forbidden: only admins may delete");
    const admin = await getAdmin();
    const { error } = await admin.from("curated_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await admin.from("audit_events").insert({
      event_type: "curated.deleted",
      actor_id: context.userId,
      resource_type: "curated_item",
      resource_id: data.id,
      payload: {} as never,
    });
    return { id: data.id, deleted: true };
  });
