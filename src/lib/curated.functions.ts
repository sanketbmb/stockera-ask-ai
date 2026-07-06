import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export const getCuratedItem = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: rows, error } = await sb.rpc("get_curated_item", { p_id: data.id });
    if (error) throw error;
    return rows?.[0] ?? null;
  });

/**
 * Increment view/click_through — clean counters:
 *  - never called from SSR/prefetch paths (caller must be in browser)
 *  - anon callers MUST supply a stable viewer_key
 *  - server-side dedupe: 10-minute throttle; staff auto-skipped
 */
export const recordCuratedView = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; viewer_key?: string | null }) => data)
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: res, error } = await sb.rpc("record_curated_view", {
      p_id: data.id,
      p_viewer_key: data.viewer_key ?? null,
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
      p_viewer_key: data.viewer_key ?? null,
    });
    if (error) throw error;
    return res;
  });
