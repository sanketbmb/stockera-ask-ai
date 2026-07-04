import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PublicAnalyticsPayload } from "../types";

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
        {sentiment?.top_news_driver && sentiment.top_news_driver.trim().length > 0 && (
          <p className="text-muted-foreground">{sentiment.top_news_driver}</p>
        )}
        {sentiment?.top_articles && sentiment.top_articles.length > 0 && (
          <ul className="space-y-2 border-t border-border pt-2">
            {sentiment.top_articles.slice(0, 3).map((a, i) => (
              <li key={i} className="text-sm">
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                   className="text-foreground hover:underline line-clamp-2">
                  {a.title}
                </a>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {a.source} · {new Date(a.published_at).toLocaleDateString("en-IN")}
                  <span className={`ml-2 tabular-nums ${sentimentTone(a.sentiment)}`}>
                    {a.sentiment > 0 ? "+" : ""}{a.sentiment.toFixed(2)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
