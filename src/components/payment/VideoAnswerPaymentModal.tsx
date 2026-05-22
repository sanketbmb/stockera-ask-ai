import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, BadgeCheck, CheckCircle2, Loader2, Lock, ShieldCheck, Sparkles, Video, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { bookAnalystVideoDemo } from "@/lib/payments.functions";

type Stage = "idle" | "processing" | "success" | "error";

type Stage = "idle" | "creating" | "checkout" | "verifying" | "success" | "error";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  queryId?: string | null;
  stockName?: string;
}

const SPEECH = [
  "Namaste 🙏",
  "Let's review your position.",
  "Live selfie answer in <24h.",
  "Calm. Considered. SEBI-registered.",
];

const TICKER = [
  { sym: "NIFTY", price: "24,612", chg: "+0.84%" },
  { sym: "SENSEX", price: "80,141", chg: "+0.71%" },
  { sym: "BANKNIFTY", price: "52,388", chg: "+1.12%" },
  { sym: "RELIANCE", price: "2,914", chg: "-0.32%" },
  { sym: "TCS", price: "4,127", chg: "+0.55%" },
  { sym: "HDFCBANK", price: "1,712", chg: "+0.91%" },
];

export function VideoAnswerPaymentModal({ open, onOpenChange, queryId, stockName }: Props) {
  const { user, profile } = useAuth();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [speechIdx, setSpeechIdx] = useState(0);

  const createOrderFn = useServerFn(createVideoOrder);
  const verifyFn = useServerFn(verifyVideoPayment);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setSpeechIdx((i) => (i + 1) % SPEECH.length), 2600);
    return () => clearInterval(t);
  }, [open]);

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
    setStage("creating");
    try {
      const order = await createOrderFn({ data: { queryId: queryId ?? null } });
      setStage("checkout");
      await openRazorpayCheckout({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Stockera",
        description: stockName ? `Analyst video for ${stockName}` : "Live selfie video answer",
        order_id: order.orderId,
        prefill: {
          name: profile?.full_name ?? undefined,
          email: user.email ?? undefined,
          contact: profile?.phone ?? undefined,
        },
        theme: { color: "#7c3aed" },
        modal: {
          ondismiss: () => {
            setStage("idle");
          },
        },
        handler: async (resp) => {
          setStage("verifying");
          try {
            await verifyFn({
              data: {
                orderId: resp.razorpay_order_id,
                paymentId: resp.razorpay_payment_id,
                signature: resp.razorpay_signature,
                queryId: queryId ?? null,
              },
            });
            setStage("success");
            toast.success("Analyst video booked! ETA <24h");
          } catch (e) {
            setStage("error");
            setError(e instanceof Error ? e.message : "Verification failed");
          }
        },
      });
    } catch (e) {
      setStage("error");
      setError(e instanceof Error ? e.message : "Payment could not be started");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden border-0 bg-transparent shadow-2xl">
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white">
          {/* close */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 z-30 rounded-full bg-white/10 p-1.5 text-white/80 hover:bg-white/20 transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Ticker strip */}
          <div className="relative overflow-hidden border-b border-white/10 bg-black/40 py-1.5">
            <motion.div
              className="flex gap-8 whitespace-nowrap text-[11px] font-mono"
              animate={{ x: ["0%", "-50%"] }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            >
              {[...TICKER, ...TICKER, ...TICKER].map((t, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="text-white/70">{t.sym}</span>
                  <span className="text-white">{t.price}</span>
                  <span className={t.chg.startsWith("+") ? "text-emerald-400" : "text-red-400"}>{t.chg}</span>
                </span>
              ))}
            </motion.div>
          </div>

          <div className="relative px-6 pt-6 pb-7">
            {/* Candlestick background */}
            <CandlestickBackdrop />

            <AnimatePresence mode="wait">
              {stage === "success" ? (
                <SuccessPanel key="success" onClose={() => onOpenChange(false)} />
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="relative z-10"
                >
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-300/90 font-mono">
                    <Sparkles className="h-3 w-3" /> SEBI-Registered Analyst
                  </div>
                  <h2 className="font-display text-3xl mt-1 leading-tight">
                    Get a live selfie video answer
                  </h2>
                  <p className="text-sm text-white/70 mt-1.5">
                    {stockName ? <>For your <span className="text-white font-semibold">{stockName}</span> query — </> : null}
                    a real human analyst, recorded for you within 24 hours.
                  </p>

                  {/* Analyst illustration + speech */}
                  <div className="mt-5 flex items-end gap-4">
                    <AnalystAvatar />
                    <div className="flex-1">
                      <div className="relative inline-block max-w-full">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={speechIdx}
                            initial={{ opacity: 0, y: 6, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -6, scale: 0.96 }}
                            transition={{ duration: 0.35 }}
                            className="rounded-2xl rounded-bl-sm bg-white text-slate-900 px-3.5 py-2 text-sm font-medium shadow-lg"
                          >
                            {SPEECH[speechIdx]}
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* Price chip */}
                  <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-emerald-400/40 blur-md animate-pulse" />
                        <div className="relative rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 px-3 py-1 font-display text-lg">
                          ₹100
                        </div>
                      </div>
                      <div className="text-[11px] text-white/70">
                        <div className="text-white text-xs font-semibold">One-time fee · No subscription</div>
                        <div>Refund if unanswered in 24h</div>
                      </div>
                    </div>
                    <Badge variant="outline" className="border-white/20 text-white/80 text-[10px]">
                      Powered by Razorpay
                    </Badge>
                  </div>

                  {/* Bullets */}
                  <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] text-white/80">
                    {[
                      "Live selfie video, not a script",
                      "Specific entry / exit / SL levels",
                      "Position sizing & sector view",
                      "Delivered to your dashboard",
                    ].map((b) => (
                      <li key={b} className="flex gap-1.5">
                        <BadgeCheck className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" /> <span>{b}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <motion.div whileTap={{ scale: 0.98 }} className="mt-5">
                    <Button
                      onClick={handlePay}
                      disabled={stage === "creating" || stage === "checkout" || stage === "verifying"}
                      className="w-full h-12 text-base font-semibold bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 text-slate-950 hover:brightness-110 shadow-[0_8px_30px_-8px_rgba(16,185,129,0.7)]"
                    >
                      {stage === "creating" || stage === "checkout" ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opening secure checkout…
                        </>
                      ) : stage === "verifying" ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verifying payment…
                        </>
                      ) : (
                        <>
                          Pay ₹100 & Book Analyst Video
                          <motion.span
                            animate={{ x: [0, 4, 0] }}
                            transition={{ duration: 1.4, repeat: Infinity }}
                            className="inline-flex ml-2"
                          >
                            <ArrowRight className="h-5 w-5" />
                          </motion.span>
                        </>
                      )}
                    </Button>
                  </motion.div>

                  {/* Trust row */}
                  <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-white/60 font-mono">
                    <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> 256-bit secure</span>
                    <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> SEBI compliant</span>
                    <span className="flex items-center gap-1"><Video className="h-3 w-3" /> Live recorded</span>
                  </div>

                  {error && (
                    <p className="mt-3 text-center text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                      {error}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandlestickBackdrop() {
  const candles = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => {
        const up = Math.random() > 0.45;
        const h = 28 + Math.random() * 70;
        const wickTop = Math.random() * 18;
        const wickBot = Math.random() * 18;
        return { i, up, h, wickTop, wickBot, x: i * 28 + 10 };
      }),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 opacity-[0.18]">
      <svg viewBox="0 0 420 220" className="w-full h-full">
        {candles.map((c) => (
          <motion.g
            key={c.i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: c.i * 0.05, duration: 0.4 }}
          >
            <line x1={c.x + 5} y1={110 - c.h / 2 - c.wickTop} x2={c.x + 5} y2={110 + c.h / 2 + c.wickBot} stroke={c.up ? "#34d399" : "#f87171"} strokeWidth={1} />
            <rect x={c.x} y={110 - c.h / 2} width={10} height={c.h} fill={c.up ? "#10b981" : "#ef4444"} rx={1} />
          </motion.g>
        ))}
      </svg>
    </div>
  );
}

function AnalystAvatar() {
  return (
    <motion.div
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      className="relative shrink-0"
    >
      <svg width="86" height="100" viewBox="0 0 86 100" fill="none">
        {/* Body */}
        <path d="M8 100 C 12 70, 28 60, 43 60 C 58 60, 74 70, 78 100 Z" fill="#1e293b" stroke="#475569" />
        {/* Neck */}
        <rect x="37" y="50" width="12" height="14" fill="#d8a378" />
        {/* Head */}
        <ellipse cx="43" cy="36" rx="18" ry="20" fill="#e8b48a" />
        {/* Hair */}
        <path d="M25 28 C 28 14, 58 14, 61 28 L 60 30 C 50 22, 36 22, 26 30 Z" fill="#1f2937" />
        {/* Glasses */}
        <circle cx="36" cy="36" r="5" fill="none" stroke="#0f172a" strokeWidth="1.5" />
        <circle cx="50" cy="36" r="5" fill="none" stroke="#0f172a" strokeWidth="1.5" />
        <line x1="41" y1="36" x2="45" y2="36" stroke="#0f172a" strokeWidth="1.5" />
        {/* Smile */}
        <path d="M37 46 Q 43 50 49 46" stroke="#7c2d12" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {/* Mustache */}
        <path d="M36 42 Q 43 45 50 42" stroke="#1f2937" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* Tie */}
        <path d="M40 64 L 43 70 L 46 64 L 47 82 L 39 82 Z" fill="#dc2626" />
        {/* Chai cup */}
        <motion.g
          animate={{ rotate: [0, -4, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "70px 78px" }}
        >
          <rect x="64" y="74" width="12" height="9" rx="1" fill="#f5f5f4" stroke="#78716c" />
          <path d="M76 76 q 4 1 0 6" stroke="#78716c" fill="none" />
          {/* steam */}
          <motion.path
            d="M68 72 q 2 -4 0 -8"
            stroke="#cbd5e1"
            strokeWidth="1"
            fill="none"
            animate={{ opacity: [0.2, 0.8, 0.2], y: [0, -2, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.path
            d="M72 72 q -2 -4 0 -8"
            stroke="#cbd5e1"
            strokeWidth="1"
            fill="none"
            animate={{ opacity: [0.5, 0.1, 0.5], y: [0, -3, 0] }}
            transition={{ duration: 2.4, repeat: Infinity }}
          />
        </motion.g>
      </svg>
    </motion.div>
  );
}

function SuccessPanel({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="relative z-10 text-center py-6"
    >
      {/* Confetti dots */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 24 }).map((_, i) => (
          <motion.span
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full"
            style={{
              left: `${(i * 37) % 100}%`,
              top: "10%",
              background: ["#34d399", "#fbbf24", "#60a5fa", "#f472b6"][i % 4],
            }}
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 220, opacity: [0, 1, 0], rotate: 360 }}
            transition={{ duration: 1.6 + (i % 5) * 0.2, delay: (i % 6) * 0.05, repeat: Infinity, repeatDelay: 1.5 }}
          />
        ))}
      </div>
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", damping: 12 }}
        className="mx-auto h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3"
      >
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
      </motion.div>
      <h3 className="font-display text-2xl">Analyst video booked!</h3>
      <p className="text-sm text-white/70 mt-1.5">Your SEBI-registered analyst will record a live selfie video within <span className="text-white font-semibold">24 hours</span>. We'll notify you the moment it's ready.</p>
      <Button onClick={onClose} className="mt-5 bg-white text-slate-900 hover:bg-white/90">
        Got it
      </Button>
    </motion.div>
  );
}
