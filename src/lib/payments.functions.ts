import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


const VIDEO_PRICE_PAISE = 10000; // ₹100

/**
 * DEMO MODE: simulates a successful payment without Razorpay keys.
 * Inserts a `payments` row with status='paid' (provider='demo'),
 * flips the query to video_requested, and notifies the user.
 * Swap to real Razorpay later by reintroducing order creation + HMAC verify.
 */
export const bookAnalystVideoDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ queryId: z.string().uuid().optional().nullable() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const fakeOrderId = `demo_order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fakePaymentId = `demo_pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments" as any)
      .insert({
        user_id: userId,
        query_id: data.queryId ?? null,
        provider: "demo",
        purpose: "video_answer",
        order_id: fakeOrderId,
        payment_id: fakePaymentId,
        amount_paise: VIDEO_PRICE_PAISE,
        currency: "INR",
        status: "paid",
        raw: { demo: true, note: "Razorpay keys not configured — demo flow" } as any,
      })
      .select("id")
      .single();

    if (payErr || !payment) {
      console.error("[payments] demo insert failed", payErr);
      throw new Error(payErr?.message ?? "Could not record payment");
    }

    if (data.queryId) {
      await supabaseAdmin
        .from("queries")
        .update({ video_requested: true, video_payment_id: (payment as any).id } as any)
        .eq("id", data.queryId)
        .eq("user_id", userId);
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      title: "Analyst video booked",
      body: "Your SEBI-registered analyst will record your video answer within 24 hours.",
      type: "video_booked",
      link: data.queryId ? `/report/${data.queryId}` : "/my-queries",
    });

    return { success: true, paymentId: (payment as any).id, queryId: data.queryId ?? null };
  });
