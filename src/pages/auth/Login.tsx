import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { startGoogleOAuth, sanitizeNext } from "@/lib/google-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Mail, Lock, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/common/Logo";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/ui/TurnstileWidget";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { markHasAccount, consumeIntendedDestination } from "@/lib/auth/redirectHelper";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const search = useSearch({ strict: false }) as { redirect?: string };
  const nextPath = sanitizeNext(search.redirect);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle | null>(null);

  useEffect(() => {
    if (user) navigate({ to: nextPath } as never);
  }, [user, navigate, nextPath]);

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", remember: true },
  });

  const onSubmit = async (values: FormValues) => {
    if (!captchaToken) {
      toast.error("Please complete the security check");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
      options: { captchaToken },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      setCaptchaToken(null);
      turnstileRef.current?.reset();
      return;
    }
    markHasAccount();
    toast.success("Welcome back");
    navigate({ to: nextPath } as never);
  };

  const handleForgot = async () => {
    const email = getValues("email");
    if (!email) {
      toast.error("Enter your email above first");
      return;
    }
    if (!captchaToken) {
      toast.error("Please complete the security check");
      return;
    }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken,
    });
    setResetting(false);
    if (error) {
      toast.error(error.message);
      setCaptchaToken(null);
      turnstileRef.current?.reset();
    } else {
      toast.success("Password reset link sent");
      setCaptchaToken(null);
      turnstileRef.current?.reset();
    }
  };

  const handleGoogle = async () => {
    const { error } = await startGoogleOAuth(nextPath);
    if (error) toast.error(error.message || "Could not start Google sign-in");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <AuthBrandPanel />

      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-6">
            <Logo size="md" />
          </div>
          <div className="hidden lg:block mb-8">
            <Logo size="md" />
          </div>

          <div className="bg-card rounded-2xl shadow-card-lg border border-border p-8">
            <h1 className="font-display text-3xl text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to access your dashboard and AI reports.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="pl-9"
                    {...register("email")}
                  />
                </div>
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pl-9"
                    {...register("password")}
                  />
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox {...register("remember")} defaultChecked />
                  <span className="text-muted-foreground">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={handleForgot}
                  disabled={resetting}
                  className="text-accent hover:underline font-medium"
                >
                  {resetting ? "Sending…" : "Forgot password?"}
                </button>
              </div>

              <div className="flex justify-center">
                <TurnstileWidget
                  ref={turnstileRef}
                  onVerify={setCaptchaToken}
                  onExpire={() => setCaptchaToken(null)}
                  onError={() => setCaptchaToken(null)}
                />
              </div>

              <Button
                type="submit"
                disabled={submitting || !captchaToken}
                className="w-full h-11 bg-gradient-brand hover:opacity-95 text-white shadow-glow-teal"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider">
                <span className="bg-card px-3 text-muted-foreground font-mono">or continue with</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleGoogle}
              className="w-full h-11"
            >
              <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
              </svg>
              Continue with Google
            </Button>

            <p className="mt-6 text-sm text-center text-muted-foreground">
              New here?{" "}
              <Link to="/signup" className="text-accent font-medium hover:underline">
                Create free account
              </Link>
            </p>
            <p className="mt-1 text-xs text-center text-muted-foreground">
              Get <span className="font-semibold text-[hsl(var(--gold-foreground))]">₹250 free credits</span> on signup
            </p>
          </div>

          <p className="mt-6 text-xs text-center text-muted-foreground">
            SEBI Expert?{" "}
            <Link to="/admin/login" className="text-primary font-medium hover:underline">
              Admin & Expert Portal →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
