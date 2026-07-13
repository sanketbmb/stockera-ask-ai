// LIB-HOTFIX-V3 — Authed-only sitewide library grid.
// requireSupabaseAuth gates access. supabaseAdmin bypasses the
// public_consent_anonymized RLS filter so signed-in users see ALL non-tombstoned
// library items with a SAFE projection (only fields already exposed to the
// public grid; no PII, no user_id, no wallet, no admin metadata).
//
// TODO: switch to true server-side pagination in a follow-up. For now we mirror
// the anon path's 200-row cap so filters/verdict/sector/sort behave identically.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LibraryGridRow = {
  id: string;
  kind: string;
  source_table: string;
  source_id: string;
  symbol: string | null;
  symbol_exchange: "NSE" | "BSE" | null;
  title: string;
  verdict: string | null;
  sector: string | null;
  analyst_id: string | null;
  body_excerpt: string | null;
  published_at: string | null;
  is_public: boolean;
  is_tombstoned: boolean;
};

export const listLibraryGridForAuthed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<LibraryGridRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("library_items")
      .select(
        "id, kind, source_table, source_id, symbol, symbol_exchange, title, verdict, sector, analyst_id, body_excerpt, published_at, is_public, is_tombstoned",
      )
      .eq("is_tombstoned", false)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as LibraryGridRow[];
  });
