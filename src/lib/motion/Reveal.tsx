import type { ReactNode } from "react";
import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { EASE, DURATION } from "./tokens";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  duration?: number;
  className?: string;
}

export function Reveal({
  children,
  delay = 0,
  y = 12,
  duration = DURATION.base,
  className,
}: RevealProps) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: false, amount: 0.15 });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration, delay, ease: EASE.snap }}
    >
      {children}
    </motion.div>
  );
}
