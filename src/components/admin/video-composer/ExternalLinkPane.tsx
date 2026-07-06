// Stage 4G APPLY-2 — Paste external link pane. Detects YouTube.
import { Link as LinkIcon, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseYoutubeId } from "@/lib/youtube-id";

interface Props {
  value: string;
  onChange: (v: string) => void;
  category: "general" | "stock_specific";
}

export function ExternalLinkPane({ value, onChange, category }: Props) {
  const trimmed = value.trim();
  const ytId = trimmed ? parseYoutubeId(trimmed) : null;
  const isYouTube = !!ytId;
  const blockedByCategory = category === "stock_specific" && isYouTube;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="composer-external-url">External video URL</Label>
        <div className="relative">
          <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="composer-external-url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://youtube.com/watch?v=… or any hosted video link"
            className="pl-9"
          />
        </div>
      </div>
      {isYouTube && !blockedByCategory && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs flex gap-2 items-start">
          <div className="flex-1">
            <p className="font-medium">YouTube video detected · ID {ytId}</p>
            <p className="text-muted-foreground mt-0.5">General videos may link to YouTube.</p>
          </div>
          <img
            src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`}
            alt="thumbnail"
            className="w-24 aspect-video object-cover rounded"
          />
        </div>
      )}
      {blockedByCategory && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300 flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">YouTube links are not allowed for stock-specific videos.</p>
            <p className="mt-0.5">Switch category to <strong>General</strong>, or use Upload / Record instead.</p>
          </div>
        </div>
      )}
      {trimmed && !isYouTube && (
        <p className="text-[11px] text-muted-foreground">Non-YouTube link — will be stored as-is (draft only).</p>
      )}
    </div>
  );
}

export default ExternalLinkPane;
