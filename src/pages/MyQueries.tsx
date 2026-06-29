import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Inbox, Play, Clock3, Video as VideoIcon, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { QueryHistoryCard, type QueryHistoryItem } from "@/components/query/QueryHistoryCard";
import { AnalystCtaCard } from "@/components/report/AnalystCtaCard";


const FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "ai_answered", label: "AI Answered" },
  { id: "expert_answered", label: "Expert Answered" },
  { id: "video", label: "Video Answer" },
];

type VideoAnswer = NonNullable<QueryHistoryItem["answers"]>[number];

interface ExtendedQueryItem extends QueryHistoryItem {
  video_requested?: boolean | null;
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MyQueriesPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");
  const [activeVideo, setActiveVideo] = useState<{ url: string; title: string; createdAt: string } | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["my-queries", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Single batched fetch — queries + their answers in 2 round-trips total.
      const { data: queries } = await supabase
        .from("queries")
        .select("id, stock_name, stock_symbol, query_type, query_text, status, ai_report, created_at, video_requested")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (!queries?.length) return [] as ExtendedQueryItem[];
      const ids = queries.map((q) => q.id);
      const { data: answers } = await supabase
        .from("answers")
        .select("id, query_id, answer_type, body, video_url, video_thumbnail, duration_seconds, created_at, expert_id, verdict, key_level, time_horizon, risk_note, is_published, report_url, report_filename, report_mime, report_size_bytes, report_label")
        .in("query_id", ids)
        .eq("is_published", true);
      const byQuery = new Map<string, VideoAnswer[]>();
      (answers ?? []).forEach((a) => {
        const list = byQuery.get(a.query_id) ?? [];
        list.push(a as VideoAnswer);
        byQuery.set(a.query_id, list);
      });
      return queries.map((q) => ({ ...q, answers: byQuery.get(q.id) ?? [] })) as ExtendedQueryItem[];
    },
  });

  // Derive per-query video state in memory — no N+1.
  const { readyVideos, pendingVideos } = useMemo(() => {
    const ready: Array<{ q: ExtendedQueryItem; video: VideoAnswer }> = [];
    const pending: ExtendedQueryItem[] = [];
    for (const q of data) {
      const v = q.answers?.find((a) => a.answer_type === "video" && a.video_url && a.is_published !== false);
      if (v) ready.push({ q, video: v });
      else if (q.video_requested) pending.push(q);
    }
    ready.sort((a, b) => +new Date(b.video.created_at) - +new Date(a.video.created_at));
    pending.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return { readyVideos: ready, pendingVideos: pending };
  }, [data]);

  const filtered = useMemo(() => {
    if (filter === "all") return data;
    if (filter === "video") return data; // handled by dedicated renderer below
    return data.filter((q) => q.status === filter);
  }, [data, filter]);

  const bottomQueryId = data[0]?.id ?? "general";

  return (
    <AppShell title="My Queries">
      <Tabs value={filter} onValueChange={setFilter} className="mb-6">
        <TabsList>
          {FILTERS.map((f) => <TabsTrigger key={f.id} value={f.id}>{f.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}</div>
      ) : filter === "video" ? (
        <VideoAnswerTab
          readyVideos={readyVideos}
          pendingVideos={pendingVideos}
          onPlay={(v, q) => setActiveVideo({ url: v.video_url!, title: q.stock_name, createdAt: v.created_at })}
          bottomQueryId={bottomQueryId}
        />
      ) : filtered.length === 0 ? (
        <EmptyQueries />
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <QueryHistoryCard key={q.id} item={q} />
          ))}

        </div>
      )}

      {/* Bottom premium-human-analysis module — always present (except on the
          Video Answer tab, which already terminates with its own CTA). */}
      {!isLoading && filter !== "video" && (
        <div className="mt-10">
          <BottomPremiumModule
            readyCount={readyVideos.length}
            pendingCount={pendingVideos.length}
            latest={readyVideos[0] ?? null}
            queryId={bottomQueryId}
            onPlay={(v, q) => setActiveVideo({ url: v.video_url!, title: q.stock_name, createdAt: v.created_at })}
            onSwitchToVideoTab={() => setFilter("video")}
          />
        </div>
      )}

      {activeVideo && (
        <Dialog open onOpenChange={(o) => !o && setActiveVideo(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Video Answer · {activeVideo.title}</DialogTitle>
            </DialogHeader>
            <video src={activeVideo.url} controls className="w-full rounded-lg bg-black aspect-video" />
            <p className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(activeVideo.createdAt), { addSuffix: true })} · SEBI-registered Research Analyst
            </p>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}

function EmptyQueries() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
      <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40" />
      <p className="font-display text-xl mt-3">No queries here yet</p>
      <p className="text-muted-foreground text-sm mt-1">Ask your first stock question and get instant AI analysis.</p>
      <Button asChild className="mt-4 bg-gradient-to-r from-primary to-accent text-primary-foreground">
        <Link to="/post-query">Ask your first question →</Link>
      </Button>
    </div>
  );
}

function VideoAnswerTab({
  readyVideos, pendingVideos, onPlay, bottomQueryId,
}: {
  readyVideos: Array<{ q: ExtendedQueryItem; video: VideoAnswer }>;
  pendingVideos: ExtendedQueryItem[];
  onPlay: (v: VideoAnswer, q: ExtendedQueryItem) => void;
  bottomQueryId: string;
}) {
  // STATE C — nothing ready and nothing pending → show upsell card.
  if (readyVideos.length === 0 && pendingVideos.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card/40 p-8 text-center max-w-2xl mx-auto">
          <VideoIcon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="font-display text-2xl font-semibold tracking-tight">No video answers yet</h3>
          <p className="text-muted-foreground text-sm mt-2 max-w-md mx-auto leading-relaxed">
            You haven’t requested any premium video answers yet. Get a SEBI-registered Research Analyst’s video view on your stock query, or Book a 1:1 Private Session.
          </p>
        </div>
        <AnalystCtaCard queryId={bottomQueryId} context="general" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {readyVideos.map(({ q, video }) => (
        <VideoReadyCard key={video.id} q={q} video={video} onPlay={() => onPlay(video, q)} />
      ))}
      {pendingVideos.map((q) => <VideoPendingCard key={q.id} q={q} />)}
    </div>
  );
}

function VideoReadyCard({ q, video, onPlay }: { q: ExtendedQueryItem; video: VideoAnswer; onPlay: () => void }) {
  const duration = formatDuration(video.duration_seconds);
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid sm:grid-cols-[200px_1fr] gap-0">
        <button
          onClick={onPlay}
          className="relative group aspect-video sm:aspect-auto sm:h-full bg-black/60 overflow-hidden"
          aria-label={`Play video answer for ${q.stock_name}`}
        >
          {video.video_thumbnail ? (
            <img src={video.video_thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/30 via-background to-accent/20" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
            <div className="h-12 w-12 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
              <Play className="h-5 w-5 text-black ml-0.5" />
            </div>
          </div>
          {duration && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-mono text-white">
              {duration}
            </span>
          )}
        </button>
        <div className="p-4 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-[11px]">
              {q.stock_name}{q.stock_symbol ? ` · ${q.stock_symbol}` : ""}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm text-foreground/80 line-clamp-2">{q.query_text}</p>
          <div className="mt-auto flex items-center justify-between gap-2 flex-wrap pt-2">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              SEBI-registered Research Analyst
            </span>
            <Button size="sm" onClick={onPlay} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
              <Play className="h-3.5 w-3.5 mr-1.5" /> Watch Video
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function VideoPendingCard({ q }: { q: ExtendedQueryItem }) {
  return (
    <Card className="p-5 border-amber-500/30 bg-amber-500/[0.04]">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <Badge variant="outline" className="font-mono text-[11px]">
          {q.stock_name}{q.stock_symbol ? ` · ${q.stock_symbol}` : ""}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          Requested {formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}
        </span>
      </div>
      <div className="mt-3 flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
          <Clock3 className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="font-display text-base">Your premium video answer is being prepared</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            A SEBI-registered analyst is reviewing this query. You'll be notified within 24 hours of publishing.
          </p>
        </div>
      </div>
    </Card>
  );
}

function BottomPremiumModule({
  readyCount, pendingCount, latest, queryId, onPlay, onSwitchToVideoTab,
}: {
  readyCount: number;
  pendingCount: number;
  latest: { q: ExtendedQueryItem; video: VideoAnswer } | null;
  queryId: string;
  onPlay: (v: VideoAnswer, q: ExtendedQueryItem) => void;
  onSwitchToVideoTab: () => void;
}) {
  // READY — show compact latest-video rail + lighter upsell
  if (readyCount > 0 && latest) {
    const duration = formatDuration(latest.video.duration_seconds);
    return (
      <div className="space-y-4">
        <Card className="overflow-hidden p-0 border-primary/20">
          <div className="grid sm:grid-cols-[180px_1fr] gap-0">
            <button
              onClick={() => onPlay(latest.video, latest.q)}
              className="relative group aspect-video sm:aspect-auto sm:h-full bg-black/60 overflow-hidden"
              aria-label="Play latest video answer"
            >
              {latest.video.video_thumbnail ? (
                <img src={latest.video.video_thumbnail} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-primary/30 via-background to-accent/20" />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                <div className="h-10 w-10 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
                  <Play className="h-4 w-4 text-black ml-0.5" />
                </div>
              </div>
              {duration && (
                <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-mono text-white">
                  {duration}
                </span>
              )}
            </button>
            <div className="p-4 flex flex-col gap-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Latest Video Answer
              </p>
              <p className="font-display text-lg leading-tight">
                {latest.q.stock_name}{latest.q.stock_symbol ? ` · ${latest.q.stock_symbol}` : ""}
              </p>
              <p className="text-sm text-muted-foreground line-clamp-2">{latest.q.query_text}</p>
              <div className="mt-auto pt-2">
                <Button size="sm" variant="outline" onClick={onSwitchToVideoTab}>
                  View all in Video Answer →
                </Button>
              </div>
            </div>
          </div>
        </Card>
        <AnalystCtaCard queryId={queryId} context="general" />
      </div>
    );
  }

  // PENDING — pending notice + secondary upsell
  if (pendingCount > 0) {
    return (
      <div className="space-y-4">
        <Card className="p-5 border-amber-500/30 bg-amber-500/[0.04] flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <Clock3 className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="font-display text-base">
              {pendingCount} premium video {pendingCount === 1 ? "answer is" : "answers are"} in review
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              SEBI-registered analysts are preparing your video{pendingCount === 1 ? "" : "s"}. Delivered within 24 hours.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onSwitchToVideoTab}>View status →</Button>
        </Card>
        <AnalystCtaCard queryId={queryId} context="general" />
      </div>
    );
  }

  // NONE — default upsell
  return <AnalystCtaCard queryId={queryId} context="general" />;
}
