// Stage 4G APPLY-2 — File upload pane. Uploads directly to `paid-videos` bucket
// under `{userId}/composer/{ts}.{ext}`. Draft only — no publish path.
import { useEffect, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const MAX_SIZE = 500 * 1024 * 1024; // 500 MB draft ceiling
const MAX_DURATION = 30 * 60;

export interface UploadResult {
  storagePath: string;
  thumbnailStoragePath: string | null;
  durationSec: number | null;
  previewUrl: string;
}

interface Props {
  userId: string;
  onUploaded: (r: UploadResult) => void;
  uploaded: UploadResult | null;
}

function getDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.src = url;
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Math.round(v.duration || 0)); };
    v.onerror = () => resolve(0);
  });
}

async function captureThumb(file: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.preload = "metadata";
    video.onloadeddata = () => { video.currentTime = Math.min(0.5, (video.duration || 1) / 4); };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((b) => { URL.revokeObjectURL(url); resolve(b); }, "image/jpeg", 0.8);
    };
    video.onerror = () => resolve(null);
  });
}

export function FileUploadPane({ userId, onUploaded, uploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(uploaded?.previewUrl ?? null);

  useEffect(() => () => { if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  async function handleFile(file: File | null) {
    if (!file) return;
    if (file.size > MAX_SIZE) return toast.error("File too large — max 500MB");
    if (!/video\//.test(file.type) && !/\.(mp4|mov|webm|mkv)$/i.test(file.name)) {
      return toast.error("Use MP4 / MOV / WEBM / MKV");
    }
    const dur = await getDuration(file);
    if (dur > MAX_DURATION) return toast.error("Video must be under 30 minutes");

    setBusy(true);
    setProgress(10);
    try {
      const ts = Date.now();
      const ext = file.name.split(".").pop() || "mp4";
      const storagePath = `${userId}/composer/${ts}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("paid-videos")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      setProgress(70);

      let thumbPath: string | null = null;
      const thumb = await captureThumb(file);
      if (thumb) {
        const tp = `${userId}/composer/${ts}_thumb.jpg`;
        const { error: tErr } = await supabase.storage
          .from("video-thumbnails")
          .upload(tp, thumb, { contentType: "image/jpeg", upsert: true });
        if (!tErr) thumbPath = tp;
      }
      setProgress(100);
      const blobUrl = URL.createObjectURL(file);
      setPreview(blobUrl);
      onUploaded({ storagePath, thumbnailStoragePath: thumbPath, durationSec: dur, previewUrl: blobUrl });
      toast.success("Uploaded — draft ready to save");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label
        htmlFor="composer-file"
        className={cn(
          "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-colors",
          uploaded ? "border-primary bg-primary/5" : "border-border hover:border-primary",
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="font-medium">{uploaded ? "Uploaded ✓ — choose another to replace" : "Click or drop a video file"}</p>
        <p className="text-xs text-muted-foreground mt-1">MP4 / MOV / WEBM · max 500MB · max 30 min</p>
        <input
          id="composer-file"
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
      </label>
      {busy && (
        <div className="mt-3">
          <Progress value={progress} />
          <p className="text-xs text-muted-foreground text-center mt-1 flex items-center justify-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Uploading… {progress}%
          </p>
        </div>
      )}
      {preview && !busy && (
        <video src={preview} controls className="mt-4 w-full rounded-lg bg-black aspect-video" />
      )}
    </div>
  );
}

export default FileUploadPane;
