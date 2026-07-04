import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number | null | undefined;
  hint?: string;
  className?: string;
}

export function StatCard({ label, value, hint, className }: Props) {
  const display =
    value === null || value === undefined || value === "" || Number.isNaN(value as number)
      ? "—"
      : typeof value === "number"
      ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)
      : String(value);
  return (
    <Card className={cn("p-4", className)}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl text-foreground">{display}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
