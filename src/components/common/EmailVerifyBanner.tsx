import { useEffect, useState } from "react";
import { AlertCircle, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function EmailVerifyBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  const storageKey = user ? `email_verify_banner_dismissed_${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      if (window.sessionStorage.getItem(storageKey)) setDismissed(true);
    } catch {
      /* noop */
    }
  }, [storageKey]);

  if (!user || user.email_confirmed_at || dismissed || !user.email) return null;

  const handleResend = async () => {
    setSending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: user.email!,
    });
    setSending(false);
    if (error) toast.error(error.message);
    else toast.success(`Verification email sent to ${user.email}`);
  };

  const handleDismiss = () => {
    if (storageKey) {
      try { window.sessionStorage.setItem(storageKey, "1"); } catch { /* noop */ }
    }
    setDismissed(true);
  };

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 flex items-start gap-3">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-medium">Please verify your email to unlock full features.</p>
        <p className="text-amber-800/80 text-xs mt-0.5">
          We sent a link to <span className="font-mono">{user.email}</span>.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleResend}
        disabled={sending}
        className="h-8 border-amber-300 bg-white/50 hover:bg-white text-amber-900"
      >
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Resend email"}
      </Button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="text-amber-700 hover:text-amber-900 p-1 -m-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default EmailVerifyBanner;
