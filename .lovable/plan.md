# W-Onb-Motion-1 — Tier 3 Motion Upgrade for WelcomeModal

## 1) Discovery Summary

- **framer-motion**: ✅ present in `package.json` → `"framer-motion": "^12.38.0"`. No new install needed.
- **canvas-confetti**: ❌ NOT present. This is the ONLY new dependency (~8 KB gz). Will be lazy-loaded via dynamic `import("canvas-confetti")` so reduced-motion users pay zero cost. Types via `@types/canvas-confetti` (devDep, ~0 KB runtime).
- **Brand color tokens** (verified, no invented hex) — `src/styles.css`:
  - L47 `--primary: 220 56% 28%`
  - L53 `--accent: 176 58% 41%`
  - L55 `--gold: 41 90% 58%`
  - L41 `--background`, L43 `--card`, L51 `--muted`, L59 `--border` (already used by current modal)
  - Tailwind v4 maps these via `--color-primary`, `--color-accent`, `--color-gold` (L20–27). Existing modal already uses `from-primary/20 to-accent/20`, `bg-primary`, etc. — same token surface remains the source of truth.
  - Confetti colors will be resolved at runtime by reading the CSS custom properties (`getComputedStyle(document.documentElement).getPropertyValue('--primary')` → wrap into `hsl(...)`). No raw hex literals.
- **shadcn Dialog animation override feasibility**: ✅. `DialogContent` accepts `className` and forwards refs; we wrap inner content in `motion.div` blocks. The Radix Dialog primitive (`@/components/ui/dialog.tsx`) is untouched — only the children inside `<DialogContent>` change. Backdrop fade is already provided by `DialogOverlay`; we layer our own backdrop/orb canvas behind content via `fixed` positioning anchored to the overlay portal. ARIA wiring (`aria-labelledby`/`aria-describedby` from `DialogTitle`/`DialogDescription`) is preserved — those components stay in place; motion wrappers go around them.

## 2) Scope Decision

**Exactly one file edited**: `src/components/onboarding/WelcomeModal.tsx`.

Sufficient because:
- Dialog primitive already animates entry/exit at the Radix layer; we layer extra motion inside `DialogContent` without touching `ui/dialog.tsx`.
- Confetti is fired from a `useEffect` local to the modal.
- Orbs render as absolutely-positioned siblings inside `DialogContent`.
- Reduced-motion branch is a local guard.
- No business logic, gate, route, copy, or storage key changes.

Optional dep additions (`canvas-confetti`, `@types/canvas-confetti`) are package.json/lockfile only — counted as dependency policy, not source edits beyond the one file.

## 3) Choreography Plan

State: `mounted` (true after open + ~16 ms tick) drives the variants. Reduced-motion short-circuits all of this.

| T (ms) | Element | Mechanism |
| --- | --- | --- |
| 0 | Backdrop | Radix `DialogOverlay` default fade (already 0→1). No override. |
| 100 | Modal panel | `motion.div` variants: `hidden { opacity:0, y:20, scale:0.92 }` → `show { opacity:1, y:0, scale:1, transition:{ type:"spring", stiffness:260, damping:22, delay:0.1 } }` |
| 400 | Confetti burst | `useEffect` after open → `setTimeout(400)` → dynamic `import("canvas-confetti")` → `confetti({ particleCount:150, spread:70, startVelocity:35, gravity:0.8, ticks:200, origin:{ x:0.5, y:0 }, colors:[hslFromToken('--primary'), hslFromToken('--accent'), hslFromToken('--gold')] })`. Fires once; ref guard `firedRef.current` prevents re-fire on re-render or open-toggle. |
| 500 | Title | `motion.div` wrapping `DialogTitle` with `{ hidden:{opacity:0,y:8}, show:{opacity:1,y:0, transition:{duration:0.4, ease:"easeOut", delay:0.5}} }` |
| 700 | Body word-stagger | Split copy string into words; render each in `motion.span` (with trailing space). Parent `motion.p` (wrapping `DialogDescription` as `asChild`) uses `variants={{ show:{ transition:{ staggerChildren:0.04, delayChildren:0.7 } } }}`. Child variants `{ hidden:{opacity:0,y:8}, show:{opacity:1,y:0, transition:{duration:0.25}} }`. |
| 900 | "250 points" chip | The bolded "250 points" word becomes a `motion.span` pill (`inline-flex … rounded-full bg-primary/10 text-primary border border-primary/30 px-2`). Variants override: `{ hidden:{opacity:0, scale:0.85}, show:{opacity:1, scale:1, transition:{duration:0.35, delay:0.9}} }`. Single glow via `animate={{ boxShadow:["0 0 0 0 hsl(var(--accent)/0)","0 0 24px 4px hsl(var(--accent)/0.45)","0 0 0 0 hsl(var(--accent)/0)"] }}` with `transition:{ delay:0.9, duration:1.0, times:[0,0.5,1] }` — runs once, then static. No `repeat`. |
| 1500 | Primary CTA | `motion.div` wrapper variants `{ hidden:{opacity:0}, show:{opacity:1, scale:[1,1.02,1], transition:{ delay:1.5, duration:0.6, times:[0,0.5,1] }} }`. Arrow icon already inside button gets `group-hover:translate-x-1` Tailwind class for the +4 px hover. |
| 1800 | Secondary CTA | `motion.div` wrapper `{ hidden:{opacity:0}, show:{opacity:0.6, transition:{delay:1.8, duration:0.3}} }`, Tailwind `hover:opacity-100 transition-opacity`. |

**Continuous background orbs** (while modal open):
- 3 absolutely-positioned `<div>`s inside `DialogContent` (behind content via `-z-10` + `pointer-events-none overflow-hidden` on parent).
- Pure Tailwind + inline `style={{ animation: "orbFloat 18s ease-in-out infinite" }}` referencing keyframes defined in a `<style>` block inside the same file (scoped, local to component) using `transform: translate3d(...)` only.
- Colors: `bg-primary/10`, `bg-accent/10`, `bg-gold/10` with `blur-3xl`. Opacity range 0.05–0.10 baked into `/10` token-alpha syntax.
- Three orbs with offset delays (`0s`, `-6s`, `-12s`) for phase variety.

**Exit**:
- `AnimatePresence` not needed at this level — Radix Dialog handles unmount fade. We add `exit={{ opacity:0, scale:0.95, transition:{ duration:0.2 } }}` on the panel motion.div and wrap with `<AnimatePresence>` keyed on `open`.
- Confetti decays naturally (ticks:200). No manual stop.

**`prefers-reduced-motion` fallback**:
- `const reduced = useReducedMotion()` (framer-motion hook — SSR safe, returns false on server).
- If `reduced`:
  - Skip dynamic `import("canvas-confetti")` entirely (the timeout/import never schedules).
  - Skip orb renders (`reduced ? null : <Orbs />`).
  - Replace all variants with a single `{ hidden:{opacity:0}, show:{opacity:1, transition:{duration:0.2}} }` shared variant, no stagger, no delays, no glow, no scale pulse.
  - Body renders as plain `DialogDescription` (no word splitting).
  - Chip renders without scale/glow keyframes.
- Gate logic, localStorage, copy text, routes, SSR `typeof window` guard — all untouched.

## 4) Full Unified Diff

```diff
--- a/src/components/onboarding/WelcomeModal.tsx
+++ b/src/components/onboarding/WelcomeModal.tsx
@@
-import { useEffect, useState } from "react";
+import { useEffect, useRef, useState } from "react";
 import { useNavigate } from "@tanstack/react-router";
 import { Sparkles, Wallet, Plus } from "lucide-react";
+import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
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
+const BODY_TEXT_PRE = "We've credited";
+const BODY_CHIP = "250 points";
+const BODY_TEXT_POST =
+  "to your wallet (valid for 30 days) — enough for ~5 AI reports. Use them to research stocks, get sector views, or ask SEBI-registered analysts.";
+
+function hslFromToken(token: string): string {
+  if (typeof window === "undefined") return "hsl(220 56% 28%)";
+  const raw = getComputedStyle(document.documentElement)
+    .getPropertyValue(token)
+    .trim();
+  return raw ? `hsl(${raw})` : "hsl(220 56% 28%)";
+}

 export function WelcomeModal() {
   const [open, setOpen] = useState(false);
   const navigate = useNavigate();
+  const reduced = useReducedMotion();
+  const confettiFiredRef = useRef(false);

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

+  useEffect(() => {
+    if (!open || reduced || confettiFiredRef.current) return;
+    confettiFiredRef.current = true;
+    const id = window.setTimeout(async () => {
+      try {
+        const mod = await import("canvas-confetti");
+        mod.default({
+          particleCount: 150,
+          spread: 70,
+          startVelocity: 35,
+          gravity: 0.8,
+          ticks: 200,
+          origin: { x: 0.5, y: 0 },
+          colors: [
+            hslFromToken("--primary"),
+            hslFromToken("--accent"),
+            hslFromToken("--gold"),
+          ],
+        });
+      } catch {
+        /* ignore */
+      }
+    }, 400);
+    return () => window.clearTimeout(id);
+  }, [open, reduced]);
+
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

+  const panelVariants: Variants = reduced
+    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
+    : {
+        hidden: { opacity: 0, y: 20, scale: 0.92 },
+        show: {
+          opacity: 1,
+          y: 0,
+          scale: 1,
+          transition: { type: "spring", stiffness: 260, damping: 22, delay: 0.1 },
+        },
+        exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
+      };
+
+  const fadeUp = (delay: number): Variants =>
+    reduced
+      ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
+      : {
+          hidden: { opacity: 0, y: 8 },
+          show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut", delay } },
+        };
+
+  const bodyContainer: Variants = reduced
+    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
+    : {
+        hidden: {},
+        show: { transition: { staggerChildren: 0.04, delayChildren: 0.7 } },
+      };
+
+  const word: Variants = reduced
+    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
+    : {
+        hidden: { opacity: 0, y: 8 },
+        show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
+      };
+
+  const chip: Variants = reduced
+    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
+    : {
+        hidden: { opacity: 0, scale: 0.85 },
+        show: { opacity: 1, scale: 1, transition: { duration: 0.35, delay: 0.9 } },
+      };
+
+  const primaryCta: Variants = reduced
+    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
+    : {
+        hidden: { opacity: 0 },
+        show: {
+          opacity: 1,
+          scale: [1, 1.02, 1],
+          transition: { delay: 1.5, duration: 0.6, times: [0, 0.5, 1] },
+        },
+      };
+
+  const secondaryCta: Variants = reduced
+    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
+    : {
+        hidden: { opacity: 0 },
+        show: { opacity: 0.6, transition: { delay: 1.8, duration: 0.3 } },
+      };
+
+  const renderWords = (text: string) =>
+    text.split(" ").map((w, i) => (
+      <motion.span key={`${w}-${i}`} variants={word} className="inline-block">
+        {w}
+        {i < text.split(" ").length - 1 ? "\u00A0" : ""}
+      </motion.span>
+    ));
+
   return (
     <Dialog open={open} onOpenChange={handleOpenChange}>
-      <DialogContent className="sm:max-w-md">
-        <DialogHeader>
-          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
-            <Sparkles className="h-6 w-6 text-primary" />
-          </div>
-          <DialogTitle className="text-center font-display text-2xl">
-            Welcome to Ask The Expert 🎉
-          </DialogTitle>
-          <DialogDescription className="text-center text-sm leading-relaxed pt-2">
-            We&apos;ve credited <span className="font-semibold text-foreground">250 points</span> to your wallet
-            (valid for 30 days) — enough for ~5 AI reports. Use them to research stocks,
-            get sector views, or ask SEBI-registered analysts.
-          </DialogDescription>
-        </DialogHeader>
-        <DialogFooter className="flex flex-col sm:flex-col gap-2 sm:space-x-0">
-          <Button
-            onClick={() => go("/post-query")}
-            className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-95"
-          >
-            <Plus className="h-4 w-4 mr-2" /> Post your first query
-          </Button>
-          <Button onClick={() => go("/wallet")} variant="outline" className="w-full">
-            <Wallet className="h-4 w-4 mr-2" /> View wallet
-          </Button>
-        </DialogFooter>
-        <p className="text-center text-[10px] text-muted-foreground mt-2">
-          SEBI Reg: INH000019071 · Educational only
-        </p>
-      </DialogContent>
+      <DialogContent className="sm:max-w-md overflow-hidden">
+        <AnimatePresence>
+          {open && (
+            <motion.div
+              key="panel"
+              variants={panelVariants}
+              initial="hidden"
+              animate="show"
+              exit="exit"
+              className="relative"
+            >
+              {!reduced && (
+                <>
+                  <style>{`
+                    @keyframes orbFloat {
+                      0%,100% { transform: translate3d(0,0,0) scale(1); }
+                      50%     { transform: translate3d(12px,-16px,0) scale(1.08); }
+                    }
+                  `}</style>
+                  <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
+                    <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
+                         style={{ animation: "orbFloat 18s ease-in-out infinite", animationDelay: "0s" }} />
+                    <div className="absolute top-10 -right-12 h-44 w-44 rounded-full bg-accent/10 blur-3xl"
+                         style={{ animation: "orbFloat 20s ease-in-out infinite", animationDelay: "-6s" }} />
+                    <div className="absolute -bottom-12 left-1/3 h-36 w-36 rounded-full bg-gold/10 blur-3xl"
+                         style={{ animation: "orbFloat 16s ease-in-out infinite", animationDelay: "-12s" }} />
+                  </div>
+                </>
+              )}
+
+              <DialogHeader>
+                <motion.div
+                  variants={fadeUp(0.2)}
+                  initial="hidden"
+                  animate="show"
+                  className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30"
+                >
+                  <Sparkles className="h-6 w-6 text-primary" />
+                </motion.div>
+                <DialogTitle asChild>
+                  <motion.h2
+                    variants={fadeUp(0.5)}
+                    initial="hidden"
+                    animate="show"
+                    className="text-center font-display text-2xl"
+                  >
+                    Welcome to Ask The Expert 🎉
+                  </motion.h2>
+                </DialogTitle>
+                <DialogDescription asChild>
+                  <motion.p
+                    variants={bodyContainer}
+                    initial="hidden"
+                    animate="show"
+                    className="text-center text-sm leading-relaxed pt-2"
+                  >
+                    {reduced ? (
+                      <>
+                        We&apos;ve credited{" "}
+                        <span className="font-semibold text-primary">250 points</span> to your wallet
+                        (valid for 30 days) — enough for ~5 AI reports. Use them to research stocks,
+                        get sector views, or ask SEBI-registered analysts.
+                      </>
+                    ) : (
+                      <>
+                        {renderWords(BODY_TEXT_PRE)}
+                        <motion.span
+                          variants={chip}
+                          className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-semibold text-primary mx-1"
+                          animate={{
+                            boxShadow: [
+                              "0 0 0 0 hsl(var(--accent) / 0)",
+                              "0 0 24px 4px hsl(var(--accent) / 0.45)",
+                              "0 0 0 0 hsl(var(--accent) / 0)",
+                            ],
+                          }}
+                          transition={{ delay: 0.9, duration: 1.0, times: [0, 0.5, 1] }}
+                        >
+                          {BODY_CHIP}
+                        </motion.span>
+                        {renderWords(BODY_TEXT_POST)}
+                      </>
+                    )}
+                  </motion.p>
+                </DialogDescription>
+              </DialogHeader>
+
+              <DialogFooter className="flex flex-col sm:flex-col gap-2 sm:space-x-0 mt-4">
+                <motion.div variants={primaryCta} initial="hidden" animate="show">
+                  <Button
+                    onClick={() => go("/post-query")}
+                    className="group w-full bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-95"
+                  >
+                    <Plus className="h-4 w-4 mr-2 transition-transform group-hover:translate-x-1" /> Post your first query
+                  </Button>
+                </motion.div>
+                <motion.div variants={secondaryCta} initial="hidden" animate="show" className="hover:opacity-100 transition-opacity">
+                  <Button onClick={() => go("/wallet")} variant="outline" className="w-full">
+                    <Wallet className="h-4 w-4 mr-2" /> View wallet
+                  </Button>
+                </motion.div>
+              </DialogFooter>
+
+              <p className="text-center text-[10px] text-muted-foreground mt-2">
+                SEBI Reg: INH000019071 · Educational only
+              </p>
+            </motion.div>
+          )}
+        </AnimatePresence>
+      </DialogContent>
     </Dialog>
   );
 }

 export default WelcomeModal;
```

**Also**: `bun add canvas-confetti` and `bun add -d @types/canvas-confetti` (package.json/lockfile only — no other source edits).

## 5) Anti-Fabrication Checklist

| | Item | Status |
|---|---|---|
| A | Only WelcomeModal.tsx touched | ✅ |
| B | Dashboard.tsx NOT touched | ✅ |
| C | OnboardingTour.tsx NOT touched | ✅ |
| D | paywall.ts / points.ts / QueryForm / stock picker NOT touched | ✅ |
| E | No copy text changed (verbatim same string, split for stagger only) | ✅ |
| F | localStorage key unchanged (`asktheexpert_welcome_seen_v1`) | ✅ |
| G | SSR safety untouched (`typeof window === "undefined"` guard kept) | ✅ |
| H | Routes unchanged (`/post-query`, `/wallet`) | ✅ |
| I | No new deps besides `canvas-confetti` (+ its types) | ✅ |
| J | canvas-confetti lazy-loaded via dynamic `import()` | ✅ |
| K | prefers-reduced-motion fallback implemented (orbs, confetti, stagger, glow all skipped) | ✅ |
| L | All colors via tokens (`--primary`/`--accent`/`--gold`); no hex literals | ✅ |
| M | No numeric count-up animation | ✅ |
| N | No react-router-dom added (still uses `@tanstack/react-router`) | ✅ |
| O | Confetti is one-shot (`firedRef` guard, no `repeat`) | ✅ |

## 6) Validation Matrix

| Scenario | Expected |
|---|---|
| New user, motion enabled | Backdrop fades, panel springs in, confetti at ~400 ms, title→body word stagger→chip glow→CTAs, settles by ~1.9 s |
| New user, prefers-reduced-motion | Single 200 ms opacity fade; no confetti import, no orbs, no stagger, no glow; copy identical |
| Returning user (key set) | Modal never opens; no confetti import; useEffect early-returns |
| Close via overlay click | `onOpenChange(false)` → `markSeen()` → reverse exit (200 ms) → confetti decays naturally |
| Close via ESC | Same path as overlay click (Radix handles ESC) → key persisted |
| **Bonus**: cold load animation budget | All visible motion completes ≤ 1.9 s; orbs continue ambient until close — total entry < 2.5 s ✅ |

## 7) Final Status

**PLAN ONLY — STOP. Awaiting explicit `apply W-Onb-Motion-1`.**
