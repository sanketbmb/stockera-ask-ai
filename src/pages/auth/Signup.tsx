import { useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Mail, Lock, User as UserIcon, Phone, Gift, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/common/Logo";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  const search = useSearch({ strict: false }) as { ref?: string };
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", phone: "", password: "", confirm: "", referral: "", accept: false as unknown as true },
  });

  useEffect(() => {
    if (search.ref) setValue("referral", search.ref);
  }, [search.ref, setValue]);

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: values.full_name,
          phone: values.phone,
          referral_code: values.referral || null,
        },
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome to Stockera! ₹100 credits added.", { duration: 4000 });
    navigate({ to: "/dashboard" });
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
              Free to join. Get ₹100 credits — enough for 2 AI reports.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <Field icon={<UserIcon className="h-4 w-4" />} label="Full Name" id="full_name" error={errors.full_name?.message}>
                <Input id="full_name" placeholder="Aarav Sharma" className="pl-9" {...register("full_name")} />
              </Field>

              <Field icon={<Mail className="h-4 w-4" />} label="Email" id="email" error={errors.email?.message}>
                <Input id="email" type="email" placeholder="you@example.com" className="pl-9" {...register("email")} />
              </Field>

              <Field icon={<Phone className="h-4 w-4" />} label="Mobile (+91)" id="phone" error={errors.phone?.message}>
                <Input id="phone" inputMode="numeric" placeholder="9876543210" maxLength={10} className="pl-9" {...register("phone")} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field icon={<Lock className="h-4 w-4" />} label="Password" id="password" error={errors.password?.message}>
                  <Input id="password" type="password" placeholder="••••••••" className="pl-9" {...register("password")} />
                </Field>
                <Field icon={<Lock className="h-4 w-4" />} label="Confirm" id="confirm" error={errors.confirm?.message}>
                  <Input id="confirm" type="password" placeholder="••••••••" className="pl-9" {...register("confirm")} />
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

              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-11 bg-gradient-brand hover:opacity-95 text-white shadow-glow-teal"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account & Get ₹100 Free"}
              </Button>
            </form>

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
