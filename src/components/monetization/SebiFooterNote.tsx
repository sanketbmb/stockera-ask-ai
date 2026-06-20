import { MONETIZATION_DISCLAIMER } from "@/lib/firm-details";

export function SebiFooterNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[10px] leading-relaxed text-muted-foreground ${className}`}>
      {MONETIZATION_DISCLAIMER}
    </p>
  );
}
