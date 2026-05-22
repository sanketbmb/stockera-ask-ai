import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const VIDEO_PRICE_PAISE = 10000; // ₹100

function getRazorpayCreds() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay is not configured yet. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in project secrets."
    );
  }
  return { keyId, keySecret };
}

export const createVideoOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ queryId: z.string().uuid().optional().nullable() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { keyId, keySecret } = getRazorpayCreds();
    const { userId } = context;

    const receipt = `vid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
      },
      body: JSON.stringify({
        amount: VIDEO_PRICE_PAISE,
        currency: "INR",
        receipt,
        notes: { purpose: "video_answer", user_id: userId, query_id: data.queryId ?? "" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[razorpay] order create failed", res.status, text);
      throw new Error(`Razorpay order creation failed (${res.status})`);
    }
    const order = (await res.json()) as { id: string; amount: number; currency: string };

    const { error } = await supabaseAdmin.from("payments" as any).insert({
      user_id: userId,
      query_id: data.queryId ?? null,
      provider: "razorpay",
      purpose: "video_answer",
      order_id: order.id,
      amount_paise: order.amount,
      currency: order.currency,
      status: "created",
      raw: order as any,
    });
    if (error) {
      console.error("[payments] insert failed", error);
      throw new Error(error.message);
    }

    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId };
  });

export const verifyVideoPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().min(1),
        paymentId: z.string().min(1),
        signature: z.string().min(1),
        queryId: z.string().uuid().optional().nullable(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { keySecret } = getRazorpayCreds();
    const { userId } = context;

    const expected = createHmac("sha256", keySecret)
      .update(`${data.orderId}|${data.paymentId}`)
      .digest("hex");
    const sigBuf = Buffer.from(data.signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new Error("Payment signature verification failed");
    }

    // Update payment row
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments" as any)
      .update({
        payment_id: data.paymentId,
        signature: data.signature,
        status: "paid",
      })
      .eq("order_id", data.orderId)
      .eq("user_id", userId)
      .select("id, query_id")
      .single();

    if (payErr || !payment) {
      console.error("[payments] update failed", payErr);
      throw new Error("Could not find payment record");
    }

    const queryId = data.queryId ?? (payment as any).query_id ?? null;

    if (queryId) {
      await supabaseAdmin
        .from("queries")
        .update({ video_requested: true, video_payment_id: (payment as any).id } as any)
        .eq("id", queryId)
        .eq("user_id", userId);
    }

    // Notify user
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      title: "Analyst video booked",
      body: "Your SEBI-registered analyst will record your video answer within 24 hours.",
      type: "video_booked",
      link: queryId ? `/report/${queryId}` : "/my-queries",
    });

    return { success: true, queryId };
  });
