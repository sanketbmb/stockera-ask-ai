import { Card } from "@/components/ui/card";

export type OgPreview = {
  ok: boolean;
  provider: string;
  suggested_embed_kind: "embed" | "link_out";
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
};

export function OgScrapePreview({ preview }: { preview: OgPreview | null }) {
  if (!preview) return null;
  return (
    <Card className="p-3 border-dashed">
      <div className="flex gap-3">
        {preview.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.image_url}
            alt=""
            className="w-24 h-24 object-cover rounded border border-border"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-24 h-24 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">no image</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {preview.provider} · suggests {preview.suggested_embed_kind}
          </p>
          <p className="font-display text-sm mt-0.5 truncate">{preview.title ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{preview.description ?? "—"}</p>
          {preview.site_name ? (
            <p className="text-[11px] text-muted-foreground mt-1">via {preview.site_name}</p>
          ) : null}
          {!preview.ok ? (
            <p className="text-[11px] text-amber-600 mt-1">
              Could not fetch page — check the URL or fill fields manually.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
