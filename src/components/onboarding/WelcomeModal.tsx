import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Wallet, Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "asktheexpert_welcome_seen_v1";
const BODY_TEXT_PRE = "We've credited";
const BODY_CHIP = "250 points";
const BODY_TEXT_POST =
  "to your wallet (valid for 30 days) — enough for ~5 AI reports. Use them to research stocks, get sector views, or ask SEBI-registered analysts.";

function hslFromToken(token: string): string {
  if (typeof window === "undefined") return "hsl(220 56% 28%)";
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  return raw ? `hsl(${raw})` : "hsl(220 56% 28%)";
}

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const confettiFiredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => setOpen(true), 400);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open || reduced || confettiFiredRef.current) return;
    confettiFiredRef.current = true;
    const id = window.setTimeout(async () => {
      try {
        const mod = await import("canvas-confetti");
        mod.default({
          particleCount: 150,
          spread: 70,
          startVelocity: 35,
          gravity: 0.8,
          ticks: 200,
          origin: { x: 0.5, y: 0 },
          colors: [
            hslFromToken("--primary"),
            hslFromToken("--accent"),
            hslFromToken("--gold"),
          ],
        });
      } catch {
        /* ignore */
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [open, reduced]);

  const markSeen = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) markSeen();
    setOpen(next);
  };

  const go = (to: "/post-query" | "/wallet") => {
    markSeen();
    setOpen(false);
    navigate({ to });
  };

  const panelVariants: Variants = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : {
        hidden: { opacity: 0, y: 20, scale: 0.92 },
        show: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: "spring", stiffness: 260, damping: 22, delay: 0.1 },
        },
        exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
      };

  const fadeUp = (delay: number): Variants =>
    reduced
      ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
      : {
          hidden: { opacity: 0, y: 8 },
          show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut", delay } },
        };

  const bodyContainer: Variants = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : {
        hidden: {},
        show: { transition: { staggerChildren: 0.04, delayChildren: 0.7 } },
      };

  const word: Variants = reduced
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
      };

  const chip: Variants = reduced
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, scale: 0.85 },
        show: { opacity: 1, scale: 1, transition: { duration: 0.35, delay: 0.9 } },
      };

  const primaryCta: Variants = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : {
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          scale: [1, 1.02, 1],
          transition: { delay: 1.5, duration: 0.6, times: [0, 0.5, 1] },
        },
      };

  const secondaryCta: Variants = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : {
        hidden: { opacity: 0 },
        show: { opacity: 0.6, transition: { delay: 1.8, duration: 0.3 } },
      };

  const renderWords = (text: string) => {
    const parts = text.split(" ");
    return parts.map((w, i) => (
      <motion.span key={`${w}-${i}`} variants={word} className="inline-block">
        {w}
        {i < parts.length - 1 ? "\u00A0" : ""}
      </motion.span>
    ));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <AnimatePresence>
          {open && (
            <motion.div
              key="panel"
              variants={panelVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              className="relative"
            >
              {!reduced && (
                <>
                  <style>{`
                    @keyframes orbFloat {
                      0%,100% { transform: translate3d(0,0,0) scale(1); }
                      50%     { transform: translate3d(12px,-16px,0) scale(1.08); }
                    }
                  `}</style>
                  <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                    <div
                      className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
                      style={{ animation: "orbFloat 18s ease-in-out infinite", animationDelay: "0s" }}
                    />
                    <div
                      className="absolute top-10 -right-12 h-44 w-44 rounded-full bg-accent/10 blur-3xl"
                      style={{ animation: "orbFloat 20s ease-in-out infinite", animationDelay: "-6s" }}
                    />
                    <div
                      className="absolute -bottom-12 left-1/3 h-36 w-36 rounded-full bg-gold/10 blur-3xl"
                      style={{ animation: "orbFloat 16s ease-in-out infinite", animationDelay: "-12s" }}
                    />
                  </div>
                </>
              )}

              <DialogHeader>
                <motion.div
                  variants={fadeUp(0.2)}
                  initial="hidden"
                  animate="show"
                  className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30"
                >
                  <Sparkles className="h-6 w-6 text-primary" />
                </motion.div>
                <DialogTitle asChild>
                  <motion.h2
                    variants={fadeUp(0.5)}
                    initial="hidden"
                    animate="show"
                    className="text-center font-display text-2xl"
                  >
                    Welcome to Ask The Expert 🎉
                  </motion.h2>
                </DialogTitle>
                <DialogDescription asChild>
                  <motion.p
                    variants={bodyContainer}
                    initial="hidden"
                    animate="show"
                    className="text-center text-sm leading-relaxed pt-2"
                  >
                    {reduced ? (
                      <>
                        We&apos;ve credited{" "}
                        <span className="font-semibold text-primary">250 points</span> to your wallet
                        (valid for 30 days) — enough for ~5 AI reports. Use them to research stocks,
                        get sector views, or ask SEBI-registered analysts.
                      </>
                    ) : (
                      <>
                        {renderWords(BODY_TEXT_PRE)}
                        <motion.span
                          variants={chip}
                          className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-semibold text-primary mx-1"
                          animate={{
                            boxShadow: [
                              "0 0 0 0 hsl(var(--accent) / 0)",
                              "0 0 24px 4px hsl(var(--accent) / 0.45)",
                              "0 0 0 0 hsl(var(--accent) / 0)",
                            ],
                          }}
                          transition={{ delay: 0.9, duration: 1.0, times: [0, 0.5, 1] }}
                        >
                          {BODY_CHIP}
                        </motion.span>
                        {renderWords(BODY_TEXT_POST)}
                      </>
                    )}
                  </motion.p>
                </DialogDescription>
              </DialogHeader>

              <DialogFooter className="flex flex-col sm:flex-col gap-2 sm:space-x-0 mt-4">
                <motion.div variants={primaryCta} initial="hidden" animate="show">
                  <Button
                    onClick={() => go("/post-query")}
                    className="group w-full bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-95"
                  >
                    <Plus className="h-4 w-4 mr-2 transition-transform group-hover:translate-x-1" /> Post your first query
                  </Button>
                </motion.div>
                <motion.div
                  variants={secondaryCta}
                  initial="hidden"
                  animate="show"
                  className="hover:opacity-100 transition-opacity"
                >
                  <Button onClick={() => go("/wallet")} variant="outline" className="w-full">
                    <Wallet className="h-4 w-4 mr-2" /> View wallet
                  </Button>
                </motion.div>
              </DialogFooter>

              <p className="text-center text-[10px] text-muted-foreground mt-2">
                SEBI Reg: INH000019071 · Educational only
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

export default WelcomeModal;
