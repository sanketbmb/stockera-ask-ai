import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import type { StockOverview } from "./types";

interface Props { data: StockOverview }

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function NewsTab({ data }: Props) {
  const news = data.news ?? [];
  if (news.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No recent news for {data.symbol}. Check back later.
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {news.map((n, i) => (
        <Card key={i} className="p-4 hover:bg-muted/40 transition-colors">
          <a
            href={n.url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground line-clamp-2">{n.title ?? "Untitled"}</div>
              {n.snippet && (
                <div className="mt-1 text-sm text-muted-foreground line-clamp-2">{n.snippet}</div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">
                {n.source ?? "Unknown source"}
                {n.published_at ? ` · ${timeAgo(n.published_at)}` : ""}
              </div>
            </div>
            <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
          </a>
        </Card>
      ))}
    </div>
  );
}
