import type { ReactNode } from "react";

interface GradientTextProps {
  children: ReactNode;
  className?: string;
}

// Gradient stops, background-size and animation timing are lifted EXACTLY
// from src/components/report/AnalystCtaCard.tsx `.ctacard-aurora-text`.
export function GradientText({ children, className }: GradientTextProps) {
  return (
    <>
      <style>{`
        @keyframes motion-aurora-text-shift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .motion-aurora-text {
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
          animation: motion-aurora-text-shift 6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .motion-aurora-text { animation: none; }
        }
      `}</style>
      <span className={"motion-aurora-text " + (className ?? "")}>{children}</span>
    </>
  );
}
