// Stage 4F.2 APPLY-1 — small price pill used inside locked video cards.
import { cn } from "@/lib/utils";

interface Props {
  credits: number;
  tone?: "default" | "destructive";
  className?: string;
}

export function InlinePriceChip({ credits, tone = "default", className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "destructive"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted/60 text-foreground",
        className,
      )}
      aria-label={`${credits} credits to unlock`}
    >
      <span aria-hidden="true">🔒</span>
      <span>{credits} credits</span>
    </span>
  );
}

export default InlinePriceChip;
