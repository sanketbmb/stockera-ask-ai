// Server function — fetch upcoming corporate actions (next 90 days) from
// the FinEdge corporate-actions/all feed via the existing finedge-fetch
// edge function (which keeps the FinEdge API key server-side).
//
// Used by the medium-term Catalyst Calendar card (Mission 1 B.2 addendum).
// Earnings calendar proper is deferred to task 2.6.M — this returns only
// the corporate actions FinEdge actually exposes (dividend / split / result /
// bonus / buyback). No estimation.

import { createServerFn } from "@tanstack/react-start";

export type CorporateActionType =
  | "DIVIDEND"
  | "SPLIT"
  | "RESULT"
  | "BONUS"
  | "BUYBACK"
  | "OTHER";

export interface UpcomingCorporateAction {
  type: CorporateActionType;
  date: string;           // ISO yyyy-mm-dd
  label: string;          // e.g. "₹8 dividend" / "1:1 split" / "Q3 results"
  raw_purpose?: string | null;
}

export interface UpcomingActionsResult {
  symbol: string;
  fetched_at: string;
  actions: UpcomingCorporateAction[];
  window_days: number;
  error: string | null;
}

const ALLOWED = /^[A-Z0-9.&-]{1,15}$/;

function classify(purpose: string): CorporateActionType {
  const p = purpose.toLowerCase();
  if (p.includes("dividend"))             return "DIVIDEND";
  if (p.includes("split"))                return "SPLIT";
  if (p.includes("bonus"))                return "BONUS";
  if (p.includes("buy") && p.includes("back")) return "BUYBACK";
  if (p.includes("buyback"))              return "BUYBACK";
  if (p.includes("result") || p.includes("earning") || p.includes("board meeting")) return "RESULT";
  return "OTHER";
}

function buildLabel(type: CorporateActionType, row: Record<string, unknown>): string {
  const purpose = String(row.purpose ?? row.subject ?? row.event ?? "").trim();
  const amount  = row.amount ?? row.dividend ?? row.value ?? row.ratio;
  switch (type) {
    case "DIVIDEND": return amount != null ? `₹${amount} dividend` : "Dividend";
    case "SPLIT":    return amount != null ? `${amount} split` : "Stock split";
    case "BONUS":    return amount != null ? `${amount} bonus` : "Bonus issue";
    case "BUYBACK":  return "Buyback";
    case "RESULT":   return purpose || "Results / board meeting";
    default:         return purpose || "Corporate action";
  }
}

export const getUpcomingCorporateActions = createServerFn({ method: "POST" })
  .inputValidator((data: { symbol: string }) => {
    const sym = String(data?.symbol ?? "").toUpperCase().trim();
    if (!ALLOWED.test(sym)) throw new Error("invalid_symbol");
    return { symbol: sym };
  })
  .handler(async ({ data }): Promise<UpcomingActionsResult> => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const empty: UpcomingActionsResult = {
      symbol: data.symbol,
      fetched_at: new Date().toISOString(),
      actions: [],
      window_days: 90,
      error: null,
    };
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return { ...empty, error: "server_misconfigured" };
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/finedge-fetch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_KEY,
          authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ endpoint: "corporate-actions/all", symbol: data.symbol }),
      });
      const txt = await res.text();
      const parsed = txt ? JSON.parse(txt) : null;
      if (!res.ok || parsed?.success !== true) {
        return { ...empty, error: "finedge_fetch_failed" };
      }
      const root = (parsed.data ?? {}) as Record<string, unknown>;
      const inner = (root.data ?? root) as Record<string, unknown>;
      const rows = (inner.corporate_actions ?? inner.actions ?? inner.list ?? inner.data ?? []) as Array<Record<string, unknown>>;
      if (!Array.isArray(rows)) return empty;

      const now = Date.now();
      const horizon = now + 90 * 24 * 3600 * 1000;
      const actions: UpcomingCorporateAction[] = [];
      for (const row of rows) {
        const rawDate = String(
          row.ex_date ?? row.exDate ?? row.record_date ?? row.recordDate ??
          row.date ?? row.event_date ?? row.eventDate ?? "",
        );
        if (!rawDate) continue;
        const d = new Date(rawDate);
        if (Number.isNaN(d.getTime())) continue;
        const t = d.getTime();
        if (t < now - 24 * 3600 * 1000 || t > horizon) continue;
        const purpose = String(row.purpose ?? row.subject ?? row.event ?? row.action ?? "");
        const type = classify(purpose);
        actions.push({
          type,
          date: d.toISOString().slice(0, 10),
          label: buildLabel(type, row),
          raw_purpose: purpose || null,
        });
      }
      actions.sort((a, b) => a.date.localeCompare(b.date));
      return { ...empty, actions: actions.slice(0, 10) };
    } catch (e) {
      return { ...empty, error: `fetch_threw: ${String(e).slice(0, 120)}` };
    }
  });
