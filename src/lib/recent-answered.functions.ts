// LIB-HOTFIX-V3 — Latest Answered feed, identical for all users.
// Public server function using supabaseAdmin so anon and authed callers get
// the exact same 20 rows regardless of per-user RLS variance on public.queries.
// Safe projection only (id, symbol, verdict, title, published_at).
import { createServerFn } from "@tanstack/react-start";

export type RecentAnsweredRow = {
  id: string;
  symbol: string | null;
  verdict: string | null;
  title: string;
  published_at: string | null;
};

export const listRecentAnswered = createServerFn({ method: "GET" }).handler(
  async (): Promise<RecentAnsweredRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("queries")
      .select("id, stock_symbol, stock_name, query_text, ai_report, frozen_at, created_at")
      .eq("is_public_library", true)
      .is("library_tombstoned_at", null)
      .not("ai_report", "is", null)
      .order("frozen_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r): RecentAnsweredRow => {
      const symbol = (r.stock_symbol ?? r.stock_name ?? null) as string | null;
      const report = (r.ai_report ?? null) as { final_verdict?: { action?: string } } | null;
      const verdict = report?.final_verdict?.action ?? null;
      const title = (r.query_text ?? r.stock_name ?? "").trim();
      return {
        id: r.id as string,
        symbol,
        verdict,
        title,
        published_at: (r.frozen_at ?? r.created_at) as string | null,
      };
    });
  },
);
