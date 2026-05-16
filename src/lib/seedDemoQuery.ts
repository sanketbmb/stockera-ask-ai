import { supabase } from "@/integrations/supabase/client";

const DEMO_REPORT = {
  verdict: "HOLD",
  confidence: 78,
  risk: "Medium",
  summary:
    "Reliance Industries shows resilient fundamentals with strong Jio + Retail growth offsetting O2C cyclicality. Near-term consolidation expected; long-term thesis intact.",
  key_points: [
    "Q3 revenue +5.5% YoY, EBITDA margin expanded to 17.8%",
    "Jio ARPU at ₹181.7 — tariff hike tailwind through FY26",
    "Net debt down ₹15,400 Cr QoQ — deleveraging on track",
    "Retail footprint expansion slowing — watch SSSG metric",
  ],
  support_resistance: { support: 1180, resistance: 1340 },
  disclaimer:
    "This is an AI-generated educational analysis, not SEBI investment advice. Past performance is not indicative of future returns.",
  is_demo: true,
};

export async function seedDemoQueryIfEmpty(userId: string): Promise<boolean> {
  const { count } = await supabase
    .from("queries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) > 0) return false;

  const { error } = await supabase.from("queries").insert({
    user_id: userId,
    stock_name: "RELIANCE",
    stock_symbol: "RELIANCE",
    query_type: "buy_sell",
    query_text:
      "👋 Sample demo query — Bought RELIANCE at ₹1,250, now at ₹1,280. Should I hold, add or book profit?",
    status: "ai_answered",
    ai_report: DEMO_REPORT as never,
    buy_price: 1250,
    current_price: 1280,
  });
  if (error) {
    console.warn("seedDemoQuery failed:", error.message);
    return false;
  }
  return true;
}
