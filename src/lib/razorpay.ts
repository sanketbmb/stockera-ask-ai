// Lazy loader for Razorpay Checkout JS SDK
let _loader: Promise<typeof window.Razorpay> | null = null;

declare global {
  interface Window {
    Razorpay: any;
  }
}

export function loadRazorpay(): Promise<typeof window.Razorpay> {
  if (typeof window === "undefined") return Promise.reject(new Error("Razorpay can only be loaded in the browser"));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (_loader) return _loader;
  _loader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => {
      _loader = null;
      reject(new Error("Failed to load Razorpay SDK"));
    };
    document.body.appendChild(script);
  });
  return _loader;
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number; // paise
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
}

export async function openRazorpayCheckout(options: RazorpayCheckoutOptions): Promise<void> {
  const Razorpay = await loadRazorpay();
  const rzp = new Razorpay(options);
  rzp.on("payment.failed", (resp: any) => {
    console.error("[razorpay] payment.failed", resp?.error);
  });
  rzp.open();
}
