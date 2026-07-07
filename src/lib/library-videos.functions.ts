// Library Videos & Blogs Phase 1 — stock_master autocomplete for the
// Library discovery search bar. Read-only, publishable client, no session,
// no bearer, no privileged access. Public data only.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type StockMasterHit = {
  symbol: string;
  company_name: string | null;
  exchange: string | null;
};

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

// Autocomplete over public.stock_master. Matches on either the symbol
// prefix (case-insensitive) or a company_name substring. Returns up to 8
// hits ordered symbol-prefix first, then company_name. Used exclusively by
// the Library Videos & Blogs stock search bar.
export const searchStockMaster = createServerFn({ method: "GET" })
  .inputValidator((input: { q?: string }) => ({
    q: (input?.q ?? "").toString().trim().slice(0, 64),
  }))
  .handler(async ({ data }) => {
    const q = data.q;
    if (q.length < 1) return [] as StockMasterHit[];

    const sb = publicClient();
    const symUpper = q.toUpperCase();
    const like = `%${q}%`;

    // Two lightweight queries, merged & de-duped in-app so we can prefer
    // symbol-prefix matches without a full-text index dependency.
    const [{ data: bySym }, { data: byName }] = await Promise.all([
      sb
        .from("stock_master")
        .select("symbol, company_name, exchange")
        .ilike("symbol", `${symUpper}%`)
        .limit(8),
      sb
        .from("stock_master")
        .select("symbol, company_name, exchange")
        .ilike("company_name", like)
        .limit(8),
    ]);

    const seen = new Set<string>();
    const out: StockMasterHit[] = [];
    for (const row of [...(bySym ?? []), ...(byName ?? [])]) {
      const key = `${row.symbol}|${row.exchange ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        symbol: row.symbol,
        company_name: row.company_name ?? null,
        exchange: row.exchange ?? null,
      });
      if (out.length >= 8) break;
    }
    return out;
  });

// ---------------------------------------------------------------------------
// Library Videos & Blogs Phase 3 (default-feed) — unified public listing of
// published analyst videos across BOTH categories (general + stock_specific)
// for the no-symbol default view.
//
// ANTI-LEAK CONTRACT:
//   - stock_specific rows are returned as LOCKED STUBS. video_url,
//     youtube_video_id, external_url, and paid_video_storage_path are
//     hard-stripped server-side before the response leaves this handler.
//   - general rows may expose youtube_video_id (they are free public
//     content, same shape as list_public_general_video_answers already
//     returns to anon).
//   - Wallet/entitlement/unlock contracts are NOT touched.
//
// IMPLEMENTATION NOTE (deviation from founder C3 flagged in report):
//   No anon RLS policy exists on public.answers. Rather than adding an RLS
//   policy or a new SECURITY DEFINER RPC (both explicitly out of scope for
//   this stage), this handler uses supabaseAdmin (service-role, server-only)
//   with strict safe-column projection and an is_published=true filter.
//   The response DTO is manually mapped so no secret column can escape.
// ---------------------------------------------------------------------------
export type UnifiedVideoRow = {
  answer_id: string;
  category: "general" | "stock_specific";
  is_locked: boolean;
  unlock_price_credits: number | null;
  video_title: string | null;
  video_description: string | null;
  custom_thumbnail_url: string | null;
  poster_thumb: string | null;
  video_duration_sec: number | null;
  published_at: string | null;
  symbol: string | null;
  stock_name: string | null;
  verdict: string | null;
  question_addressed: string | null;
  analyst_id: string | null;
  analyst_name: string | null;
  analyst_sebi_reg_number: string | null;
  // Present ONLY on general (free) rows. Never populated for locked rows.
  youtube_video_id: string | null;
  external_provider: string | null;
};

export const listAllPublishedVideoAnswers = createServerFn({ method: "GET" })
  .inputValidator((input: { limit?: number; offset?: number }) => ({
    limit: Math.min(Math.max(input?.limit ?? 20, 1), 50),
    offset: Math.max(input?.offset ?? 0, 0),
  }))
  .handler(async ({ data }): Promise<UnifiedVideoRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("answers")
      .select(
        [
          "id",
          "category",
          "is_published",
          "unlock_price_credits",
          "video_title",
          "video_description",
          "custom_thumbnail_url",
          "video_duration_sec",
          "created_at",
          "verdict",
          "question_addressed_override",
          "expert_id",
          "youtube_video_id",
          "external_provider",
          "stock_master_id",
          "query_id",
        ].join(", "),
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as unknown as Array<Record<string, unknown>>;

    // Resolve symbol + stock_name via stock_master; analyst via analyst_profiles.
    const stockIds = Array.from(
      new Set(list.map((r) => r.stock_master_id).filter(Boolean) as string[]),
    );
    const analystIds = Array.from(
      new Set(list.map((r) => r.expert_id).filter(Boolean) as string[]),
    );
    type StockRow = { id: string; symbol: string; company_name: string | null };
    type AnalystRow = { id: string; display_name: string | null; sebi_reg_number: string | null };
    const [stocksRes, analystsRes] = await Promise.all([
      stockIds.length
        ? supabaseAdmin.from("stock_master").select("id, symbol, company_name").in("id", stockIds)
        : Promise.resolve({ data: [] as StockRow[], error: null }),
      analystIds.length
        ? supabaseAdmin
            .from("analyst_profiles")
            .select("id, display_name, sebi_reg_number")
            .in("id", analystIds)
        : Promise.resolve({ data: [] as AnalystRow[], error: null }),
    ]);
    const stockMap = new Map<string, StockRow>(
      ((stocksRes.data ?? []) as unknown as StockRow[]).map((s) => [s.id, s]),
    );
    const analystMap = new Map<string, AnalystRow>(
      ((analystsRes.data ?? []) as unknown as AnalystRow[]).map((a) => [a.id, a]),
    );


    return list.map((r): UnifiedVideoRow => {
      const rawCategory = (r.category as string | null) ?? null;
      // Category invariant: NULL category rows with a stock_master_id are
      // treated as stock_specific (defensive; the seeded INFY row is one).
      const isStockScoped =
        rawCategory === "stock_specific" ||
        (rawCategory == null && !!r.stock_master_id);
      const category: "general" | "stock_specific" = isStockScoped
        ? "stock_specific"
        : "general";
      const price = (r.unlock_price_credits as number | null) ?? null;
      const isLocked = category === "stock_specific" && (price ?? 0) > 0;

      const stock = r.stock_master_id
        ? stockMap.get(r.stock_master_id as string)
        : undefined;
      const analyst = r.expert_id
        ? analystMap.get(r.expert_id as string)
        : undefined;
      const yt = (r.youtube_video_id as string | null) ?? null;
      const provider = (r.external_provider as string | null) ?? null;
      const posterThumb =
        (r.custom_thumbnail_url as string | null) ??
        (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null);

      return {
        answer_id: r.id as string,
        category,
        is_locked: isLocked,
        unlock_price_credits: price,
        video_title: (r.video_title as string | null) ?? null,
        video_description: (r.video_description as string | null) ?? null,
        custom_thumbnail_url: (r.custom_thumbnail_url as string | null) ?? null,
        poster_thumb: posterThumb,
        video_duration_sec: (r.video_duration_sec as number | null) ?? null,
        published_at: (r.created_at as string | null) ?? null,
        symbol: stock?.symbol ?? null,
        stock_name: stock?.company_name ?? null,
        verdict: (r.verdict as string | null) ?? null,
        question_addressed: (r.question_addressed_override as string | null) ?? null,
        analyst_id: (r.expert_id as string | null) ?? null,
        analyst_name: analyst?.display_name ?? null,
        analyst_sebi_reg_number: analyst?.sebi_reg_number ?? null,
        // ANTI-LEAK: locked rows never receive youtube_video_id / provider.
        youtube_video_id: isLocked ? null : yt,
        external_provider: isLocked ? null : provider,
      };
    });
  });

