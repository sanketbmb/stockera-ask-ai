// Stage 4G APPLY-2 — Queue/list search bar shared by AdminDashboard and VideoAnswersList.
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  value: string;
  onChange: (v: string) => void;
  resultCount: number;
  totalCount?: number;
  placeholder?: string;
  label?: string;
}

export function QueueSearchBar({ value, onChange, resultCount, totalCount, placeholder, label }: Props) {
  return (
    <div className="mb-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Search by stock symbol, stock name, or query text…"}
          className="pl-9 pr-24"
          aria-label={label ?? "Search"}
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-2"
            onClick={() => onChange("")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs font-mono text-muted-foreground" aria-live="polite">
        {resultCount} matching {resultCount === 1 ? "query" : "queries"}
        {typeof totalCount === "number" && totalCount !== resultCount ? ` · of ${totalCount} total` : ""}
      </p>
    </div>
  );
}

export default QueueSearchBar;
