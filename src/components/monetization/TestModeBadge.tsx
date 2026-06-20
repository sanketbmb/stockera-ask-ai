import { Badge } from "@/components/ui/badge";

export function TestModeBadge() {
  return (
    <Badge
      variant="outline"
      className="font-mono text-[9px] uppercase tracking-wider border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/5"
    >
      Demo mode · Razorpay disabled
    </Badge>
  );
}
