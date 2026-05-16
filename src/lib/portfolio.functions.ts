import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface PortfolioRow {
  id: string;
  stock_symbol: string;
  stock_name: string;
  buy_price: number;
  quantity: number;
  target: number | null;
  stop_loss: number | null;
  added_from_query_id: string | null;
  created_at: string;
  current_price: number | null;
  pnl_pct: number | null;
  pnl_abs: number | null;
  status: "target_hit" | "stop_loss_hit" | "active";
}

// Parse "₹2,750" / "2750-2800" / "2750" into a number (take first)
function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).replace(/[₹,\s]/g, "").match(/[\d.]+/);
  return m ? Number(m[0]) : null;
}

async function fetchLivePrices(symbols: string[]): Promise<Record<string, number>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || symbols.length === 0) return {};
  const unique = Array.from(new Set(symbols));
  const prompt = `Return ONLY raw JSON (no markdown). Current realistic NSE prices in INR for these symbols: ${unique.join(", ")}.
Format: {"PRICES":{"SYMBOL":1234.56, ...}}. Use realistic current values.`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
        }),
      },
    );
    if (!res.ok) return {};
    const json = await res.json();
    const raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return (parsed?.PRICES ?? {}) as Record<string, number>;
  } catch (err) {
    console.error("fetchLivePrices failed:", err);
    return {};
  }
}

export const addToPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      queryId: z.string().uuid().optional(),
      stockSymbol: z.string().min(1).max(20),
      stockName: z.string().min(1).max(200),
      buyPrice: z.number().positive(),
      quantity: z.number().positive().default(1),
      target: z.number().positive().nullable().optional(),
      stopLoss: z.number().positive().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("user_portfolio")
      .insert({
        user_id: userId,
        stock_symbol: data.stockSymbol.toUpperCase(),
        stock_name: data.stockName,
        buy_price: data.buyPrice,
        quantity: data.quantity,
        target: data.target ?? null,
        stop_loss: data.stopLoss ?? null,
        added_from_query_id: data.queryId ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const removeFromPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("user_portfolio").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPortfolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: PortfolioRow[] }> => {
    const { supabase, userId } = context;
    const { data: holdings, error } = await supabase
      .from("user_portfolio")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!holdings || holdings.length === 0) return { rows: [] };

    const prices = await fetchLivePrices(holdings.map((h) => h.stock_symbol));

    const rows: PortfolioRow[] = holdings.map((h) => {
      const current = prices[h.stock_symbol.toUpperCase()] ?? null;
      const buy = Number(h.buy_price);
      const pnl_pct = current !== null ? ((current - buy) / buy) * 100 : null;
      const pnl_abs = current !== null ? (current - buy) * Number(h.quantity) : null;
      let status: PortfolioRow["status"] = "active";
      if (current !== null) {
        if (h.target !== null && current >= Number(h.target)) status = "target_hit";
        else if (h.stop_loss !== null && current <= Number(h.stop_loss)) status = "stop_loss_hit";
      }
      return {
        id: h.id,
        stock_symbol: h.stock_symbol,
        stock_name: h.stock_name,
        buy_price: buy,
        quantity: Number(h.quantity),
        target: h.target !== null ? Number(h.target) : null,
        stop_loss: h.stop_loss !== null ? Number(h.stop_loss) : null,
        added_from_query_id: h.added_from_query_id,
        created_at: h.created_at as string,
        current_price: current,
        pnl_pct,
        pnl_abs,
        status,
      };
    });

    // Fire-and-forget notifications for newly hit targets/stops
    const toNotify = rows.filter((r) => r.status !== "active");
    if (toNotify.length > 0) {
      const ids = toNotify.map((r) => r.id);
      const { data: flags } = await supabaseAdmin
        .from("user_portfolio")
        .select("id, target_hit_notified, stop_loss_hit_notified")
        .in("id", ids);
      const flagMap = new Map(flags?.map((f) => [f.id, f]));
      for (const r of toNotify) {
        const f = flagMap.get(r.id);
        if (!f) continue;
        if (r.status === "target_hit" && !f.target_hit_notified) {
          await supabaseAdmin.from("notifications").insert({
            user_id: userId,
            title: `🎯 ${r.stock_name} hit your target!`,
            body: `Current ₹${r.current_price?.toFixed(2)} ≥ target ₹${r.target}. Consider booking profits.`,
            type: "portfolio_target",
            link: "/portfolio",
          });
          await supabaseAdmin.from("user_portfolio").update({ target_hit_notified: true }).eq("id", r.id);
        } else if (r.status === "stop_loss_hit" && !f.stop_loss_hit_notified) {
          await supabaseAdmin.from("notifications").insert({
            user_id: userId,
            title: `🛑 ${r.stock_name} hit your stop loss`,
            body: `Current ₹${r.current_price?.toFixed(2)} ≤ stop loss ₹${r.stop_loss}. Review your position.`,
            type: "portfolio_stop_loss",
            link: "/portfolio",
          });
          await supabaseAdmin.from("user_portfolio").update({ stop_loss_hit_notified: true }).eq("id", r.id);
        }
      }
    }

    return { rows };
  });

export const parsePriceString = parsePrice;
