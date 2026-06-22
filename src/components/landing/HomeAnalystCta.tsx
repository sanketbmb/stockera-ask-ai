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
const CONSULTATION_HREF = `/analyst/${APPROVED_DEMO_ANALYST_ID}` as const;

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
      navigate({ to: "/signup" });
      return;
    }
    setVideoOpen(true);
  };

  return (
    <>
      <motion.section
        aria-label="Premium human analyst services"
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="container mx-auto px-4 py-12 md:py-16"
      >
        <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-background via-background to-primary/[0.04] p-[1px] shadow-[0_30px_60px_-30px_hsl(var(--primary)/0.25)]">
          <div className="relative rounded-[calc(1.5rem-1px)] bg-card/80 backdrop-blur-sm">
            {/* Top strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
              <span className="hac-aurora-text font-mono text-[10px] uppercase tracking-[0.18em]">
                Premium · Human Analyst
              </span>
              <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="relative inline-flex h-2 w-2">
                  <span className="hac-ping absolute inset-0 rounded-full bg-emerald-500/60" />
                  <span className="relative inline-block h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                SEBI-registered analysts on standby
              </span>
            </div>

            <div className="grid grid-cols-1 gap-px bg-border/40 px-6 pb-6 pt-4 md:grid-cols-2 md:gap-0 md:px-0 md:pt-0">
              {/* LEFT — Video */}
              <div className="relative rounded-2xl md:rounded-none md:border-r md:border-border/50 bg-card px-6 py-6 md:py-8">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20">
                  <Video className="h-5 w-5 text-primary" aria-hidden />
                </div>
                <h3 className="mt-4 font-display text-xl leading-snug text-foreground">
                  Want a human second opinion before you act?
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
                <div className="mt-5 flex items-end justify-between gap-4">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Stockera · Verified
                    </div>
                    <div className="mt-1 font-display text-3xl tabular-nums text-foreground">
                      ₹{VIDEO_PRICE_PAISE / 100}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      One-time · No subscription
                    </div>
                  </div>
                  <Button
                    onClick={onVideoClick}
                    className="hac-glow gap-1.5 rounded-full px-5"
                  >
                    <Video className="h-4 w-4" aria-hidden />
                    Request Analyst Video — ₹{VIDEO_PRICE_PAISE / 100}
                  </Button>
                </div>
              </div>

              {/* RIGHT — Consultation */}
              <div className="relative rounded-2xl md:rounded-none bg-card px-6 py-6 md:py-8">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20">
                  <Phone className="h-5 w-5 text-primary" aria-hidden />
                </div>
                <h3 className="mt-4 font-display text-xl leading-snug text-foreground">
                  Book a live 1:1 with a SEBI analyst
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
                          "flex items-center justify-between rounded-xl border px-3 py-2 text-[12px] " +
                          (isRec
                            ? "border-primary/40 bg-primary/[0.04]"
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
                            <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-[1px] text-[9px] font-mono uppercase tracking-wider text-primary">
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
                      className="hac-glow group gap-1.5 rounded-full border-primary/30 bg-card px-5"
                    >
                      <Link to="/analyst/$analystId" params={{ analystId: APPROVED_DEMO_ANALYST_ID }}>
                        <Phone className="h-4 w-4" aria-hidden />
                        Browse Analyst &amp; Book
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => navigate({ to: "/signup" })}
                      className="hac-glow group gap-1.5 rounded-full border-primary/30 bg-card px-5"
                    >
                      <Phone className="h-4 w-4" aria-hidden />
                      Browse Analyst &amp; Book
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Button>
                  )}
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
          .hac-aurora-text {
            background: linear-gradient(90deg, #7c3aed, #3b82f6, #10b981, #7c3aed);
            background-size: 300% 100%;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            -webkit-text-fill-color: transparent;
            animation: hac-aurora-text-shift 8s linear infinite;
            font-weight: 600;
          }
          @keyframes hac-aurora-text-shift {
            0% { background-position: 0% 50%; }
            100% { background-position: 300% 50%; }
          }
          .hac-ping { animation: hac-ping 1.6s ease-in-out infinite; }
          @keyframes hac-ping {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.35); opacity: 0.55; }
          }
          .hac-glow { box-shadow: 0 8px 24px -12px hsl(var(--primary) / 0.46); transition: box-shadow 250ms ease-out; }
          .hac-glow:hover { box-shadow: 0 14px 36px -14px hsl(var(--primary) / 0.6); }
          @media (prefers-reduced-motion: reduce) {
            .hac-aurora-text, .hac-ping, .hac-glow { animation: none !important; }
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
