// Stage 4F.3 APPLY-2 — YouTube URL input with derived ID + oEmbed prefill.
// Pure presentational: parent owns state and validation.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { parseYoutubeId } from "@/lib/youtube-id";
import { resolveYoutubeMetadata } from "@/lib/video-answers-admin.functions";

export interface ResolvedYoutubeMeta {
  youtubeVideoId: string;
  posterThumb: string;
  title: string | null;
  authorName: string | null;
}

interface Props {
  url: string;
  onUrlChange: (v: string) => void;
  onResolved: (meta: ResolvedYoutubeMeta) => void;
  disabled?: boolean;
}

export function VideoUrlInput({ url, onUrlChange, onResolved, disabled }: Props) {
  const resolve = useServerFn(resolveYoutubeMetadata);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ytId = parseYoutubeId(url);
  const parseError = url.trim() && !ytId ? "Not a valid YouTube URL" : null;

  async function handleResolve() {
    if (!ytId) return;
    setLoading(true);
    setError(null);
    try {
      const meta = await resolve({ data: { youtubeUrl: url.trim() } });
      onResolved({
        youtubeVideoId: meta.youtubeVideoId,
        posterThumb: meta.posterThumb,
        title: meta.title ?? null,
        authorName: meta.authorName ?? null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="yt-url">YouTube URL *</Label>
      <div className="flex gap-2">
        <Input
          id="yt-url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          disabled={disabled || loading}
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleResolve}
          disabled={!ytId || loading || disabled}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Prefill"}
        </Button>
      </div>
      {ytId && (
        <p className="text-xs text-muted-foreground font-mono">
          video_id: <span className="text-foreground">{ytId}</span>
        </p>
      )}
      {parseError && <p className="text-xs text-destructive">{parseError}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default VideoUrlInput;
