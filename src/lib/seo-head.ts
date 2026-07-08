// SEO STAGE 1 — shared helpers for dynamic <head> and JSON-LD on the
// public /report/<queryId> and /general/<answerId> routes. NO wallet /
// entitlement / unlock code touched here. Server-fn uses the admin client
// (read-only, safe columns) and refuses to expose non-public reports.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const SITE_ORIGIN = "https://asktheexpert.lovable.app";
export const SITE_DEFAULT_OG = `${SITE_ORIGIN}/stockera-logo.png`;

const uuidInput = z.object({ queryId: z.string().uuid() });

export type ReportMetaResult =
  | { status: "not_found" }
  | {
      status: "ok";
      is_public: boolean;
      query_text: string;
      stock_symbol: string | null;
      stock_name: string | null;
      verdict: string | null;
      created_at: string | null;
      updated_at: string | null;
    };

export const getPublicReportMeta = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => uuidInput.parse(v))
  .handler(async ({ data }): Promise<ReportMetaResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("queries")
      .select(
        "id, query_text, stock_symbol, stock_name, ai_report, created_at, updated_at, is_public_library, library_tombstoned_at",
      )
      .eq("id", data.queryId)
      .maybeSingle();
    if (error || !row) return { status: "not_found" };
    const isPublic =
      row.is_public_library === true && !row.library_tombstoned_at;
    let verdict: string | null = null;
    const ai = row.ai_report as Record<string, unknown> | null;
    if (ai && typeof ai === "object") {
      const v = ai.verdict ?? ai.tier ?? ai.action;
      if (typeof v === "string" && v.trim()) verdict = v.trim();
    }
    return {
      status: "ok",
      is_public: isPublic,
      query_text: row.query_text ?? "",
      stock_symbol: row.stock_symbol ?? null,
      stock_name: row.stock_name ?? null,
      verdict,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    };
  });

export function truncate(s: string | null | undefined, max = 155): string {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function isoDurationFromSec(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `PT${m}M${s}S`;
}
