import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeNext } from "@/lib/google-auth";
import { markHasAccount, consumeIntendedDestination } from "@/lib/auth/redirectHelper";
import { Logo } from "@/components/common/Logo";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Signing you in…" }, { name: "robots", content: "noindex,nofollow" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
    error: typeof s.error === "string" ? s.error : undefined,
    error_description: typeof s.error_description === "string" ? s.error_description : undefined,
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const { next, error, error_description } = useSearch({ from: "/auth/callback" });
  const [msg, setMsg] = useState("Finalizing sign-in…");

  useEffect(() => {
    let cancelled = false;
    const dest = sanitizeNext(next);

    if (error) {
      toast.error(error_description || error || "Google sign-in failed");
      navigate({ to: "/login" });
      return;
    }

    // Wait for the Supabase client to hydrate the session from the OAuth
    // redirect (URL hash/PKCE code). detectSessionInUrl runs on client init.
    const start = Date.now();
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        navigate({ to: dest, replace: true } as never);
        return;
      }
      if (Date.now() - start > 8000) {
        toast.error("Sign-in timed out. Please try again.");
        navigate({ to: "/login" });
        return;
      }
      setMsg("Finalizing sign-in…");
      setTimeout(check, 200);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: dest, replace: true } as never);
      }
    });

    check();
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate, next, error, error_description]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-mesh">
      <Logo size="lg" linkTo={null} />
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground animate-pulse">
        {msg}
      </div>
    </div>
  );
}
