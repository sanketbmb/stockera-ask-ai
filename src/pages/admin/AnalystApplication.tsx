import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { Check, ChevronLeft, ChevronRight, Loader2, Upload, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/common/Logo";
import { supabase } from "@/integrations/supabase/client";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/ui/TurnstileWidget";

const SPECIALIZATIONS = [
  "Technical Analysis", "Fundamental Analysis", "Swing Trading",
  "F&O", "Long Term Investing", "Sectoral Analysis", "Smallcap/Midcap",
];
const LANGUAGES = ["Hindi", "English", "Gujarati", "Marathi", "Tamil", "Telugu", "Kannada", "Bengali"];

const step1Schema = z.object({
  full_name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Valid 10-digit Indian mobile required"),
  password: z.string().min(8, "Min 8 chars").regex(/\d/, "Must contain a number"),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });

const step2Schema = z.object({
  sebi_reg_number: z.string().regex(/^IN[HA]\d{9}$/, "Format: INH123456789 (RA) or INA123456789 (RIA)"),
  sebi_type: z.enum(["RA", "RIA"]),
  specializations: z.array(z.string()).min(1, "Pick at least one"),
  languages: z.array(z.string()).min(1, "Pick at least one"),
  years_experience: z.number().int().min(0).max(60),
  bio: z.string().min(20, "Min 20 characters").max(200, "Max 200 characters"),
});

interface FormData {
  full_name: string; email: string; phone: string; password: string; confirm: string;
  avatar_url: string | null;
  sebi_reg_number: string; sebi_type: "RA" | "RIA";
  specializations: string[]; languages: string[];
  years_experience: number; bio: string;
}

const initial: FormData = {
  full_name: "", email: "", phone: "", password: "", confirm: "",
  avatar_url: null,
  sebi_reg_number: "", sebi_type: "RA",
  specializations: [], languages: ["English", "Hindi"],
  years_experience: 1, bio: "",
};

export default function AnalystApplicationPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [acknowledge, setAcknowledge] = useState(false);
  const [success, setSuccess] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle | null>(null);

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
  };

  const toggleArr = (key: "specializations" | "languages", value: string) => {
    setData((d) => ({
      ...d,
      [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value],
    }));
  };

  const handlePhotoUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploading(true);
    // Stage upload to a temp path keyed by email hash; will be re-uploaded server-side too
    const tempId = `pending-${Date.now()}`;
    const filePath = `${tempId}/${file.name}`;
    const { error } = await supabase.storage.from("profiles").upload(filePath, file, { upsert: true });
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data: publicUrl } = supabase.storage.from("profiles").getPublicUrl(filePath);
    setField("avatar_url", publicUrl.publicUrl);
    toast.success("Photo uploaded");
  };

  const validateStep = (n: number): boolean => {
    setErrors({});
    if (n === 1) {
      const r = step1Schema.safeParse({
        full_name: data.full_name, email: data.email, phone: data.phone,
        password: data.password, confirm: data.confirm,
      });
      if (!r.success) {
        const e: Record<string, string> = {};
        r.error.issues.forEach((i) => { e[i.path[0] as string] = i.message; });
        setErrors(e);
        return false;
      }
    }
    if (n === 2) {
      const r = step2Schema.safeParse({
        sebi_reg_number: data.sebi_reg_number, sebi_type: data.sebi_type,
        specializations: data.specializations, languages: data.languages,
        years_experience: Number(data.years_experience), bio: data.bio,
      });
      if (!r.success) {
        const e: Record<string, string> = {};
        r.error.issues.forEach((i) => { e[i.path[0] as string] = i.message; });
        setErrors(e);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!acknowledge) {
      toast.error("Please acknowledge the SEBI compliance");
      return;
    }
    if (!captchaToken) {
      toast.error("Please complete the security check");
      return;
    }
    setSubmitting(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        captchaToken,
        emailRedirectTo: `${window.location.origin}/admin/dashboard`,
        data: { full_name: data.full_name, phone: data.phone },
      },
    });
    if (signUpError || !signUpData.user) {
      setSubmitting(false);
      setCaptchaToken(null);
      turnstileRef.current?.reset();
      toast.error(signUpError?.message ?? "Sign up failed");
      return;
    }

    const userId = signUpData.user.id;

    const { error: profileError } = await supabase.from("analyst_profiles").insert({
      id: userId,
      display_name: data.full_name,
      sebi_reg_number: data.sebi_reg_number,
      sebi_type: data.sebi_type,
      specializations: data.specializations,
      languages: data.languages,
      years_experience: Number(data.years_experience),
      bio: data.bio,
      avatar_url: data.avatar_url,
      is_approved: false,
    });

    if (profileError) {
      setSubmitting(false);
      toast.error(`Could not save profile: ${profileError.message}`);
      return;
    }

    // Add analyst role (user role already added by trigger)
    await supabase.from("user_roles").insert({ user_id: userId, role: "analyst" });

    setSubmitting(false);
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mesh p-6">
        <div className="max-w-md text-center bg-card rounded-2xl p-10 shadow-card-lg border border-border">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-brand flex items-center justify-center shadow-glow-teal mb-4">
            <Check className="h-8 w-8 text-white" />
          </div>
          <Logo size="md" linkTo={null} className="justify-center mb-4" />
          <h1 className="font-display text-3xl text-foreground">Application submitted</h1>
          <p className="text-muted-foreground mt-3 text-sm">
            Our team will verify your SEBI credentials within <strong>24–48 hours</strong>. You'll receive an email at <strong>{data.email}</strong> once approved.
          </p>
          <Button asChild className="mt-6 bg-gradient-brand text-white">
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const progressValue = (step / 3) * 100;

  return (
    <div className="min-h-screen bg-mesh py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>

        <div className="bg-card rounded-2xl shadow-card-lg border border-border p-8">
          <div className="flex items-center gap-2 mb-1 text-xs uppercase tracking-wider text-muted-foreground font-mono">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            SEBI Expert Application · Step {step} of 3
          </div>
          <Progress value={progressValue} className="h-1.5 mb-6 mt-2" />

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-display text-2xl text-foreground">Personal Details</h2>

              <Row label="Full Name" id="full_name" error={errors.full_name}>
                <Input id="full_name" value={data.full_name} onChange={(e) => setField("full_name", e.target.value)} placeholder="Aarav Sharma" />
              </Row>
              <Row label="Email" id="email" error={errors.email}>
                <Input id="email" type="email" value={data.email} onChange={(e) => setField("email", e.target.value)} placeholder="expert@firm.com" />
              </Row>
              <Row label="Mobile (+91)" id="phone" error={errors.phone}>
                <Input id="phone" inputMode="numeric" maxLength={10} value={data.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="9876543210" />
              </Row>
              <div className="grid grid-cols-2 gap-3">
                <Row label="Password" id="password" error={errors.password}>
                  <PasswordInput id="password" value={data.password} onChange={(e) => setField("password", e.target.value)} placeholder="••••••••" />
                </Row>
                <Row label="Confirm Password" id="confirm" error={errors.confirm}>
                  <PasswordInput id="confirm" value={data.confirm} onChange={(e) => setField("confirm", e.target.value)} placeholder="••••••••" />
                </Row>
              </div>

              <div>
                <Label>Profile Photo</Label>
                <div className="mt-1.5 flex items-center gap-4">
                  {data.avatar_url ? (
                    <img src={data.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover border border-border" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs">No photo</div>
                  )}
                  <label className="flex-1">
                    <div className="cursor-pointer flex items-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-lg hover:border-accent hover:bg-accent/5 transition-colors text-sm">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
                      <span className="text-muted-foreground">{uploading ? "Uploading…" : "Upload photo (max 5MB)"}</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-display text-2xl text-foreground">SEBI Credentials</h2>

              <Row label="SEBI Registration Number" id="sebi" error={errors.sebi_reg_number}>
                <Input id="sebi" className="font-mono uppercase" placeholder="INH123456789" value={data.sebi_reg_number} onChange={(e) => setField("sebi_reg_number", e.target.value.toUpperCase())} />
              </Row>

              <div>
                <Label>Registration Type</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {(["RA", "RIA"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setField("sebi_type", t)}
                      className={`px-4 py-3 rounded-lg border text-left transition-all ${data.sebi_type === t ? "border-accent bg-accent/10 shadow-card" : "border-border hover:border-accent/50"}`}
                    >
                      <div className="font-semibold text-sm">{t}</div>
                      <div className="text-xs text-muted-foreground">{t === "RA" ? "Research Analyst" : "Investment Adviser"}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Specializations</Label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {SPECIALIZATIONS.map((s) => {
                    const active = data.specializations.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleArr("specializations", s)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${active ? "bg-gradient-brand text-white border-transparent shadow-glow-teal" : "bg-background text-muted-foreground border-border hover:border-accent/50"}`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
                {errors.specializations && <p className="text-xs text-destructive mt-1">{errors.specializations}</p>}
              </div>

              <div>
                <Label>Languages</Label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {LANGUAGES.map((l) => {
                    const active = data.languages.includes(l);
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => toggleArr("languages", l)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${active ? "bg-[hsl(var(--gold))] text-[hsl(var(--gold-foreground))] border-transparent" : "bg-background text-muted-foreground border-border hover:border-[hsl(var(--gold))]"}`}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
                {errors.languages && <p className="text-xs text-destructive mt-1">{errors.languages}</p>}
              </div>

              <Row label="Years of Experience" id="years" error={errors.years_experience}>
                <Input id="years" type="number" min={0} max={60} value={data.years_experience} onChange={(e) => setField("years_experience", Number(e.target.value))} />
              </Row>

              <div>
                <Label htmlFor="bio">Short Bio</Label>
                <Textarea
                  id="bio"
                  rows={3}
                  maxLength={200}
                  value={data.bio}
                  onChange={(e) => setField("bio", e.target.value)}
                  placeholder="One paragraph about your investing approach and edge…"
                />
                <div className="flex justify-between mt-1">
                  {errors.bio ? <p className="text-xs text-destructive">{errors.bio}</p> : <span />}
                  <span className="text-xs text-muted-foreground font-mono">{data.bio.length}/200</span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="font-display text-2xl text-foreground">Review &amp; Submit</h2>

              <div className="space-y-3 bg-secondary/50 rounded-xl p-5 border border-border">
                <SummaryRow label="Name" value={data.full_name} />
                <SummaryRow label="Email" value={data.email} />
                <SummaryRow label="Phone" value={`+91 ${data.phone}`} />
                <SummaryRow label="SEBI Reg #" value={data.sebi_reg_number} mono />
                <SummaryRow label="Type" value={`${data.sebi_type} (${data.sebi_type === "RA" ? "Research Analyst" : "Investment Adviser"})`} />
                <SummaryRow label="Experience" value={`${data.years_experience} years`} />
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Specializations</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {data.specializations.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Languages</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {data.languages.map((l) => <Badge key={l} className="bg-[hsl(var(--gold))] text-[hsl(var(--gold-foreground))] hover:bg-[hsl(var(--gold))]">{l}</Badge>)}
                  </div>
                </div>
                <SummaryRow label="Bio" value={data.bio} />
              </div>

              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={acknowledge} onCheckedChange={(v) => setAcknowledge(Boolean(v))} className="mt-0.5" />
                <span className="text-muted-foreground">
                  I confirm that all information is accurate, my SEBI registration is active, and I will follow SEBI's research analyst regulations on all answers and reports published through this platform.
                </span>
              </label>
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>

            {step < 3 ? (
              <Button
                type="button"
                onClick={() => validateStep(step) && setStep((s) => s + 1)}
                className="bg-gradient-brand text-white"
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !acknowledge}
                className="bg-gradient-gold text-[hsl(var(--gold-foreground))] font-semibold shadow-glow-gold"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Application"}
              </Button>
            )}
          </div>
        </div>

        <p className="mt-6 text-xs text-center text-muted-foreground">
          Already approved?{" "}
          <Link to="/admin/login" className="text-primary font-medium hover:underline">
            Sign in to your expert dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}

function Row({ label, id, error, children }: { label: string; id: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono">{label}</span>
      <span className={`text-right text-foreground ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}
