import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck, Sparkles, Video } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { bookAnalystVideoDemo } from "@/lib/payments.functions";
import { FIRM } from "@/lib/firm-details";

const VIDEO_PRICE_PAISE = 10000; // ₹100 — mirrors canonical source

type Stage = "idle" | "processing" | "success" | "error";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  queryId?: string | null;
  stockName?: string;
}

const TRUST_BULLETS = [
  "A real SEBI-registered Research Analyst reviews your question",
  "Personalized video walkthrough tailored to your query",
  "Delivered within 24 hours and watchable inside your report",
];

const SPRING_SOFT = { type: "spring" as const, stiffness: 220, damping: 22 };
const EASE_PREMIUM = [0.22, 1, 0.36, 1] as const;

export function VideoAnswerPaymentModal({ open, onOpenChange, queryId, stockName }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const bookFn = useServerFn(bookAnalystVideoDemo);

  useEffect(() => {
    if (open) {
      setStage("idle");
      setError(null);
    }
  }, [open]);

  const handlePay = async () => {
    if (!user) {
      toast.error("Please sign in to continue");
      return;
    }
    setError(null);
    setStage("processing");
    try {
      await bookFn({ data: { queryId: queryId ?? null } });
      setStage("success");
      toast.success("Analyst video booked! ETA <24h");
      if (queryId) {
        queryClient.invalidateQueries({ queryKey: ["expert_answers", queryId] });
      }
    } catch (e) {
      setStage("error");
      setError(e instanceof Error ? e.message : "Could not complete booking");
    }
  };

  const handleSuccessClose = () => {
    onOpenChange(false);
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        const el = document.getElementById("analyst-answer");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md overflow-hidden rounded-3xl border-border/60 bg-card p-0 shadow-2xl"
      >
        <style>{`
          @keyframes vampm-aurora { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(3%, -4%, 0); } }
          @keyframes vampm-shield { 0%,100% { opacity:.65; transform: scale(1);} 50% { opacity:1; transform: scale(1.06);} }
          .vampm-aurora { background:
            radial-gradient(50% 60% at 30% 40%, hsl(var(--primary)/0.55), transparent 60%),
            radial-gradient(40% 50% at 75% 30%, hsl(var(--accent)/0.45), transparent 60%);
            filter: blur(28px);
            animation: vampm-aurora 14s ease-in-out infinite;
          }
          .vampm-shield-pulse { animation: vampm-shield 3s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .vampm-aurora, .vampm-shield-pulse { animation: none !important; }
          }
        `}</style>

        <motion.div
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          transition={reducedMotion ? { duration: 0.2 } : SPRING_SOFT}
        >
          {/* Top aurora band */}
          <div className="relative h-24 overflow-hidden">
            <div aria-hidden className="vampm-aurora absolute -inset-10 opacity-80" />
            <div className="relative flex h-full items-center justify-center">
              <div className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-card/80 ring-1 ring-primary/30 backdrop-blur">
                <div aria-hidden className="vampm-shield-pulse absolute inset-0 rounded-2xl bg-primary/20 blur-md" />
                <ShieldCheck className="relative h-7 w-7 text-primary" aria-hidden />
              </div>
            </div>
          </div>

          <div className="px-6 pb-6 pt-2">
            <AnimatePresence mode="wait">
              {stage === "success" ? (
                <SuccessPanel key="success" onClose={handleSuccessClose} />
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: EASE_PREMIUM }}
                >
                  <div className="text-center">
                    <DialogTitle className="font-display text-2xl leading-tight text-foreground">
                      Personalized Analyst Video
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-muted-foreground">
                      Reviewed by a SEBI-registered Research Analyst
                      {stockName ? <> · for <span className="text-foreground font-medium">{stockName}</span></> : null}
                    </DialogDescription>
                  </div>

                  {/* Trust bullets */}
                  <ul className="mt-5 space-y-2.5" aria-label="What you get">
                    {TRUST_BULLETS.map((b, i) => (
                      <motion.li
                        key={b}
                        initial={reducedMotion ? false : { opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 + i * 0.08, duration: 0.35, ease: EASE_PREMIUM }}
                        className="flex items-start gap-2.5 text-sm text-foreground"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                        <span className="text-muted-foreground">{b}</span>
                      </motion.li>
                    ))}
                  </ul>

                  {/* Price center */}
                  <div className="mt-6 rounded-2xl border border-border/60 bg-muted/30 px-5 py-4 text-center">
                    <div className="font-display text-4xl tabular-nums text-foreground">
                      ₹{(VIDEO_PRICE_PAISE / 100).toLocaleString("en-IN")}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      One-time. No subscription. No hidden fees.
                    </div>
                  </div>

                  {/* Primary CTA */}
                  <Button
                    onClick={handlePay}
                    disabled={stage === "processing"}
                    className="mt-5 h-12 w-full rounded-full text-base font-semibold shadow-[0_10px_30px_-12px_hsl(var(--primary)/0.55)] transition-transform hover:scale-[1.01] active:scale-[0.99]"
                  >
                    {stage === "processing" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing secure payment…
                      </>
                    ) : (
                      <>
                        Confirm — Pay ₹{VIDEO_PRICE_PAISE / 100}
                        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                      </>
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="mt-2 block w-full rounded-full px-4 py-2 text-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    Maybe later
                  </button>

                  {/* Compliance / provider row */}
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 pt-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" aria-hidden /> {FIRM.legalName} · {FIRM.sebiRegNumber}
                    </span>
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3" aria-hidden /> Razorpay secure
                    </span>
                  </div>

                  {error && (
                    <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
                      {error}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

function SuccessPanel({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={SPRING_SOFT}
      className="py-2 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.05 }}
        className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30"
      >
        <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden />
      </motion.div>
      <DialogTitle className="font-display text-2xl text-foreground">Request submitted</DialogTitle>
      <DialogDescription className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        A SEBI analyst will review and deliver your video within 24 hours. We&apos;ll
        notify you the moment it&apos;s ready.
      </DialogDescription>
      <Button onClick={onClose} className="mt-5 h-11 rounded-full px-6">
        <Video className="mr-2 h-4 w-4" aria-hidden /> View analyst section
      </Button>
    </motion.div>
  );
}
