import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// TECH-DEBT: VIDEO_PRICE_PAISE is duplicated across the repo (payments.functions.ts,
// VideoAnswerPaymentModal, HomeAnalystCta, LiveDemandBlock, AnalystCtaCard). Mirror
// here to stay consistent until a single canonical pricing module is introduced.
const VIDEO_PRICE_PAISE = 10000;

export function MobileStickyCta() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < 240) {
          setVisible(false);
        } else if (y > lastY.current) {
          setVisible(true);
        } else if (y < lastY.current - 4) {
          setVisible(false);
        }
        lastY.current = y;
        ticking.current = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.div
      role="region"
      aria-label="Quick actions"
      initial={false}
      animate={reduced ? { opacity: visible ? 1 : 0 } : { y: visible ? 0 : 96, opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 shadow-lg backdrop-blur md:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">SEBI-Registered RA</div>
          <div className="truncate text-sm font-semibold text-foreground">
            ₹{VIDEO_PRICE_PAISE / 100} video · 24h
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0 rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
          <Link to="/post-query">
            Post Query Free <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}
