// Stage 4G APPLY-2 — Thumbnail field. For draft flow shows the auto-captured
// thumbnail preview (from upload/record) or the YouTube poster (external),
// and allows optional custom-image upload to the `video-thumbnails` bucket.
import { useState } from "react";
import { ImageIcon, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  userId: string;
  autoPreviewUrl: string | null;   // signed URL, poster URL, or blob preview
  customPath: string | null;
  onCustomChange: (path: string | null) => void;
}

export function ThumbnailField({ userId, autoPreviewUrl, customPath, onCustomChange }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleFile(f: File | null) {
    if (!f) return;
    if (!/image\/(jpeg|png|webp)/.test(f.type)) return toast.error("PNG / JPG / WEBP only");
    if (f.size > 4 * 1024 * 1024) return toast.error("Max 4 MB");
    setBusy(true);
    try {
      const ts = Date.now();
      const ext = f.name.split(".").pop() || "jpg";
      const path = `${userId}/composer/custom_${ts}.${ext}`;
      const { error } = await supabase.storage
        .from("video-thumbnails")
        .upload(path, f, { contentType: f.type, upsert: false });
      if (error) throw error;
      onCustomChange(path);
      toast.success("Custom thumbnail uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label>Thumbnail</Label>
      <div className="flex gap-3 items-start">
        <div className="w-40 aspect-video rounded bg-muted flex items-center justify-center overflow-hidden shrink-0 border">
          {autoPreviewUrl ? (
            <img src={autoPreviewUrl} alt="thumbnail" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="text-xs text-muted-foreground flex-1">
          <p>Auto-captured from the video (default). You can upload a custom image.</p>
          <label
            htmlFor="composer-thumb"
            className="inline-flex items-center gap-1 mt-2 cursor-pointer text-primary hover:underline"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {customPath ? "Replace custom image" : "Upload custom image"}
          </label>
          <input
            id="composer-thumb"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          {customPath && (
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-[10px] truncate max-w-[160px]" title={customPath}>{customPath}</span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => onCustomChange(null)}>
                Clear
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ThumbnailField;
