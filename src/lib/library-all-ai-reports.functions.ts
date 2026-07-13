// LIBRARY AUTH-VIEW SPLIT — sitewide "All AI Reports" feed for authenticated users.
// requireSupabaseAuth gates access; supabaseAdmin bypasses RLS with a safe
// projection only (no PII, no wallet, no user_id).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAGE_SIZE = 24;

export type AllAiReportRow = {
  id: string;
  query_id: string;
  stock_symbol: string | null;
  stock_exchange: string | null;
  intent: string;
  generated_at: string;
  created_at: string;
  stock_name: string | null;
  query_text: string | null;
};

export const listAllAiReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        page: z.number().int().min(1).max(10000).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const page = data.page;

    // Distinct-per-query dedupe is best-effort at DB scale; we over-fetch a
    // window, dedupe latest-per-query_id in TS, then slice by page. For
    // realistic volumes (< low tens of thousands) this is materially cheaper
    // than a bespoke SQL function and keeps this fix schema-free.
    // Fetch newest N such that after dedupe the requested page is representable.
    const WINDOW = Math.max(page * PAGE_SIZE * 3, 300);

    const { data: rows, error } = await supabaseAdmin
      .from("ai_reports")
      .select(
        "id, query_id, stock_symbol, stock_exchange, intent, generated_at, created_at",
      )
      .order("generated_at", { ascending: false })
      .limit(WINDOW);
    if (error) throw new Error(error.message);

    // Dedupe: keep newest per query_id (rows are already sorted desc).
    const seen = new Set<string>();
    const deduped: Array<{
      id: string;
      query_id: string;
      stock_symbol: string | null;
      stock_exchange: string | null;
      intent: string;
      generated_at: string;
      created_at: string;
    }> = [];
    for (const r of rows ?? []) {
      if (seen.has(r.query_id)) continue;
      seen.add(r.query_id);
      deduped.push(r);
    }

    const total = deduped.length;
    const start = (page - 1) * PAGE_SIZE;
    const slice = deduped.slice(start, start + PAGE_SIZE);

    // Join queries for card labels. Safe projection only.
    let joined: AllAiReportRow[] = [];
    if (slice.length > 0) {
      const ids = slice.map((r) => r.query_id);
      const { data: qs } = await supabaseAdmin
        .from("queries")
        .select("id, stock_name, query_text")
        .in("id", ids);
      const qMap = new Map<string, { stock_name: string | null; query_text: string | null }>(
        (qs ?? []).map((q) => [q.id, { stock_name: q.stock_name, query_text: q.query_text }]),
      );
      joined = slice.map((r) => ({
        ...r,
        stock_name: qMap.get(r.query_id)?.stock_name ?? null,
        query_text: qMap.get(r.query_id)?.query_text ?? null,
      }));
    }

    return {
      rows: joined,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      windowSaturated: (rows ?? []).length >= WINDOW,
    };
  });
