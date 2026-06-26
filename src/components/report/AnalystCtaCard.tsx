// Premium Analyst CTA — Phase 3B.
// Universal shared CTA: one human-video offer + one live-consultation offer.
//
// Pricing sources are canonical:
//   - VIDEO_PRICE_PAISE (defined alongside src/lib/payments.functions.ts)
//   - SESSION_TIERS from src/lib/session-tiers.ts
//
// Consultation routing is locked to a single approved demo analyst profile
// (G1a). No dynamic analyst discovery in v1.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
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
import { Logo } from "@/components/common/Logo";

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

function useCountUp(target: number, durationMs = 900, enabled = true) {
  const [value, setValue] = useState(enabled ? 0 : target);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, durationMs, enabled]);
  return value;
}

export function AnalystCtaCard({
  queryId,
  context = "general",
  variant = "report",
}: AnalystCtaCardProps) {
  const reducedMotion = useReducedMotion();
  const [videoOpen, setVideoOpen] = useState(false);
  const consultationHref = `/analyst/${APPROVED_DEMO_ANALYST_ID}`;
  const priceRupees = useCountUp(VIDEO_PRICE_PAISE / 100, 800, !reducedMotion);
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
      <motion.section
        aria-label="SEBI-registered analyst guidance"
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-background via-background to-primary/[0.03] p-[1px] shadow-[0_1px_0_0_hsl(var(--border))_inset,0_30px_60px_-30px_hsl(var(--primary)/0.18)]"
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
          <div className="flex items-center justify-between gap-3 px-6 pt-5">
            <span
              className="ctacard-aurora-text font-mono text-[10px] uppercase tracking-[0.18em]"
              aria-label="Premium · Human Analyst"
            >
              Premium · Human Analyst
            </span>
            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-emerald-500/60 ctacard-ping" />
                <span className="relative inline-block h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              SEBI-registered analysts on standby
            </span>
          </div>


          <div className="grid grid-cols-1 gap-px bg-border/40 px-6 pb-6 pt-4 md:grid-cols-2 md:gap-0 md:px-0 md:pt-0">
            {/* LEFT — Video offer */}
            <div className="relative rounded-2xl md:rounded-none md:rounded-bl-[calc(1.5rem-1px)] md:border-r md:border-border/50 bg-card px-6 py-6 md:py-8">
              <Orb icon="video" />
              <h3 className="mt-4 font-display text-xl leading-snug text-foreground">
                {VIDEO_HEADLINE[context]}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                A SEBI-registered Research Analyst reviews your question and
                records a personalized video answer. Delivered within 24 hours.
              </p>

              <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                <span>SEBI-registered RA</span>
                <span aria-hidden className="text-border">·</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                <span>Verified human review</span>
              </div>

              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                    <span className="inline-flex items-center justify-center" style={{ width: 22, height: 22 }}>
                      <Logo variant="compact" size="sm" linkTo={null} showTagline={false} />
                    </span>
                    <span>Stockera · Verified</span>
                  </div>
                  <div className="mt-1 font-display text-3xl tabular-nums text-foreground">
                    ₹{priceRupees.toLocaleString("en-IN")}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    One-time · No subscription
                  </div>
                </div>
                <Button
                  onClick={() => setVideoOpen(true)}
                  className="ctacard-glow shrink-0 whitespace-nowrap gap-1.5 rounded-full px-5 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Video className="h-4 w-4" aria-hidden />
                  Request Analyst Video — ₹{VIDEO_PRICE_PAISE / 100}
                </Button>
              </div>

            </div>

            {/* RIGHT — Consultation offer */}
            <div className="relative rounded-2xl md:rounded-none md:rounded-br-[calc(1.5rem-1px)] bg-card px-6 py-6 md:py-8">
              <Orb icon="phone" />
              <h3 className="mt-4 font-display text-xl leading-snug text-foreground">
                Book a live 1:1 with a SEBI analyst
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Talk through your stock, position, or portfolio live with a
                SEBI-registered analyst.
              </p>

              <ul
                className="mt-4 space-y-1.5 select-none"
                aria-label="Consultation tiers (preview)"
              >
                {SESSION_TIERS.map((tier) => {
                  const isRec = tier.id === recommendedTier.id;
                  return (
                    <li
                      key={tier.id}
                      aria-disabled="true"
                      className={
                        "pointer-events-none flex items-center justify-between rounded-xl border px-3 py-2 text-[12px] opacity-[0.86] " +
                        (isRec
                          ? "border-primary/40 bg-primary/[0.04]"
                          : "border-border/60 bg-muted/20")
                      }
                    >
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        {isRec && (
                          <Sparkles
                            className="h-3.5 w-3.5 text-primary"
                            aria-label="Recommended"
                          />
                        )}
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


              <div className="mt-5 flex flex-col gap-1.5">
                <Button
                  asChild
                  variant="outline"
                  className="ctacard-glow group gap-1.5 rounded-full border-primary/30 bg-card px-5 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Link to={consultationHref}>
                    <Phone className="h-4 w-4" aria-hidden />
                    Browse Analyst &amp; Book
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </Button>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Opens the verified analyst profile, where you can pick a tier
                  and schedule your session.
                </p>
              </div>
            </div>
          </div>

          {/* Compliance footer */}
          <div className="flex items-start gap-2 border-t border-border/50 px-6 py-3 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
            <p>
              {FIRM.legalName} is a SEBI-registered Research Analyst
              ({FIRM.sebiRegNumber}). Investment decisions remain yours.
            </p>
          </div>
        </div>
      </motion.section>

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
