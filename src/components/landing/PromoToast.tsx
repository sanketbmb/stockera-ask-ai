import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const DISMISS_KEY = "stockera_promo_dismissed_v1";

export function PromoToast() {
  const { user } = useAuth();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (user) return;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(DISMISS_KEY)) return;

    fired.current = true;
    const t = window.setTimeout(() => {
      toast("🎁 Get ₹100 Free", {
        description:
          "Sign up and get your first 2 AI reports FREE — no credit card needed.",
        duration: 12000,
        action: {
          label: "Get Started",
          onClick: () => {
            window.location.href = "/signup";
          },
        },
        onDismiss: () => window.sessionStorage.setItem(DISMISS_KEY, "1"),
        onAutoClose: () => window.sessionStorage.setItem(DISMISS_KEY, "1"),
      });
    }, 4000);

    return () => window.clearTimeout(t);
  }, [user]);

  return null;
}
