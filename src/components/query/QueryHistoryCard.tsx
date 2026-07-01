import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AuthGatedReportLink } from "@/components/common/AuthGatedReportLink";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Play, ChevronRight, ChevronDown, Star, MapPin, Hourglass, AlertTriangle } from "lucide-react";
import { VERDICT_MAP } from "@/lib/verdict";
import { AnalystReportPill } from "@/components/report/AnalystReportPill";
import { useFollowUpsByQuery, type FollowUpRow } from "@/hooks/useFollowUpsByQuery";

interface AnswerRow {
  id: string;
  answer_type: string;
  body: string | null;
  video_url: string | null;
  video_thumbnail: string | null;
  duration_seconds: number | null;
  created_at: string;
  expert_id: string;
  verdict?: string | null;
  key_level?: string | null;
  time_horizon?: string | null;
  risk_note?: string | null;
  is_published?: boolean | null;
  report_url?: string | null;
  report_filename?: string | null;
  report_mime?: string | null;
  report_size_bytes?: number | null;
  report_label?: string | null;
}

export interface QueryHistoryItem {
  id: string;
  stock_name: string;
  stock_symbol: string | null;
  query_type: string | null;
  query_text: string;
  status: string;
  ai_report: unknown | null;
  created_at: string;
  answers?: AnswerRow[];
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  ai_answered: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  expert_answered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  in_review: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
};

export function QueryHistoryCard({ item }: { item: QueryHistoryItem }) {
  const [expanded, setExpanded] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const videoAnswer = item.answers?.find((a) => a.answer_type === "video" && a.video_url);
  const textAnswer = item.answers?.find((a) => a.answer_type === "text" && a.body);
  const reportAnswer = item.answers?.find((a) => a.report_url);
  const preview = item.query_text.length > 100 ? item.query_text.slice(0, 100) + "…" : item.query_text;
  const statusLabel = item.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="font-mono text-[11px]">{item.stock_name}{item.stock_symbol ? ` · ${item.stock_symbol}` : ""}</Badge>
          {item.query_type && <Badge variant="secondary" className="text-[11px] capitalize">{item.query_type.replace(/_/g, " ")}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[item.status] ?? ""}`}>{statusLabel}</Badge>
          <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
        </div>
      </div>

      <p className="mt-3 text-sm text-foreground/85">
        {expanded ? item.query_text : preview}
        {item.query_text.length > 100 && (
          <button onClick={() => setExpanded((e) => !e)} className="ml-1 text-primary text-xs hover:underline">
            {expanded ? "show less" : "read more"}
          </button>
        )}
      </p>

      {textAnswer && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-mono">Expert text answer</p>
            {textAnswer.verdict && (
              <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${VERDICT_MAP[textAnswer.verdict]?.color ?? "bg-muted"}`}>
                {VERDICT_MAP[textAnswer.verdict]?.label ?? textAnswer.verdict}
              </span>
            )}
          </div>
          <p className="text-sm whitespace-pre-wrap">{textAnswer.body}</p>
          {(textAnswer.key_level || textAnswer.time_horizon || textAnswer.risk_note) && (
            <div className="grid sm:grid-cols-3 gap-2 pt-1">
              {textAnswer.key_level && (
                <div className="rounded-md bg-background/60 px-2 py-1.5 text-[11px] flex items-start gap-1.5">
                  <MapPin className="h-3 w-3 mt-0.5 text-accent shrink-0" />
                  <div><span className="font-medium">Key:</span> {textAnswer.key_level}</div>
                </div>
              )}
              {textAnswer.time_horizon && (
                <div className="rounded-md bg-background/60 px-2 py-1.5 text-[11px] flex items-start gap-1.5">
                  <Hourglass className="h-3 w-3 mt-0.5 text-accent shrink-0" />
                  <div><span className="font-medium">Horizon:</span> {textAnswer.time_horizon}</div>
                </div>
              )}
              {textAnswer.risk_note && (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-1.5 text-[11px] flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 mt-0.5 text-amber-600 shrink-0" />
                  <div><span className="font-medium">Risk:</span> {textAnswer.risk_note}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {reportAnswer?.report_url && (
        <div className="mt-3">
          <AnalystReportPill
            reportUrl={reportAnswer.report_url}
            filename={reportAnswer.report_filename}
            mime={reportAnswer.report_mime}
            sizeBytes={reportAnswer.report_size_bytes}
            label={reportAnswer.report_label}
            compact
          />
        </div>
      )}



      <div className="mt-3 flex flex-wrap gap-2">
        {!textAnswer && !videoAnswer && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">⏳ Awaiting expert analysis</Badge>
        )}
        {textAnswer && (
          <Badge variant="outline" className="text-[10px] bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30">📄 Expert analysis ready</Badge>
        )}
        {videoAnswer && (
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">🎥 Expert video ready</Badge>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {item.ai_report ? (
          <Button asChild size="sm" variant="outline">
            <AuthGatedReportLink queryId={item.id}>View AI Report <ChevronRight className="h-3.5 w-3.5 ml-1" /></AuthGatedReportLink>
          </Button>
        ) : null}
        {textAnswer && (
          <Button asChild size="sm" variant="outline">
            <AuthGatedReportLink queryId={item.id} hash="expert-analysis">
              Read Answer <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </AuthGatedReportLink>
          </Button>
        )}
        {videoAnswer && (
          <Button size="sm" onClick={() => setVideoOpen(true)} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
            <Play className="h-3.5 w-3.5 mr-1.5" /> Watch Video
          </Button>
        )}
      </div>

      <FollowUpsDisclosure queryId={item.id} />



      {videoAnswer && (
        <VideoAnswerModal
          open={videoOpen}
          onOpenChange={setVideoOpen}
          videoUrl={videoAnswer.video_url!}
          createdAt={videoAnswer.created_at}
          stockName={item.stock_name}
        />
      )}
    </Card>
  );
}

function FollowUpsDisclosure({ queryId }: { queryId: string }) {
  const [expanded, setExpanded] = useState(false);
  const reduced = useReducedMotion();
  const { data, count, isLoading } = useFollowUpsByQuery(queryId, { enabled: true });

  const label = isLoading
    ? "Loading follow-ups…"
    : count === 0
      ? "No follow-ups yet"
      : `${count} follow-up question${count === 1 ? "" : "s"}`;

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className={`w-full flex items-center gap-1.5 text-left text-xs font-medium hover:text-foreground transition-colors ${count === 0 ? "text-muted-foreground" : "text-foreground/80"}`}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
        <span>{label}</span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={reduced ? { height: "auto", opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduced ? { height: 0, opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-md bg-muted/30 p-3">
              {count === 0 ? (
                <p className="text-xs italic text-muted-foreground text-center py-4">
                  No follow-up questions yet.{" "}
                  <Link
                    to="/report/$queryId"
                    params={{ queryId }}
                    search={{ focus: "followup" }}
                    className="not-italic text-primary hover:underline font-medium"
                  >
                    Ask one now
                  </Link>
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {data.map((f: FollowUpRow) => {
                    const isUser = f.role === "user";
                    const nested = f.parent_followup_id != null;
                    return (
                      <li
                        key={f.id}
                        className={`text-xs ${nested ? "pl-4 border-l border-border/40" : ""}`}
                      >
                        <div className="flex items-start gap-1.5">
                          <span className="font-mono text-[10px] uppercase text-muted-foreground mt-0.5 shrink-0">
                            {isUser ? "Q:" : "A:"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`whitespace-pre-wrap leading-relaxed ${isUser ? "font-medium text-foreground" : "text-muted-foreground"}`}
                            >
                              {f.content ?? ""}
                            </p>
                            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                              {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


function VideoAnswerModal({ open, onOpenChange, videoUrl, createdAt, stockName }: { open: boolean; onOpenChange: (v: boolean) => void; videoUrl: string; createdAt: string; stockName: string }) {
  const [rating, setRating] = useState(0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Expert Answer · {stockName}</DialogTitle>
        </DialogHeader>
        <video src={videoUrl} controls className="w-full rounded-lg bg-black aspect-video" />
        <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
          <div>
            <p className="text-sm font-medium">SEBI-registered Research Analyst</p>
            <p className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(createdAt), { addSuffix: true })}</p>
          </div>
          <Badge variant="outline" className="text-[10px]">SEBI Verified</Badge>
        </div>
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground mb-2">Was this helpful?</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} className="p-1">
                <Star className={`h-5 w-5 ${n <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
