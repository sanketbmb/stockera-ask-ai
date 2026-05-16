import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { submitGrievance } from "@/lib/grievances.functions";
import { GRIEVANCE_CATEGORIES } from "@/lib/firm-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const FormSchema = z.object({
  complainant_name: z.string().trim().min(2, "Please enter your full name").max(120),
  complainant_email: z.string().trim().email("Enter a valid email").max(255),
  complainant_phone: z.string().trim().max(20).optional(),
  category: z.string().min(2, "Please pick a category"),
  subject: z.string().trim().min(3, "Subject is required").max(200),
  description: z.string().trim().min(10, "Please describe your grievance (min 10 chars)").max(4000),
});

type Submitted = { ticket_number: string; sla_due_at: string };

export function GrievanceForm() {
  const submit = useServerFn(submitGrievance);
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (submitted) {
    const due = new Date(submitted.sla_due_at).toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h3 className="mt-3 font-display text-lg text-foreground">Grievance received</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Your ticket number is <strong className="font-mono text-foreground">{submitted.ticket_number}</strong>.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          We will respond within 24 hours and resolve by <strong className="text-foreground">{due}</strong>.
        </p>
        <Button variant="outline" className="mt-5" onClick={() => setSubmitted(null)}>
          File another
        </Button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const fd = new FormData(e.currentTarget);
    const raw = {
      complainant_name: String(fd.get("complainant_name") || ""),
      complainant_email: String(fd.get("complainant_email") || ""),
      complainant_phone: String(fd.get("complainant_phone") || "") || undefined,
      category: String(fd.get("category") || ""),
      subject: String(fd.get("subject") || ""),
      description: String(fd.get("description") || ""),
    };
    const parsed = FormSchema.safeParse(raw);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0]);
        if (!errs[k]) errs[k] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      const res = await submit({
        data: { ...parsed.data, user_id: user?.id ?? null },
      });
      if (res.success) {
        setSubmitted({ ticket_number: res.ticket_number, sla_due_at: res.sla_due_at });
        toast.success("Grievance filed", { description: `Ticket ${res.ticket_number}` });
      } else {
        toast.error(res.error);
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="complainant_name">Full name *</Label>
          <Input id="complainant_name" name="complainant_name" defaultValue={user?.user_metadata?.full_name ?? ""} required maxLength={120} />
          {errors.complainant_name && <p className="mt-1 text-xs text-destructive">{errors.complainant_name}</p>}
        </div>
        <div>
          <Label htmlFor="complainant_email">Email *</Label>
          <Input id="complainant_email" name="complainant_email" type="email" defaultValue={user?.email ?? ""} required maxLength={255} />
          {errors.complainant_email && <p className="mt-1 text-xs text-destructive">{errors.complainant_email}</p>}
        </div>
        <div>
          <Label htmlFor="complainant_phone">Phone (optional)</Label>
          <Input id="complainant_phone" name="complainant_phone" type="tel" maxLength={20} />
        </div>
        <div>
          <Label htmlFor="category">Category *</Label>
          <Select name="category">
            <SelectTrigger id="category"><SelectValue placeholder="Choose a category" /></SelectTrigger>
            <SelectContent>
              {GRIEVANCE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category && <p className="mt-1 text-xs text-destructive">{errors.category}</p>}
        </div>
      </div>
      <div>
        <Label htmlFor="subject">Subject *</Label>
        <Input id="subject" name="subject" required maxLength={200} placeholder="One-line summary" />
        {errors.subject && <p className="mt-1 text-xs text-destructive">{errors.subject}</p>}
      </div>
      <div>
        <Label htmlFor="description">Describe your grievance *</Label>
        <Textarea id="description" name="description" required rows={6} maxLength={4000} placeholder="Include relevant dates, ticket / query IDs and what resolution you are seeking." />
        {errors.description && <p className="mt-1 text-xs text-destructive">{errors.description}</p>}
      </div>
      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Submit grievance"}
      </Button>
      <p className="text-xs text-muted-foreground">
        By submitting, you confirm the information is accurate. We may contact you on the email/phone provided.
      </p>
    </form>
  );
}
