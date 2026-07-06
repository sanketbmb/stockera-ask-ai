// Stage 4G APPLY-2 — Category picker (general vs stock_specific).
import { Globe, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export type Category = "general" | "stock_specific";

interface Props {
  value: Category;
  onChange: (v: Category) => void;
  disabled?: boolean;
}

const OPTIONS: Array<{ id: Category; title: string; desc: string; Icon: typeof Globe }> = [
  { id: "general", title: "General", desc: "Educational, market view, sector — no stock, no price.", Icon: Globe },
  { id: "stock_specific", title: "Stock-specific", desc: "Tied to a stock. Requires stock + unlock price.", Icon: TrendingUp },
];

export function CategoryPicker({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-2">
      <Label>Category *</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {OPTIONS.map((o) => {
          const selected = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o.id)}
              className={cn(
                "text-left rounded-lg border p-3 transition-colors",
                selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                disabled && "opacity-60 cursor-not-allowed",
              )}
            >
              <div className="flex items-center gap-2">
                <o.Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-muted-foreground")} />
                <span className="font-medium text-sm">{o.title}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{o.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CategoryPicker;
