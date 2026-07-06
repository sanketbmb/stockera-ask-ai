// Stage 4G APPLY-2 — Browser recording pane. Records via MediaRecorder and
// uploads the resulting WEBM to `paid-videos` bucket. Draft only.
import { useEffect, useRef, useState } from "react";
import { Circle, Square, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { UploadResult } from "./FileUploadPane";

interface Props {
  userId: string;
  onUploaded: (r: UploadResult) => void;
  uploaded: UploadResult | null;
}

async function captureThumb(blob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.preload = "metadata";
    video.onloadeddata = () => { video.currentTime = Math.min(0.5, (video.duration || 1) / 4); };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((b) => { URL.revokeObjectURL(url); resolve(b); }, "image/jpeg", 0.8);
    };
    video.onerror = () => resolve(null);
  });
}

export function RecordPane({ userId, onUploaded, uploaded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    if (recording) t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => { if (t) clearInterval(t); };
  }, [recording]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const b = new Blob(chunksRef.current, { type: "video/webm" });
        setBlob(b);
        setBlobUrl(URL.createObjectURL(b));
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true); setElapsed(0);
    } catch {
      toast.error("Could not access camera/microphone");
    }
  }
  function stop() { recorderRef.current?.stop(); setRecording(false); }

  async function upload() {
    if (!blob) return;
    setUploading(true);
    try {
      const ts = Date.now();
      const path = `${userId}/composer/${ts}_rec.webm`;
      const { error } = await supabase.storage
        .from("paid-videos")
        .upload(path, blob, { contentType: "video/webm", upsert: false });
      if (error) throw error;
      let thumbPath: string | null = null;
      const thumb = await captureThumb(blob);
      if (thumb) {
        const tp = `${userId}/composer/${ts}_rec_thumb.jpg`;
        const { error: tErr } = await supabase.storage
          .from("video-thumbnails")
          .upload(tp, thumb, { contentType: "image/jpeg", upsert: true });
        if (!tErr) thumbPath = tp;
      }
      onUploaded({ storagePath: path, thumbnailStoragePath: thumbPath, durationSec: elapsed || null, previewUrl: blobUrl! });
      toast.success("Recording uploaded — draft ready to save");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="aspect-video rounded-lg bg-black overflow-hidden relative">
        {blobUrl ? (
          <video src={blobUrl} controls className="w-full h-full" />
        ) : (
          <video ref={videoRef} muted className="w-full h-full object-cover" />
        )}
        {recording && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-mono">
            <Circle className="h-3 w-3 fill-current animate-pulse" /> REC {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        {!recording && !blob && (
          <Button onClick={start}><Circle className="h-4 w-4 mr-1.5" /> Start recording</Button>
        )}
        {recording && (
          <Button onClick={stop} variant="destructive"><Square className="h-4 w-4 mr-1.5" /> Stop</Button>
        )}
        {blob && !uploaded && (
          <>
            <Button onClick={upload} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
              Use this recording
            </Button>
            <Button variant="outline" onClick={() => { setBlob(null); if (blobUrl) URL.revokeObjectURL(blobUrl); setBlobUrl(null); }}>
              Redo
            </Button>
          </>
        )}
        {uploaded && <p className="text-xs text-emerald-600">Recording attached ✓</p>}
      </div>
    </div>
  );
}

export default RecordPane;
