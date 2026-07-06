// Stage 4F.3 APPLY-2 — create / edit form for video answers.
// Uses only approved server fns; NEVER touches unlock or entitlement paths.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save, Send, EyeOff, Eye } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  createVideoAnswerDraft,
  updateVideoAnswer,
  publishVideoAnswer,
  unpublishVideoAnswer,
} from "@/lib/video-answers-admin.functions";
import { VideoUrlInput, type ResolvedYoutubeMeta } from "@/components/admin/video-answers/VideoUrlInput";
import { SymbolPicker, type SymbolPick } from "@/components/admin/video-answers/SymbolPicker";
import { AnalystSelector } from "@/components/admin/video-answers/AnalystSelector";
import { QuerySelector, type QueryChoice } from "@/components/admin/video-answers/QuerySelector";
import { parseYoutubeId } from "@/lib/youtube-id";

const VERDICTS = ["BUY", "HOLD", "SELL", "WATCHLIST", "AVOID"] as const;

interface EditorProps {
  mode: "new" | "edit";
  answerId?: string;
}

export default function VideoAnswerEditor({ mode, answerId }: EditorProps) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  // Form state
  const [url, setUrl] = useState("");
  const [meta, setMeta] = useState<ResolvedYoutubeMeta | null>(null);
  const [symbol, setSymbol] = useState<SymbolPick | null>(null);
  const [expertId, setExpertId] = useState<string | null>(null);
  const [queryChoice, setQueryChoice] = useState<QueryChoice | null>(null);
  const [questionOverride, setQuestionOverride] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDescription, setVideoDescription] = useState("");
  const [verdict, setVerdict] = useState<string>("");
  const [price, setPrice] = useState<number>(499);
  const [durationSec, setDurationSec] = useState<number | "">("");
  const [busy, setBusy] = useState<null | "save" | "publish" | "unpublish">(null);

  const create = useServerFn(createVideoAnswerDraft);
  const update = useServerFn(updateVideoAnswer);
  const publish = useServerFn(publishVideoAnswer);
  const unpublish = useServerFn(unpublishVideoAnswer);

  // Load existing answer for edit mode
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ["admin_video_answer_edit", answerId],
    enabled: mode === "edit" && !!answerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("answers")
        .select(
          "id, expert_id, query_id, is_published, youtube_video_id, video_title, video_description, question_addressed_override, verdict, unlock_price_credits, video_duration_sec, queries:query_id(stock_symbol, stock_name, query_text)"
        )
        .eq("id", answerId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!existing) return;
    const q = (existing as unknown as { queries?: { stock_symbol?: string; stock_name?: string } }).queries;
    setUrl(existing.youtube_video_id ? `https://www.youtube.com/watch?v=${existing.youtube_video_id}` : "");
    setMeta(
      existing.youtube_video_id
        ? {
            youtubeVideoId: existing.youtube_video_id,
            posterThumb: `https://i.ytimg.com/vi/${existing.youtube_video_id}/hqdefault.jpg`,
            title: existing.video_title ?? null,
            authorName: null,
          }
        : null,
    );
    if (q?.stock_symbol) setSymbol({ symbol: q.stock_symbol, name: q.stock_name ?? q.stock_symbol });
    setExpertId(existing.expert_id ?? null);
    setQueryChoice(existing.query_id ? { mode: "existing", queryId: existing.query_id } : null);
    setQuestionOverride(existing.question_addressed_override ?? "");
    setVideoTitle(existing.video_title ?? "");
    setVideoDescription(existing.video_description ?? "");
    setVerdict(existing.verdict ?? "");
    setPrice(existing.unlock_price_credits ?? 499);
    setDurationSec(existing.video_duration_sec ?? "");
  }, [existing]);

  // Analyst self-lock: analysts can only pick self
  const lockedTo = useMemo(() => (isAdmin ? null : user?.id ?? null), [isAdmin, user]);
  useEffect(() => {
    if (lockedTo && !expertId) setExpertId(lockedTo);
  }, [lockedTo, expertId]);

  const ytId = parseYoutubeId(url);
  const canSave =
    mode === "edit"
      ? !!answerId
      : !!ytId &&
        !!expertId &&
        !!queryChoice &&
        !!symbol &&
        (queryChoice.mode === "existing"
          ? queryChoice.queryId.length > 0
          : queryChoice.questionText.trim().length >= 10);

  async function handleSave() {
    setBusy("save");
    try {
      if (mode === "new") {
        if (!ytId || !expertId || !queryChoice || !symbol) throw new Error("Missing required fields");
        const res = await create({
          data: {
            youtubeUrl: url.trim(),
            expertId,
            queryId: queryChoice.mode === "existing" ? queryChoice.queryId : undefined,
            syntheticQuery:
              queryChoice.mode === "synthetic"
                ? {
                    symbol: symbol.symbol,
                    stockName: symbol.name,
                    questionText: queryChoice.questionText.trim(),
                  }
                : undefined,
            priceCredits: price,
            verdict: verdict || undefined,
            videoTitle: videoTitle.trim() || undefined,
            videoDescription: videoDescription.trim() || undefined,
            questionAddressedOverride: questionOverride.trim() || undefined,
            videoDurationSec: durationSec === "" ? undefined : Number(durationSec),
          },
        });
        toast.success("Draft saved");
        navigate({ to: "/admin/videos/$answerId/edit" as never, params: { answerId: res.answerId } as never });
      } else {
        await update({
          data: {
            answerId: answerId!,
            patch: {
              youtubeUrl: url.trim(),
              verdict: verdict || undefined,
              videoTitle: videoTitle.trim() || undefined,
              videoDescription: videoDescription.trim() || undefined,
              questionAddressedOverride: questionOverride.trim() || undefined,
              priceCredits: price,
              videoDurationSec: durationSec === "" ? undefined : Number(durationSec),
            },
          },
        });
        toast.success("Saved");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handlePublish() {
    if (!answerId) return;
    setBusy("publish");
    try {
      await publish({ data: { answerId } });
      toast.success("Published");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function handleUnpublish() {
    if (!answerId) return;
    setBusy("unpublish");
    try {
      await unpublish({ data: { answerId } });
      toast.success("Unpublished");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (mode === "edit" && loadingExisting) {
    return (
      <AdminShell>
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading answer…
        </div>
      </AdminShell>
    );
  }

  const published = !!existing?.is_published;

  return (
    <AdminShell>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
            {mode === "new" ? "Create video answer" : "Edit video answer"}
          </p>
          <h1 className="font-display text-3xl">
            {videoTitle || "Analyst video"}
          </h1>
          {mode === "edit" && (
            <div className="mt-1 flex gap-2 items-center">
              <Badge variant={published ? "default" : "secondary"}>{published ? "Published" : "Draft"}</Badge>
              {answerId && (
                <Button asChild size="sm" variant="ghost">
                  <a href={`/admin/videos/${answerId}/preview`}><Eye className="h-3.5 w-3.5 mr-1" />Preview</a>
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!canSave || busy !== null}>
            {busy === "save" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save {mode === "new" ? "draft" : ""}
          </Button>
          {mode === "edit" && isAdmin && !published && (
            <Button onClick={handlePublish} disabled={busy !== null} variant="default">
              {busy === "publish" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Publish
            </Button>
          )}
          {mode === "edit" && published && (
            <Button onClick={handleUnpublish} disabled={busy !== null} variant="destructive">
              {busy === "unpublish" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <EyeOff className="h-4 w-4 mr-1" />}
              Unpublish
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 space-y-4">
          <h2 className="font-semibold">Source</h2>
          <VideoUrlInput
            url={url}
            onUrlChange={setUrl}
            onResolved={(m) => {
              setMeta(m);
              if (!videoTitle && m.title) setVideoTitle(m.title);
            }}
            disabled={published && !isAdmin}
          />
          {meta?.posterThumb && (
            <div className="rounded-md overflow-hidden bg-muted">
              <img src={meta.posterThumb} alt="poster" className="w-full aspect-video object-cover" />
            </div>
          )}
          {published && !isAdmin && (
            <p className="text-[11px] text-amber-600">
              Analysts cannot replace the YouTube link on a published row. Ask an admin.
            </p>
          )}
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-semibold">Attribution</h2>
          <SymbolPicker value={symbol} onChange={setSymbol} disabled={mode === "edit"} />
          <AnalystSelector value={expertId} onChange={setExpertId} lockedTo={lockedTo} disabled={mode === "edit"} />
        </Card>

        <Card className="p-5 space-y-4 lg:col-span-2">
          <h2 className="font-semibold">Question</h2>
          {mode === "new" && (
            <QuerySelector
              symbol={symbol?.symbol ?? null}
              value={queryChoice}
              onChange={setQueryChoice}
            />
          )}
          <div className="space-y-2">
            <Label htmlFor="q-override">Clean rephrasing (question_addressed_override)</Label>
            <Textarea
              id="q-override"
              value={questionOverride}
              onChange={(e) => setQuestionOverride(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Optional — overrides the underlying query text on the user-facing card."
            />
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-semibold">Presentation</h2>
          <div className="space-y-2">
            <Label htmlFor="v-title">Video title (caption)</Label>
            <Input id="v-title" value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} maxLength={140} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-desc">Teaser description *</Label>
            <Textarea
              id="v-desc"
              value={videoDescription}
              onChange={(e) => setVideoDescription(e.target.value)}
              rows={4}
              maxLength={400}
              placeholder="40–400 chars. Shown pre-unlock."
            />
            <p className="text-[11px] text-muted-foreground">{videoDescription.length}/400 — min 40 to publish.</p>
          </div>
          <div className="space-y-2">
            <Label>Verdict</Label>
            <Select value={verdict || undefined} onValueChange={setVerdict}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                {VERDICTS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-semibold">Unlock</h2>
          <div className="space-y-2">
            <Label htmlFor="price">Unlock price (credits) *</Label>
            <Input id="price" type="number" min={49} max={999} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
            <p className="text-[11px] text-muted-foreground">Between 49 and 999.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dur">Duration (seconds)</Label>
            <Input
              id="dur"
              type="number"
              min={1}
              max={60 * 60 * 4}
              value={durationSec === "" ? "" : durationSec}
              onChange={(e) => setDurationSec(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="e.g. 420 = 7 minutes"
            />
            <p className="text-[11px] text-muted-foreground">Required to publish.</p>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
