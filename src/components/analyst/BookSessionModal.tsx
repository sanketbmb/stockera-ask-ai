import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Check, Calendar, Clock, Sparkles, ShieldCheck, Loader2 } from "lucide-react";
import { SESSION_TIERS, formatINR, type SessionTier } from "@/lib/session-tiers";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  analystId: string;
  analystName: string;
}

function nextSlots(): { label: string; date: Date }[] {
  const slots: { label: string; date: Date }[] = [];
  const now = new Date();
  for (let d = 1; d <= 5; d++) {
    for (const h of [10, 15, 19]) {
      const dt = new Date(now);
      dt.setDate(now.getDate() + d);
      dt.setHours(h, 0, 0, 0);
      slots.push({
        label: dt.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }),
        date: dt,
      });
    }
  }
  return slots;
}

export function BookSessionModal({ open, onOpenChange, analystId, analystName }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tier, setTier] = useState<SessionTier | null>(null);
  const [slotIdx, setSlotIdx] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const slots = nextSlots();

  const reset = () => {
    setStep(1);
    setTier(null);
    setSlotIdx(null);
    setNotes("");
  };

  const handleConfirm = async () => {
    if (!user) {
      toast.error("Please sign in to book a session");
      navigate({ to: "/login" });
      return;
    }
    if (!tier || slotIdx === null) return;
    setSubmitting(true);
    // session_bookings: types not regenerated yet — cast through unknown
    const client = supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<{ error: { message: string } | null }> } };
    const { error } = await client.from("session_bookings").insert({
      user_id: user.id,
      analyst_id: analystId,
      tier: tier.id,
      amount_paise: tier.amountPaise,
      scheduled_for: slots[slotIdx].date.toISOString(),
      status: "pending",
      notes: notes || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Request received — we'll send payment link on WhatsApp within 1 hour", { duration: 6000 });
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            Book a 1:1 with {analystName}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs">
            <ShieldCheck className="h-3 w-3" /> SEBI-registered · 100% confidential · Recorded & shared after the call
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
          {[1, 2, 3].map((n) => (
            <div key={n} className={cn("flex-1 h-1 rounded-full", step >= n ? "bg-accent" : "bg-muted")} />
          ))}
        </div>

        {step === 1 && (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">Pick your session length</p>
            {SESSION_TIERS.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTier(t); setStep(2); }}
                className={cn(
                  "relative text-left rounded-xl border p-4 transition-all hover:border-accent hover:shadow-card-hover",
                  tier?.id === t.id ? "border-accent bg-accent/5" : "border-border",
                )}
              >
                {t.highlight && (
                  <Badge className="absolute -top-2 right-4 bg-gradient-to-r from-primary to-accent text-primary-foreground border-0">Most popular</Badge>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg">{t.label} <span className="text-muted-foreground text-sm font-sans">· {t.minutes} min</span></p>
                    <p className="text-xs text-muted-foreground mt-1">{t.blurb}</p>
                  </div>
                  <p className="font-mono text-lg font-semibold text-foreground">{formatINR(t.amountPaise)}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && tier && (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Pick a time slot (IST)</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
              {slots.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setSlotIdx(i)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs text-left transition-all",
                    slotIdx === i ? "border-accent bg-accent/10 text-foreground" : "border-border hover:border-accent/60",
                  )}
                >
                  <Clock className="h-3 w-3 inline mr-1 text-accent" />
                  {s.label}
                </button>
              ))}
            </div>
            <Textarea
              placeholder="Tell the analyst what to focus on (stock tickers, your concern, time horizon)…"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              className="mt-2"
              rows={3}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button disabled={slotIdx === null} onClick={() => setStep(3)} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
                Review booking
              </Button>
            </div>
          </div>
        )}

        {step === 3 && tier && slotIdx !== null && (
          <div className="grid gap-3">
            <div className="rounded-xl border border-accent/40 bg-accent/5 p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Analyst</span><span className="font-medium">{analystName}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Session</span><span className="font-medium">{tier.label} · {tier.minutes} min</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">When</span><span className="font-medium">{slots[slotIdx].label} IST</span></div>
              <div className="flex justify-between text-base pt-2 border-t border-accent/30"><span className="font-display">Total</span><span className="font-mono font-bold text-accent">{formatINR(tier.amountPaise)}</span></div>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" /> Personalised, recorded session · video shared post-call</li>
              <li className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" /> 7-day WhatsApp follow-up on your questions</li>
              <li className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" /> Full refund if analyst no-shows</li>
            </ul>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button disabled={submitting} onClick={handleConfirm} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Request booking
              </Button>
            </div>
            <p className="text-[10px] text-center text-muted-foreground">
              You'll receive a Razorpay payment link on WhatsApp within 1 hour. Slot is locked once payment confirms.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
