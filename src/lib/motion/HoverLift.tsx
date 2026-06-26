import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "./tokens";

interface HoverLiftProps {
  children: ReactNode;
  className?: string;
  liftPx?: number;
}

export function HoverLift({ children, className, liftPx = 2 }: HoverLiftProps) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      whileHover={{ y: -liftPx }}
      transition={{ duration: 0.18, ease: EASE.smooth }}
    >
      {children}
    </motion.div>
  );
}
