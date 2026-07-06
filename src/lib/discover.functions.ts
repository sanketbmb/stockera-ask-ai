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

export const listPublicGeneralVideoAnswers = createServerFn({ method: "GET" })
  .inputValidator((data: { limit?: number; offset?: number }) => data ?? {})
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: rows, error } = await sb.rpc(
      "list_public_general_video_answers",
      { p_limit: data.limit ?? 30, p_offset: data.offset ?? 0 },
    );
    if (error) throw error;
    return rows ?? [];
  });

export const listCuratedItemsForSymbol = createServerFn({ method: "GET" })
  .inputValidator((data: { symbol: string; limit?: number; offset?: number }) => data)
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: rows, error } = await sb.rpc("list_curated_items_for_symbol", {
      p_symbol: data.symbol,
      p_limit: data.limit ?? 30,
      p_offset: data.offset ?? 0,
    });
    if (error) throw error;
    return rows ?? [];
  });

export const listDiscoverFeed = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      kind_filter?: string[] | null;
      symbol?: string | null;
      limit?: number;
      offset?: number;
    }) => data ?? {},
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: rows, error } = await sb.rpc("list_discover_feed", {
      p_kind_filter: data.kind_filter ?? null,
      p_symbol: data.symbol ?? null,
      p_limit: data.limit ?? 30,
      p_offset: data.offset ?? 0,
    });
    if (error) throw error;
    return rows ?? [];
  });
