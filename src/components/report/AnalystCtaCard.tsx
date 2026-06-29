// Premium Analyst CTA — Phase 3B.
// Universal shared CTA: one human-video offer + one live-consultation offer.
//
// Pricing sources are canonical:
//   - VIDEO_PRICE_PAISE (defined alongside src/lib/payments.functions.ts)
//   - SESSION_TIERS from src/lib/session-tiers.ts
//
// Consultation routing is locked to a single approved demo analyst profile
// (G1a). No dynamic analyst discovery in v1.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useReducedMotion } from "framer-motion";
import {
  ShieldCheck,
  Video,
  Phone,
  Sparkles,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoAnswerPaymentModal } from "@/components/payment/VideoAnswerPaymentModal";
import { SESSION_TIERS, formatINR } from "@/lib/session-tiers";
import { FIRM } from "@/lib/firm-details";
import { Reveal, Stagger, StaggerItem } from "@/lib/motion";
import { AnimatedVideoIcon, AnimatedPhoneIcon } from "@/components/landing/HomeAnalystCta";

// Canonical video price (₹100). Mirrors VIDEO_PRICE_PAISE in payments.functions.ts.
const VIDEO_PRICE_PAISE = 10000;

// Single approved demo analyst route target for v1 (G1a).
const APPROVED_DEMO_ANALYST_ID = "4e534d46-709e-4eaf-a6f1-07f24d7b1d3e";

export type AnalystCtaContext = "position" | "fresh" | "general";
export type AnalystCtaVariant = "report" | "homepage" | "dashboard";

interface AnalystCtaCardProps {
  queryId: string;
  context?: AnalystCtaContext;
  variant?: AnalystCtaVariant;
}

const VIDEO_HEADLINE: Record<AnalystCtaContext, string> = {
  position: "Get a human second opinion on your position",
  fresh: "Want a human entry & risk review?",
  general: "Need a SEBI-registered analyst to go deeper?",
};

// Gradient-border wrapper for both sub-cards (matches HomeAnalystCta).
const CARD_WRAP =
  "group/card relative rounded-2xl p-[1.5px] bg-[linear-gradient(135deg,#2BA8A0_0%,#1F3C73_55%,#F5B731_100%)] shadow-[0_4px_20px_rgba(31,60,115,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(43,168,160,0.22)] motion-reduce:hover:translate-y-0";
const CARD_INNER =
  "relative h-full rounded-[14px] bg-card px-4 py-5 sm:px-5 sm:py-6 md:px-6 md:py-8";

export function AnalystCtaCard({
  queryId,
  context = "general",
  variant = "report",
}: AnalystCtaCardProps) {
  const reducedMotion = useReducedMotion();
  const [videoOpen, setVideoOpen] = useState(false);
  const consultationHref = `/analyst/${APPROVED_DEMO_ANALYST_ID}`;
  const priceRupees = VIDEO_PRICE_PAISE / 100;
  const recommendedTier = useMemo(
    () => SESSION_TIERS.find((t) => t.highlight) ?? SESSION_TIERS[0],
    []
  );

  if (variant !== "report") {
    if (import.meta.env.DEV) {
      return (
        <div className="rounded-md border border-dashed border-muted-foreground/30 px-3 py-2 text-[11px] font-mono text-muted-foreground">
          AnalystCtaCard variant="{variant}" reserved for Stage 4+.
        </div>
      );
    }
    return null;
  }

  return (
    <>
      <ScopedStyles />
      <Reveal y={14}>
        <section
          aria-label="SEBI-registered analyst guidance"
          className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-background via-background to-primary/[0.04] p-[1px] shadow-[0_30px_60px_-30px_hsl(var(--primary)/0.25)]"
        >
          {/* Aurora layer */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
          >
            <div className="ctacard-aurora absolute -inset-[40%] opacity-[0.35]" />
          </div>

          <div className="relative rounded-[calc(1.5rem-1px)] bg-card/80 backdrop-blur-sm">
            {/* Top strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
              <span
                className="ctacard-aurora-text font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.18em]"
                aria-label="Premium · Human Analyst"
              >
                Premium · Human Analyst
              </span>
              <span className="flex items-center gap-2 text-[10px] sm:text-[11px] text-muted-foreground">
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-500/60 ctacard-ping" />
                  <span className="relative inline-block h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                SEBI-registered analysts on standby
              </span>
            </div>

            <Stagger
              staggerChildren={0.12}
              className="grid grid-cols-1 gap-4 px-4 pb-5 pt-4 sm:px-6 sm:pb-6 md:grid-cols-2 md:gap-5"
            >
              {/* LEFT — Video offer */}
              <StaggerItem className={CARD_WRAP}>
                <div className={CARD_INNER}>
                  <AnimatedVideoIcon reduced={reducedMotion} />
                  <h3 className="mt-3 sm:mt-4 font-display text-lg sm:text-xl leading-snug text-foreground">
                    {VIDEO_HEADLINE[context]}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    A SEBI-registered Research Analyst reviews your question and
                    records a personalized video answer. Delivered within 24 hours.
                  </p>

                  <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-[12px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-primary shrink-0" aria-hidden />
                      SEBI-registered RA
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-hidden />
                      Verified human review
                    </span>
                  </div>

                  <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row sm:flex-wrap sm:items-end sm:justify-between gap-3 sm:gap-4">
                    <div className="transition-transform duration-200 hover:scale-[1.03]">
                      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        Stockera · Verified
                      </div>
                      <div
                        className="mt-1 font-display text-3xl font-bold tabular-nums"
                        style={{ color: "#F5B731" }}
                      >
                        ₹{priceRupees.toLocaleString("en-IN")}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        One-time · No subscription
                      </div>
                    </div>
                    <Button
                      onClick={() => setVideoOpen(true)}
                      className="ctacard-glow group relative overflow-hidden gap-1.5 rounded-full px-4 sm:px-5 w-full sm:w-auto min-h-12 sm:min-h-10 transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(43,168,160,0.4)] motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100"
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
              </StaggerItem>

              {/* RIGHT — Consultation offer */}
              <StaggerItem className={CARD_WRAP}>
                <div className={CARD_INNER}>
                  <AnimatedPhoneIcon reduced={reducedMotion} />
                  <h3 className="mt-3 sm:mt-4 font-display text-lg sm:text-xl leading-snug text-foreground">
                    Book a live 1:1 with a SEBI analyst
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Talk through your stock, position, or portfolio live with a
                    SEBI-registered analyst.
                  </p>

                  <ul
                    className="mt-3 sm:mt-4 space-y-1.5 select-none"
                    aria-label="Consultation tiers (preview)"
                  >
                    {SESSION_TIERS.map((tier) => {
                      const isRec = tier.id === recommendedTier.id;
                      return (
                        <li
                          key={tier.id}
                          aria-disabled="true"
                          className={
                            "pointer-events-none flex items-center justify-between rounded-xl border px-3 py-2 text-[11px] sm:text-[12px] opacity-[0.92] " +
                            (isRec
                              ? "border-primary/40 bg-gradient-to-r from-primary/[0.05] to-[#F5B731]/[0.08]"
                              : "border-border/60 bg-muted/20")
                          }
                        >
                          <span className="flex items-center gap-1.5 font-medium text-foreground min-w-0">
                            {isRec && (
                              <Sparkles
                                className="h-3.5 w-3.5 text-primary shrink-0"
                                aria-label="Recommended"
                              />
                            )}
                            <span className="truncate">{tier.minutes} min · {tier.label}</span>
                          </span>
                          <span className="flex items-center gap-2 tabular-nums text-muted-foreground shrink-0">
                            {formatINR(tier.amountPaise)}
                            {isRec && (
                              <span
                                className="rounded-full border px-1.5 py-[1px] text-[9px] font-mono uppercase tracking-wider"
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

                  <div className="mt-4 sm:mt-5 flex flex-col gap-1.5">
                    <Button
                      asChild
                      variant="outline"
                      className="ctacard-glow group relative overflow-hidden gap-1.5 rounded-full border-primary/30 bg-card px-5 w-full sm:w-auto min-h-12 sm:min-h-10 transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(43,168,160,0.4)] motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100"
                    >
                      <Link to={consultationHref}>
                        <Phone className="h-4 w-4 relative z-10" aria-hidden />
                        <span className="relative z-10">Browse Analyst &amp; Book</span>
                        <ArrowRight className="h-4 w-4 relative z-10 transition-transform group-hover:translate-x-0.5" aria-hidden />
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden"
                        />
                      </Link>
                    </Button>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Opens the verified analyst profile, where you can pick a tier
                      and schedule your session.
                    </p>
                  </div>
                </div>
              </StaggerItem>
            </Stagger>

            {/* Compliance footer */}
            <div className="flex items-start gap-2 border-t border-border/50 px-4 sm:px-6 py-3 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
              <p className="break-words">
                {FIRM.legalName} is a SEBI-registered Research Analyst
                ({FIRM.sebiRegNumber}). Investment decisions remain yours.
              </p>
            </div>
          </div>
        </section>
      </Reveal>

      <VideoAnswerPaymentModal
        open={videoOpen}
        onOpenChange={setVideoOpen}
        queryId={queryId}
      />
    </>
  );
}

function Orb({ icon }: { icon: "video" | "phone" }) {
  const Icon = icon === "video" ? Video : Phone;
  return (
    <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20">
      <div
        aria-hidden
        className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/30 to-transparent opacity-0 blur-xl ctacard-shield-pulse"
      />
      <Icon className="relative h-5 w-5 text-primary" aria-hidden />
    </div>
  );
}

function ScopedStyles() {
  return (
    <style>{`
      @keyframes ctacard-aurora-shift {
        0%, 100% { transform: translate3d(0%, 0%, 0) rotate(0deg); }
        50%      { transform: translate3d(3%, -2%, 0) rotate(180deg); }
      }
      @keyframes ctacard-shield-pulse {
        0%, 100% { opacity: 0.35; transform: scale(1); }
        50%      { opacity: 0.7;  transform: scale(1.08); }
      }
      @keyframes ctacard-ping {
        0%   { transform: scale(1);   opacity: 0.75; }
        80%  { transform: scale(2.2); opacity: 0;    }
        100% { transform: scale(2.2); opacity: 0;    }
      }
      .ctacard-aurora {
        background:
          radial-gradient(40% 40% at 20% 30%, hsl(var(--primary) / 0.35), transparent 60%),
          radial-gradient(35% 35% at 80% 70%, hsl(var(--accent) / 0.30), transparent 60%),
          radial-gradient(30% 30% at 60% 20%, hsl(var(--primary) / 0.22), transparent 60%);
        filter: blur(40px);
        animation: ctacard-aurora-shift 22s ease-in-out infinite;
      }
      .ctacard-shield-pulse { animation: ctacard-shield-pulse 3.6s ease-in-out infinite; }
      .ctacard-ping { animation: ctacard-ping 2.4s cubic-bezier(0,0,0.2,1) infinite; }
      .ctacard-glow { box-shadow: 0 8px 24px -12px hsl(var(--primary) / 0.46); }
      .ctacard-glow:hover { box-shadow: 0 14px 36px -14px hsl(var(--primary) / 0.6); }
      @keyframes ctacard-aurora-text-shift {
        0%   { background-position: 0% 50%; }
        50%  { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      .ctacard-aurora-text {
        background-image: linear-gradient(
          90deg,
          hsl(258 90% 60%) 0%,
          hsl(217 91% 60%) 35%,
          hsl(160 84% 39%) 70%,
          hsl(258 90% 60%) 100%
        );
        background-size: 220% 100%;
        background-position: 0% 50%;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        -webkit-text-fill-color: transparent;
        animation: ctacard-aurora-text-shift 6s ease-in-out infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .ctacard-aurora,
        .ctacard-shield-pulse,
        .ctacard-ping,
        .ctacard-aurora-text { animation: none !important; }
      }

    `}</style>
  );
}
