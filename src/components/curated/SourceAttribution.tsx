import { ExternalLink } from "lucide-react";

export function SourceAttribution({
  provider,
  sourceUrl,
  siteName,
}: {
  provider: string;
  sourceUrl: string;
  siteName?: string | null;
}) {
  let host = provider;
  try { host = new URL(sourceUrl).host.replace(/^www\./, ""); } catch { /* keep provider */ }
  return (
    <p className="text-xs text-muted-foreground">
      Source:{" "}
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex items-center gap-1 underline hover:text-foreground"
      >
        {siteName ?? host} <ExternalLink className="h-3 w-3" />
      </a>
      {" "}· Content belongs to its original publisher. Stockera does not re-host third-party media.
    </p>
  );
}
