import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Mail, Lock, User as UserIcon, Phone, Gift, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/common/Logo";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startGoogleOAuth, sanitizeNext } from "@/lib/google-auth";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/ui/TurnstileWidget";
import { markHasAccount } from "@/lib/auth/redirectHelper";

const schema = z
  .object({
    full_name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
    email: z.string().trim().email("Enter a valid email").max(255),
    phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
    password: z
      .string()
      .min(8, "Min 8 characters")
      .regex(/\d/, "Must contain at least one number"),
    confirm: z.string(),
    referral: z.string().optional(),
    accept: z.literal(true, { message: "You must accept the terms" }),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const search = useSearch({ strict: false }) as { ref?: string; redirect?: string };
  const nextPath = sanitizeNext(search.redirect);
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle | null>(null);

  useEffect(() => {
    if (user) navigate({ to: nextPath } as never);
  }, [user, navigate, nextPath]);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", phone: "", password: "", confirm: "", referral: "", accept: false as unknown as true },
  });

  useEffect(() => {
    if (search.ref) setValue("referral", search.ref);
  }, [search.ref, setValue]);

  const onSubmit = async (values: FormValues) => {
    if (!captchaToken) {
      toast.error("Please complete the security check");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        captchaToken,
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: values.full_name,
          phone: values.phone,
          referral_code: values.referral || null,
        },
      },
    });
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      setCaptchaToken(null);
      turnstileRef.current?.reset();
      return;
    }

    // If "Confirm Email" is OFF in Supabase, signUp already returns a session.
    // If it's ON, session is null — try an explicit sign-in so the user lands
    // straight on /dashboard. Confirmation email still sends in the background.
    if (!data.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (signInError) {
        setSubmitting(false);
        toast.error("Account created. Please log in to continue.");
        navigate({ to: "/login" } as never);
        return;
      }
    }
    setSubmitting(false);
    markHasAccount();
    toast.success("Welcome to Stockera! ₹250 credits added 🎉", { duration: 4000 });
    navigate({ to: "/dashboard" } as never);
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
          <div className="mb-6 lg:mb-8">
            <Logo size="md" />
          </div>

          <div className="bg-card rounded-2xl shadow-card-lg border border-border p-8">
            <h1 className="font-display text-3xl text-foreground">Create your account</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Free to join. Get ₹250 credits — enough for ~5 AI reports.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <Field icon={<UserIcon className="h-4 w-4" />} label="Full Name" id="full_name" error={errors.full_name?.message}>
                <Input id="full_name" autoComplete="name" placeholder="Aarav Sharma" className="pl-9" {...register("full_name")} />
              </Field>

              <Field icon={<Mail className="h-4 w-4" />} label="Email" id="email" error={errors.email?.message}>
                <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" className="pl-9" {...register("email")} />
              </Field>

              <Field icon={<Phone className="h-4 w-4" />} label="Mobile (+91)" id="phone" error={errors.phone?.message}>
                <Input id="phone" inputMode="numeric" autoComplete="tel-national" placeholder="9876543210" maxLength={10} className="pl-9" {...register("phone")} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field icon={<Lock className="h-4 w-4" />} label="Password" id="password" error={errors.password?.message}>
                  <PasswordInput id="password" autoComplete="new-password" placeholder="••••••••" className="pl-9" {...register("password")} />
                </Field>
                <Field icon={<Lock className="h-4 w-4" />} label="Confirm" id="confirm" error={errors.confirm?.message}>
                  <PasswordInput id="confirm" autoComplete="new-password" placeholder="••••••••" className="pl-9" {...register("confirm")} />
                </Field>
              </div>

              <Field icon={<Gift className="h-4 w-4" />} label="Referral code (optional)" id="referral" error={errors.referral?.message}>
                <Input id="referral" placeholder="STKXXXXXX" className="pl-9 font-mono uppercase" {...register("referral")} />
              </Field>

              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox className="mt-0.5" {...register("accept")} onCheckedChange={(v) => setValue("accept", Boolean(v) as true, { shouldValidate: true })} />
                <span className="text-muted-foreground">
                  I agree to the <a className="text-accent hover:underline">Terms</a> &amp;{" "}
                  <a className="text-accent hover:underline">SEBI disclaimer</a>. AI reports are educational only.
                </span>
              </label>
              {errors.accept && <p className="text-xs text-destructive">{errors.accept.message}</p>}

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
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account & Get ₹250 Free"}
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
              Already have an account?{" "}
              <Link to="/login" className="text-accent font-medium hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ icon, label, id, error, children }: { icon: React.ReactNode; label: string; id: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
        {children}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
