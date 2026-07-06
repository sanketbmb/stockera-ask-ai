// Stage 4F.2 APPLY-2 — YouTube iframe embed for UNLOCKED video answers only.
//
// Anti-leak invariants:
//   • Renders ONLY after the caller has an unlocked getVideoAnswer payload.
//   • Never receives a locked payload; parent must gate.
//   • youtube_video_id enters via prop, is embedded server-privately in the
//     iframe src, and never printed to the DOM as text.
import { useMemo } from "react";

interface Props {
  youtubeVideoId: string;
  title: string;
}

export function VideoAnswerEmbed({ youtubeVideoId, title }: Props) {
  const src = useMemo(() => {
    const q = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
    }).toString();
    return `https://www.youtube-nocookie.com/embed/${youtubeVideoId}?${q}`;
  }, [youtubeVideoId]);

  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-lg bg-black"
      data-testid="video-answer-embed"
    >
      <iframe
        src={src}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}

export default VideoAnswerEmbed;
