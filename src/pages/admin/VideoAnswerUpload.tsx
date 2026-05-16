import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Video, Circle, Square, ArrowLeft, Loader2, Eye } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX_SIZE = 100 * 1024 * 1024;
const MAX_DURATION = 5 * 60;

async function captureThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.preload = "metadata";
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 4);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((b) => {
        URL.revokeObjectURL(url);
        resolve(b);
      }, "image/jpeg", 0.8);
    };
    video.onerror = () => resolve(null);
  });
}

function getDuration(file: File | Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.src = url;
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.round(v.duration || 0));
    };
    v.onerror = () => resolve(0);
  });
}

interface UploadedAnswer {
  id: string;
  video_url: string;
  duration_seconds: number | null;
}

export default function VideoAnswerUpload() {
  const { queryId } = useParams({ from: "/admin/upload-answer/$queryId" });
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"upload" | "record">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [language, setLanguage] = useState("English");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedAnswer | null>(null);

  const { data: query, isLoading } = useQuery({
    queryKey: ["query_detail", queryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("queries")
        .select("id, stock_name, stock_symbol, buy_price, current_price, query_text, query_type, ai_report")
        .eq("id", queryId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileSelect = async (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_SIZE) {
      toast.error("File too large — max 100MB");
      return;
    }
    if (!/video\/(mp4|quicktime|webm|x-matroska)/.test(f.type) && !/\.(mp4|mov|webm)$/i.test(f.name)) {
      toast.error("Use MP4, MOV, or WEBM");
      return;
    }
    const dur = await getDuration(f);
    if (dur > MAX_DURATION) {
      toast.error("Video must be under 5 minutes");
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !user) throw new Error("Missing file or session");
      setUploading(true);
      setProgress(5);

      const ts = Date.now();
      const ext = file.name.split(".").pop() || "mp4";
      const path = `${user.id}/${queryId}_${ts}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("expert-videos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      setProgress(70);

      let thumbUrl: string | null = null;
      const thumbBlob = await captureThumbnail(file);
      if (thumbBlob) {
        const thumbPath = `${user.id}/${queryId}_${ts}_thumb.jpg`;
        const { error: tErr } = await supabase.storage
          .from("expert-videos")
          .upload(thumbPath, thumbBlob, { contentType: "image/jpeg", upsert: true });
        if (!tErr) {
          const { data: thumbPub } = supabase.storage.from("expert-videos").getPublicUrl(thumbPath);
          thumbUrl = thumbPub.publicUrl;
        }
      }
      setProgress(85);

      const { data: pub } = supabase.storage.from("expert-videos").getPublicUrl(path);
      const duration = await getDuration(file);

      const { data: answer, error: ansErr } = await supabase
        .from("answers")
        .insert({
          query_id: queryId,
          expert_id: user.id,
          answer_type: "video",
          video_url: pub.publicUrl,
          video_thumbnail: thumbUrl,
          duration_seconds: duration,
          body: notes || null,
          is_published: false,
        })
        .select("id, video_url, duration_seconds")
        .single();
      if (ansErr) throw ansErr;
      setProgress(100);
      return answer as UploadedAnswer;
    },
    onSuccess: (data) => {
      setUploaded(data);
      setUploading(false);
      toast.success("Uploaded — review then publish");
    },
    onError: (e: Error) => {
      setUploading(false);
      setProgress(0);
      toast.error(e.message);
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!uploaded) throw new Error("No answer to publish");
      const { error: aErr } = await supabase
        .from("answers")
        .update({ is_published: true })
        .eq("id", uploaded.id);
      if (aErr) throw aErr;
      const { error: qErr } = await supabase
        .from("queries")
        .update({ status: "expert_answered" })
        .eq("id", queryId);
      if (qErr) throw qErr;
    },
    onSuccess: () => {
      toast.success("Answer published to user");
      qc.invalidateQueries({ queryKey: ["analyst_queue"] });
      navigate({ to: "/admin/dashboard" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminShell>
      <Link to="/admin/dashboard" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to queue
      </Link>

      {isLoading || !query ? (
        <Card className="p-6">Loading query…</Card>
      ) : (
        <Card className="p-5 mb-6 bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="font-display text-xl text-accent">{query.stock_name}</span>
            {query.stock_symbol && <Badge variant="outline" className="font-mono text-[10px]">{query.stock_symbol}</Badge>}
            {query.query_type && <Badge variant="secondary" className="text-[10px] capitalize">{query.query_type.replace(/_/g, " ")}</Badge>}
          </div>
          <p className="text-sm whitespace-pre-wrap text-foreground/85">{query.query_text}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-mono">
            {query.buy_price && <span>Buy <span className="text-foreground">₹{query.buy_price}</span></span>}
            {query.current_price && <span>Now <span className="text-foreground">₹{query.current_price}</span></span>}
            {(query.ai_report as { verdict?: string } | null)?.verdict && (
              <Badge className="bg-primary/10 text-primary border-primary/30">AI · {(query.ai_report as { verdict?: string }).verdict}</Badge>
            )}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-[1fr_280px] gap-6">
        <div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "upload" | "record")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1.5" /> Upload Video</TabsTrigger>
              <TabsTrigger value="record"><Video className="h-4 w-4 mr-1.5" /> Record in Browser</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-4">
              <Card className="p-5">
                <label
                  htmlFor="video-file"
                  className={cn(
                    "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-colors",
                    file ? "border-primary bg-primary/5" : "border-border hover:border-primary",
                  )}
                >
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="font-medium">{file ? file.name : "Drag &amp; drop or click to choose"}</p>
                  <p className="text-xs text-muted-foreground mt-1">MP4 / MOV / WEBM · max 100MB · max 5 min</p>
                  <input
                    id="video-file"
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  />
                </label>

                {previewUrl && (
                  <video src={previewUrl} controls className="mt-4 w-full rounded-lg bg-black aspect-video" />
                )}

                <div className="grid sm:grid-cols-2 gap-3 mt-4">
                  <div className="space-y-1.5">
                    <Label>Language</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="English">English</SelectItem>
                        <SelectItem value="Hindi">Hindi</SelectItem>
                        <SelectItem value="Both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5 mt-3">
                  <Label>Notes (optional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Short caption for the user" />
                </div>

                {uploading && (
                  <div className="mt-4">
                    <Progress value={progress} />
                    <p className="text-xs text-muted-foreground text-center mt-1">Uploading… {progress}%</p>
                  </div>
                )}

                {!uploaded ? (
                  <Button
                    className="mt-4 w-full bg-gradient-to-r from-primary to-accent text-primary-foreground"
                    disabled={!file || uploading}
                    onClick={() => upload.mutate()}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload Video"}
                  </Button>
                ) : (
                  <div className="mt-4 space-y-2">
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs">
                      <p className="font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> Preview how the user sees this</p>
                      <video src={uploaded.video_url} controls className="mt-2 w-full rounded bg-black aspect-video" />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-gradient-to-r from-primary to-accent text-primary-foreground"
                        onClick={() => publish.mutate()}
                        disabled={publish.isPending}
                      >
                        {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish to User"}
                      </Button>
                      <Button variant="outline" onClick={() => { setUploaded(null); setFile(null); setPreviewUrl(null); setProgress(0); }}>
                        Re-upload
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center">Or leave unpublished — it stays as a draft.</p>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="record" className="mt-4">
              <RecordTab onRecorded={(f) => { setFile(f); setPreviewUrl(URL.createObjectURL(f)); setTab("upload"); }} />
            </TabsContent>
          </Tabs>
        </div>

        <Card className="p-5 h-fit sticky top-6">
          <p className="font-display text-lg">Recording tips</p>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            <li>• Keep it under 5 minutes</li>
            <li>• Speak clearly, single take if possible</li>
            <li>• Give a clear verdict + reasoning</li>
            <li>• Mention price levels: SL, target</li>
            <li>• End with SEBI disclaimer</li>
          </ul>
          <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-[11px] text-amber-700 dark:text-amber-300">
            All content is your individual responsibility as a SEBI-registered analyst.
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

function RecordTab({ onRecorded }: { onRecorded: (f: File) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (recording) {
      timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [recording]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
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
      setRecording(true);
      setElapsed(0);
    } catch (e) {
      toast.error("Could not access camera/microphone");
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const useThis = () => {
    if (!blob) return;
    const f = new File([blob], `recording_${Date.now()}.webm`, { type: "video/webm" });
    onRecorded(f);
  };

  return (
    <Card className="p-5">
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
        {!recording && !blobUrl && (
          <Button onClick={start} className="bg-red-600 hover:bg-red-700">
            <Circle className="h-4 w-4 mr-1.5 fill-current" /> Start Recording
          </Button>
        )}
        {recording && (
          <Button onClick={stop} variant="outline">
            <Square className="h-4 w-4 mr-1.5" /> Stop
          </Button>
        )}
        {blobUrl && (
          <>
            <Button onClick={useThis} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">Use this recording</Button>
            <Button variant="ghost" onClick={() => { setBlob(null); setBlobUrl(null); }}>Re-record</Button>
          </>
        )}
      </div>
    </Card>
  );
}
