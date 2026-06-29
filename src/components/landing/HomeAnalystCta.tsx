import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck, Video, Phone, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoAnswerPaymentModal } from "@/components/payment/VideoAnswerPaymentModal";
import { SESSION_TIERS, formatINR } from "@/lib/session-tiers";
import { FIRM } from "@/lib/firm-details";
import { useAuth } from "@/contexts/AuthContext";

const VIDEO_PRICE_PAISE = 10000;
const APPROVED_DEMO_ANALYST_ID = "4e534d46-709e-4eaf-a6f1-07f24d7b1d3e";

function AnimatedVideoIcon({ reduced }: { reduced: boolean | null }) {
  if (reduced) {
    return (
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20">
        <Video className="h-5 w-5 text-primary" aria-hidden />
      </div>
    );
  }
  return (
    <motion.div
      aria-hidden
      className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20"
      animate={{
        scale: [1, 1.05, 1],
        filter: [
          "drop-shadow(0 0 0px rgba(43,168,160,0.2))",
          "drop-shadow(0 0 14px rgba(43,168,160,0.45))",
          "drop-shadow(0 0 0px rgba(43,168,160,0.2))",
        ],
      }}
      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
    >
      <Video className="h-5 w-5 text-primary" />
      {/* Lens glint */}
      <motion.span
        className="pointer-events-none absolute top-[14px] right-[16px] h-1 w-1 rounded-full bg-white"
        animate={{ opacity: [0, 0.85, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

function AnimatedPhoneIcon({ reduced }: { reduced: boolean | null }) {
  if (reduced) {
    return (
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20">
        <Phone className="h-5 w-5 text-primary" aria-hidden />
      </div>
    );
  }
  return (
    <div className="relative inline-flex h-12 w-12 items-center justify-center">
      {/* Ring waves */}
      {[0, 0.6, 1.2].map((delay, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute inset-0 rounded-2xl border border-primary/40"
          initial={{ scale: 1, opacity: 0.7 }}
          animate={{ scale: [1, 1.8], opacity: [0.7, 0] }}
          transition={{ duration: 2, repeat: Infinity, delay, ease: "easeOut" }}
        />
      ))}
      <motion.div
        aria-hidden
        className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20"
        style={{ transformOrigin: "50% 85%" }}
        animate={{ rotate: [-8, 8, -8] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Phone className="h-5 w-5 text-primary" />
      </motion.div>
    </div>
  );
}

export function HomeAnalystCta() {
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [videoOpen, setVideoOpen] = useState(false);

  const recommendedTier = useMemo(
    () => SESSION_TIERS.find((t) => t.highlight) ?? SESSION_TIERS[0],
    []
  );

  const onVideoClick = () => {
    if (!user) {
      navigate({ to: "/signup", search: { next: "/analyst/4e534d46-709e-4eaf-a6f1-07f24d7b1d3e" } });
      return;
    }
    setVideoOpen(true);
  };

  // Reusable gradient-border + hover-lift wrapper classes
  const cardWrap =
    "group/card relative rounded-2xl p-[1.5px] bg-[linear-gradient(135deg,#2BA8A0_0%,#1F3C73_55%,#F5B731_100%)] shadow-[0_4px_20px_rgba(31,60,115,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(43,168,160,0.22)] motion-reduce:hover:translate-y-0";
  const cardInner =
    "relative h-full rounded-[14px] bg-card px-6 py-6 md:py-8";

  return (
    <>
      <motion.section
        aria-label="Premium human analyst services"
        id="analyst-cta"
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: false, amount: 0.25, margin: "-60px" }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="container mx-auto px-4 py-12 md:py-16"
      >
        <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-background via-background to-primary/[0.04] p-[1px] shadow-[0_30px_60px_-30px_hsl(var(--primary)/0.25)]">
          <div className="relative rounded-[calc(1.5rem-1px)] bg-card/80 backdrop-blur-sm">
            {/* Top strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-gradient animate-gradient-text hac-eyebrow-pulse motion-reduce:animate-none"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #2BA8A0, #1F3C73, #F5B731, #2BA8A0)",
                }}
              >
                Premium · Human Analyst
              </span>
              <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="relative inline-flex h-2 w-2">
                  <span className="hac-ping absolute inset-0 rounded-full bg-emerald-500/60 motion-reduce:animate-none" />
                  <span className="relative inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none" />
                </span>
                SEBI-registered analysts on standby
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 px-6 pb-6 pt-4 md:grid-cols-2 md:gap-5 md:px-6">
              {/* LEFT — Video */}
              <div className={cardWrap}>
                <div className={cardInner}>
                  <AnimatedVideoIcon reduced={reducedMotion} />
                  <h3 className="mt-4 font-display text-xl leading-snug text-foreground">
                    A human, SEBI-verified second opinion.
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    A SEBI-registered Research Analyst reviews your question and records a personalized video answer. Delivered within 24 hours.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                      SEBI-registered RA
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                      Verified human review
                    </span>
                  </div>
                  <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                    <div className="transition-transform duration-200 hover:scale-[1.03]">
                      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        Stockera · Verified
                      </div>
                      <div
                        className="mt-1 font-display text-3xl font-bold tabular-nums"
                        style={{ color: "#F5B731" }}
                      >
                        ₹{VIDEO_PRICE_PAISE / 100}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        One-time · No subscription
                      </div>
                    </div>
                    <Button
                      onClick={onVideoClick}
                      className="hac-glow group relative overflow-hidden gap-1.5 rounded-full px-4 sm:px-5 w-full sm:w-auto transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(43,168,160,0.4)] motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100"
                    >
                      <Video className="h-4 w-4 relative z-10" aria-hidden />
                      <span className="md:hidden relative z-10">Request Video — ₹{VIDEO_PRICE_PAISE / 100}</span>
                      <span className="hidden md:inline relative z-10">Request Analyst Video — ₹{VIDEO_PRICE_PAISE / 100}</span>
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden"
                      />
                    </Button>
                  </div>
                </div>
              </div>

              {/* RIGHT — Consultation */}
              <div className={cardWrap}>
                <div className={cardInner}>
                  <AnimatedPhoneIcon reduced={reducedMotion} />
                  <h3 className="mt-4 font-display text-xl leading-snug text-foreground">
                    Live 1:1 with a SEBI-registered analyst.
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Talk through your stock, position, or portfolio live with a SEBI-registered analyst.
                  </p>

                  <ul className="mt-4 space-y-1.5" aria-label="Consultation tiers (preview)">
                    {SESSION_TIERS.map((tier) => {
                      const isRec = recommendedTier?.id === tier.id;
                      return (
                        <li
                          key={tier.id}
                          className={
                            "group/row flex items-center justify-between rounded-xl border px-3 py-2 text-[12px] transition-colors duration-200 hover:bg-primary/[0.04] hover:border-l-2 hover:border-l-primary " +
                            (isRec
                              ? "border-primary/40 bg-gradient-to-r from-primary/[0.05] to-[#F5B731]/[0.08]"
                              : "border-border/60 bg-muted/20")
                          }
                        >
                          <span className="flex items-center gap-1.5 font-medium text-foreground">
                            {isRec && <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />}
                            {tier.minutes} min · {tier.label}
                          </span>
                          <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                            {formatINR(tier.amountPaise)}
                            {isRec && (
                              <span
                                className="rounded-full border px-1.5 py-[1px] text-[9px] font-mono uppercase tracking-wider hac-pill-pulse motion-reduce:animate-none"
                                style={{
                                  borderColor: "rgba(245,183,49,0.55)",
                                  background: "rgba(245,183,49,0.10)",
                                  color: "#B47A12",
                                }}
                              >
                                Recommended
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-[11px] text-muted-foreground/90">
                    Pick your session length on the next page →
                  </p>

                  <div className="mt-5">
                    {user ? (
                      <Button
                        asChild
                        variant="outline"
                        className="hac-glow group relative overflow-hidden gap-1.5 rounded-full border-primary/30 bg-card px-5 transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(43,168,160,0.4)] motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100"
                      >
                        <Link to="/analyst/$analystId" params={{ analystId: APPROVED_DEMO_ANALYST_ID }}>
                          <Phone className="h-4 w-4 relative z-10" aria-hidden />
                          <span className="relative z-10">Browse Analyst &amp; Book</span>
                          <ArrowRight className="h-4 w-4 relative z-10 transition-transform group-hover:translate-x-0.5" aria-hidden />
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden"
                          />
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => navigate({ to: "/signup", search: { next: "/analyst/4e534d46-709e-4eaf-a6f1-07f24d7b1d3e" } })}
                        className="hac-glow group relative overflow-hidden gap-1.5 rounded-full border-primary/30 bg-card px-5 transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(43,168,160,0.4)] motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100"
                      >
                        <Phone className="h-4 w-4 relative z-10" aria-hidden />
                        <span className="relative z-10">Browse Analyst &amp; Book</span>
                        <ArrowRight className="h-4 w-4 relative z-10 transition-transform group-hover:translate-x-0.5" aria-hidden />
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden"
                        />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Compliance footer */}
            <div className="flex items-start gap-2 border-t border-border/50 px-6 py-3 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
              <p>
                {FIRM.legalName} is a SEBI-registered Research Analyst ({FIRM.sebiRegNumber}). Investment decisions remain yours.
              </p>
            </div>
          </div>
        </div>

        <style>{`
          .hac-ping { animation: hac-ping 1.6s ease-in-out infinite; }
          @keyframes hac-ping {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.35); opacity: 0.55; }
          }
          .hac-glow { box-shadow: 0 8px 24px -12px hsl(var(--primary) / 0.46); transition: box-shadow 250ms ease-out, transform 250ms ease-out; }
          .hac-glow:hover { box-shadow: 0 14px 36px -14px hsl(var(--primary) / 0.6); }

          .hac-eyebrow-pulse { animation: hac-eyebrow-pulse 3s ease-in-out infinite, gradient-shift 6s linear infinite; }
          @keyframes hac-eyebrow-pulse {
            0%, 100% { opacity: 0.8; }
            50% { opacity: 1; }
          }

          .hac-pill-pulse { animation: hac-pill-pulse 2.5s ease-in-out infinite; }
          @keyframes hac-pill-pulse {
            0%, 100% { opacity: 0.85; box-shadow: 0 0 0 0 rgba(245,183,49,0); }
            50% { opacity: 1; box-shadow: 0 0 10px 1px rgba(245,183,49,0.35); }
          }

          @media (prefers-reduced-motion: reduce) {
            .hac-ping, .hac-glow, .hac-eyebrow-pulse, .hac-pill-pulse { animation: none !important; }
          }
        `}</style>
      </motion.section>

      <VideoAnswerPaymentModal
        open={videoOpen}
        onOpenChange={setVideoOpen}
        queryId={null}
      />
    </>
  );
}
