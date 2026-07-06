import { parseYoutubeId } from "@/lib/youtube-id";

/**
 * Renders an official embed for providers that allow it (YouTube, Twitter).
 * For everything else, returns null — caller falls back to link-out card.
 * NEVER re-hosts source media.
 */
export function CuratedEmbed({
  provider,
  sourceUrl,
}: {
  provider: string;
  sourceUrl: string;
}) {
  if (provider === "youtube") {
    const id = parseYoutubeId(sourceUrl);
    if (!id) return null;
    return (
      <div className="relative w-full overflow-hidden rounded-lg border border-border" style={{ aspectRatio: "16/9" }}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 w-full h-full"
        />
      </div>
    );
  }
  if (provider === "twitter") {
    // Use Twitter's official blockquote embed. Their widgets.js is loaded lazily.
    return (
      <div className="rounded-lg border border-border p-3 bg-card">
        <blockquote className="twitter-tweet">
          <a href={sourceUrl}>{sourceUrl}</a>
        </blockquote>
        <TwitterWidgetsLoader />
      </div>
    );
  }
  return null;
}

function TwitterWidgetsLoader() {
  if (typeof window !== "undefined") {
    const existing = document.getElementById("twitter-wjs") as HTMLScriptElement | null;
    if (!existing) {
      const s = document.createElement("script");
      s.id = "twitter-wjs";
      s.async = true;
      s.src = "https://platform.twitter.com/widgets.js";
      document.head.appendChild(s);
    } else {
      // re-parse when navigating between curated items
      const w = (window as unknown as { twttr?: { widgets?: { load?: () => void } } }).twttr;
      w?.widgets?.load?.();
    }
  }
  return null;
}
