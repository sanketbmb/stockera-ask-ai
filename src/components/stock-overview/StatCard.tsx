import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number | null | undefined;
  hint?: string;
  className?: string;
  /** Optional sector-fallback marker (e.g. "Sector avg") shown as a badge with tooltip. */
  fallbackLabel?: string;
  fallbackTooltip?: string;
}

export function StatCard({ label, value, hint, className, fallbackLabel, fallbackTooltip }: Props) {
  const display =
    value === null || value === undefined || value === "" || Number.isNaN(value as number)
      ? "—"
      : typeof value === "number"
      ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)
      : String(value);
  return (
    <Card className={cn("flex h-full flex-col justify-between p-4 transition-colors hover:border-primary/40", className)}>
      <div className="min-w-0 truncate text-xs uppercase tracking-wide text-muted-foreground" title={label}>
        {label}
      </div>
      <div className="mt-1 truncate font-display text-xl tabular-nums text-foreground" title={typeof value === "string" ? value : undefined}>
        {display}
      </div>
      <div className="mt-1 flex min-h-[1rem] flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {hint && <span className="truncate">{hint}</span>}
        {fallbackLabel && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="cursor-help text-[10px]">
                  {fallbackLabel}
                </Badge>
              </TooltipTrigger>
              {fallbackTooltip && (
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {fallbackTooltip}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </Card>
  );
}
