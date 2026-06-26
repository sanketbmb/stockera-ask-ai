import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration, delay, ease: EASE.snap }}
    >
      {children}
    </motion.div>
  );
}
