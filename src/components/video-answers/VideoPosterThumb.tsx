// Stage 4F.2 APPLY-1 — poster thumb for locked video cards.
// Renders a plain <img>. Never an <iframe> or <video>. `poster_thumb` on
// i.ytimg.com is an accepted 4F.1 public artifact (see plan §D.5).
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  src: string | null | undefined;
  alt: string;
  durationSec?: number | null;
  className?: string;
}

function formatDuration(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoPosterThumb({ src, alt, durationSec, className }: Props) {
  const [failed, setFailed] = useState(false);
  const dur = formatDuration(durationSec);

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-md bg-muted",
        className,
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <span className="text-3xl">🎥</span>
        </div>
      )}
      {/* Lock glyph overlay — this card is always the locked view in APPLY-1 */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25"
        aria-hidden="true"
      >
        <span className="rounded-full bg-black/70 px-3 py-2 text-lg text-white">🔒</span>
      </div>
      {dur && (
        <span
          className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white"
          aria-label={`Duration ${dur}`}
        >
          {dur}
        </span>
      )}
    </div>
  );
}

export default VideoPosterThumb;
