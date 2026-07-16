import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Mail, Lock, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/common/Logo";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/ui/TurnstileWidget";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password required"),
});
type FormValues = z.infer<typeof schema>;

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    if (!captchaToken) {
      toast.error("Please complete the security check");
      return;
    }
    setSubmitting(true);
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
      options: { captchaToken: captchaToken ?? undefined },
    });
    if (error || !signInData.user) {
      setSubmitting(false);
      toast.error(error?.message ?? "Login failed");
      setCaptchaToken(null);
      turnstileRef.current?.reset();
      return;
    }

    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", signInData.user.id);
    const roles = (rolesData ?? []).map((r) => r.role);

    setSubmitting(false);

    if (roles.includes("admin")) {
      toast.success("Welcome, Admin");
      navigate({ to: "/admin/super" });
    } else if (roles.includes("analyst")) {
      toast.success("Welcome, Expert");
      navigate({ to: "/admin/dashboard" });
    } else {
      await supabase.auth.signOut();
      toast.error("This portal is for SEBI-registered analysts. Please use the user login at /login.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#0F1E3C" }}>
      <div className="absolute inset-0 bg-mesh opacity-30 pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo variant="white" size="lg" linkTo="/" />
        </div>

        <div
          className="bg-[#142a52] rounded-2xl p-8 border border-[hsl(var(--accent))]/30 shadow-[0_0_60px_-12px_rgba(43,168,160,0.4)]"
        >
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-gradient-gold flex items-center justify-center shadow-glow-gold mb-3">
              <ShieldCheck className="h-7 w-7 text-[#142a52]" />
            </div>
            <h1 className="font-display text-2xl text-white">
              Admin &amp; <span className="text-[hsl(var(--gold))]">Expert Portal</span>
            </h1>
            <p className="text-sm text-white/60 mt-1">For SEBI-registered RAs &amp; RIAs</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-white/80">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="expert@firm.com"
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[hsl(var(--accent))]"
                  {...register("email")}
                />
              </div>
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-white/80">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[hsl(var(--accent))]"
                  {...register("password")}
                />
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
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
              className="w-full h-11 bg-gradient-gold hover:opacity-95 text-[#142a52] font-semibold shadow-glow-gold"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Login as Admin / SEBI Expert"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-center text-white/70">
            Are you a SEBI-registered RA/RIA?{" "}
            <Link to="/admin/apply" className="text-[hsl(var(--gold))] font-medium hover:underline">
              Apply for analyst access →
            </Link>
          </p>
        </div>

        <p className="mt-6 text-xs text-center text-white/40">
          Not an expert?{" "}
          <Link to="/login" className="hover:text-white underline">
            Sign in as user
          </Link>
        </p>
      </div>
    </div>
  );
}
