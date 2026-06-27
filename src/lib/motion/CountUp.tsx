import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

interface CountUpProps {
  to: number;
  durationMs?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  format?: (n: number) => string;
}

function defaultFormat(n: number, decimals: number, prefix: string, suffix: string) {
  return `${prefix}${n.toFixed(decimals)}${suffix}`;
}

export function CountUp({
  to,
  durationMs = 1100,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  format,
}: CountUpProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: false, amount: 0.15 });
  const [value, setValue] = useState(reduced ? to : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setValue(to);
      return;
    }
    if (!inView) return;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(to * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [inView, to, durationMs, reduced]);

  const text = format ? format(value) : defaultFormat(value, decimals, prefix, suffix);
  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
