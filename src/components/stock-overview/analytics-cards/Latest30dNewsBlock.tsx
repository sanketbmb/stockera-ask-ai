import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PublicAnalyticsPayload } from "../types";

// Stage 4D.1 B3 — compliance strip.
// The public sentiment payload no longer carries article titles, urls, or
// per-article sentiment scores. This card renders aggregate signal only,
// plus non-content attribution (publisher name + date) per article.

interface Props {
  sentiment: PublicAnalyticsPayload["sentiment_snapshot"];
}

function fmtScore(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function sentimentTone(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground";
  if (v > 0.2) return "text-emerald-500";
  if (v < -0.2) return "text-red-500";
  return "text-amber-500";
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN");
}

export function Latest30dNewsBlock({ sentiment }: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Latest 30d News Sentiment</CardTitle>
          {sentiment?.sentiment_label && (
            <Badge variant="secondary" className="capitalize">{sentiment.sentiment_label.toLowerCase()}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-baseline gap-4">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Score</div>
            <div className={`text-2xl font-semibold tabular-nums ${sentimentTone(sentiment?.news_sentiment_score)}`}>
              {fmtScore(sentiment?.news_sentiment_score)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Articles</div>
            <div className="text-2xl font-semibold tabular-nums text-foreground">{sentiment?.article_count ?? 0}</div>
          </div>
        </div>
        {sentiment?.top_articles && sentiment.top_articles.length > 0 && (
          <ul className="space-y-1 border-t border-border pt-2">
            {sentiment.top_articles.slice(0, 3).map((a, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {a.source || "Unknown source"}
                {a.published_at ? ` · ${fmtDate(a.published_at)}` : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-muted-foreground/70 pt-1">
          Article headlines and links are available only inside the full analyst report.
        </p>
      </CardContent>
    </Card>
  );
}
