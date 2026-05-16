import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
  ctaHref?: string;
  tone?: "teal" | "gold" | "navy";
  className?: string;
}

const toneMap = {
  teal: "bg-accent/10 text-accent",
  gold: "bg-gold/15 text-gold-foreground",
  navy: "bg-primary/10 text-primary",
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  ctaLabel,
  onCta,
  ctaHref,
  tone = "teal",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full",
          toneMap[tone],
        )}
      >
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="mt-5 font-display text-xl text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {ctaLabel && (ctaHref ? (
        <Button asChild className="mt-6 rounded-full bg-gradient-brand text-white shadow-glow-teal">
          <a href={ctaHref}>{ctaLabel}</a>
        </Button>
      ) : (
        <Button onClick={onCta} className="mt-6 rounded-full bg-gradient-brand text-white shadow-glow-teal">
          {ctaLabel}
        </Button>
      ))}
    </div>
  );
}

export default EmptyState;
