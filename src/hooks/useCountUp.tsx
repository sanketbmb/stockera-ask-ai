// useCountUp — Stockera shared count-up hook.
// • Animates from 0 → target (including negatives) with easeOutCubic.
// • Honors prefers-reduced-motion: snaps to target instantly.
// • Triggers when the element enters the viewport.
// • Null/NaN targets render as the configured dash ("—") and do not animate.

import { useEffect, useRef, useState } from "react";
import { useReducedMotion, useInView } from "framer-motion";

interface Options {
  /** Target numeric value. Null/undefined/NaN → dash, no animation. */
  value: number | null | undefined;
  /** Animation duration in ms (default 800). */
  duration?: number;
  /** Decimals for formatting (default 0). */
  decimals?: number;
  /** Prefix string (e.g. "₹"). */
  prefix?: string;
  /** Suffix string (e.g. "%", "×"). */
  suffix?: string;
  /** Show explicit "+" for positives. */
  signed?: boolean;
  /** Dash placeholder. */
  dash?: string;
  /** locale formatting (default en-IN). */
  locale?: string;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function useCountUp({
  value,
  duration = 800,
  decimals = 0,
  prefix = "",
  suffix = "",
  signed = false,
  dash = "—",
  locale = "en-IN",
}: Options) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const [current, setCurrent] = useState<number>(0);
  const rafRef = useRef<number | null>(null);

  const isMissing =
    value == null || (typeof value === "number" && !Number.isFinite(value));

  useEffect(() => {
    if (isMissing) return;
    if (!inView) return;
    const target = value as number;

    // Reduced motion → snap immediately.
    if (reduce) {
      setCurrent(target);
      return;
    }

    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      setCurrent(from + (target - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setCurrent(target);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [inView, value, duration, reduce, isMissing]);

  let text: string;
  if (isMissing) {
    text = dash;
  } else {
    const v = current;
    const formatted = v.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    const sign = signed && (value as number) > 0 ? "+" : "";
    text = `${sign}${prefix}${formatted}${suffix}`;
  }

  return { ref, text, current, isMissing };
}

/** Stand-alone component wrapper for inline numeric animation. */
export function AnimatedNumber(props: Options & { className?: string }) {
  const { className, ...rest } = props;
  const { ref, text } = useCountUp(rest);
  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
