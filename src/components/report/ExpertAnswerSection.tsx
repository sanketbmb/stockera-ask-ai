import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, ShieldCheck, MapPin, Hourglass, AlertTriangle, Lock, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { VERDICT_MAP } from "@/lib/verdict";
import { ShareButton } from "@/components/common/ShareButton";

interface Props {
  queryId: string;
  assignedAnalystId: string | null;
  queryCreatedAt: string;
}

const SEBI_DISCLAIMER =
  "This is the personal educational analysis of a SEBI-registered Research Analyst. It is not a SEBI-registered research report and does not constitute investment advice. Consult your financial advisor before acting.";

type Analyst = { id: string; display_name: string; sebi_reg_number: string; sebi_type: string; avatar_url: string | null; years_experience: number; rating: number; specializations: string[] };

export function ExpertAnswerSection({ queryId, assignedAnalystId, queryCreatedAt }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["expert_answers", queryId],
    queryFn: async (): Promise<{ answers: Array<Record<string, unknown> & { answer_type: string; expert_id: string; created_at: string | null; body: string | null; verdict: string | null; key_level: string | null; time_horizon: string | null; risk_note: string | null; video_url: string | null; video_thumbnail: string | null; duration_seconds: number | null }>; analyst: Analyst | null; analystId: string | null }> => {
      const { data: answers } = await supabase
        .from("answers")
        .select("*")
        .eq("query_id", queryId)
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      const analystId =
        assignedAnalystId ??
        answers?.find((a) => a.answer_type === "text")?.expert_id ??
        answers?.find((a) => a.answer_type === "video")?.expert_id ??
        null;

      let analyst: Analyst | null = null;
      if (analystId) {
        const { data: a } = await supabase
          .from("analyst_profiles")
          .select("id, display_name, sebi_reg_number, sebi_type, avatar_url, years_experience, rating, specializations")
          .eq("id", analystId)
          .maybeSingle();
        analyst = (a as Analyst | null) ?? null;
      }
      return { answers: (answers ?? []) as never, analyst, analystId };
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl mt-6" id="expert-analysis">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const textAns = data?.answers.find((a) => a.answer_type === "text");
  const videoAns = data?.answers.find((a) => a.answer_type === "video");
  const analyst = data?.analyst;

  // Pending state
  if (!textAns && !videoAns) {
    const hoursSince = (Date.now() - new Date(queryCreatedAt).getTime()) / 3600000;
    const remaining = Math.max(0, 24 - hoursSince);
    return (
      <section id="expert-analysis" className="mx-auto max-w-4xl mt-6 print:hidden">
        <Card className="p-6 border-l-4 border-l-accent bg-accent/5 animate-pulse">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={analyst?.avatar_url ?? undefined} />
              <AvatarFallback>{(analyst?.display_name ?? "A").slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{analyst?.display_name ?? "Analyst being assigned"}</p>
              {analyst?.sebi_reg_number && (
                <p className="text-[11px] text-muted-foreground font-mono">SEBI {analyst.sebi_type} · {analyst.sebi_reg_number}</p>
              )}
            </div>
          </div>
          <p className="font-display text-xl">⏳ Expert analysis in progress</p>
          <p className="text-sm text-muted-foreground mt-1">
            A SEBI-registered analyst is reviewing your query. Expected within 24 hours of submission.
          </p>
          {remaining > 0 && (
            <p className="text-xs font-mono text-accent mt-3 flex items-center gap-1">
              <Clock className="h-3 w-3" /> ~{remaining.toFixed(1)}h remaining
            </p>
          )}
        </Card>
      </section>
    );
  }

  return (
    <section id="expert-analysis" className="mx-auto max-w-4xl mt-6 space-y-4 print:break-before-page">
      <h2 className="font-display text-2xl">Expert Analysis</h2>

      {textAns && (
        <Card className="p-6 border-l-4 border-l-accent">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <AnalystBlock analyst={analyst} analystId={data?.analystId ?? null} />
            <div className="flex items-center gap-2">
              <ShareButton queryId={queryId} stockName={undefined} compact />
              <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(textAns.created_at!), { addSuffix: true })}</span>
            </div>
          </div>

          {textAns.verdict && (
            <div className="mb-4">
              <span className={`inline-block px-4 py-1.5 rounded-md text-sm font-semibold border ${VERDICT_MAP[textAns.verdict]?.color ?? "bg-muted"}`}>
                {VERDICT_MAP[textAns.verdict]?.label ?? textAns.verdict}
              </span>
            </div>
          )}

          <p className="text-base leading-relaxed whitespace-pre-wrap">{textAns.body}</p>

          <div className="mt-4 grid sm:grid-cols-3 gap-2">
            {textAns.key_level && (
              <div className="rounded-md bg-muted/60 px-3 py-2 text-xs flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 mt-0.5 text-accent" />
                <div><span className="font-medium">Key Level:</span> {textAns.key_level}</div>
              </div>
            )}
            {textAns.time_horizon && (
              <div className="rounded-md bg-muted/60 px-3 py-2 text-xs flex items-start gap-2">
                <Hourglass className="h-3.5 w-3.5 mt-0.5 text-accent" />
                <div><span className="font-medium">Time Horizon:</span> {textAns.time_horizon}</div>
              </div>
            )}
            {textAns.risk_note && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-600" />
                <div><span className="font-medium">Risk Note:</span> {textAns.risk_note}</div>
              </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">Want a 1:1 with this analyst?</p>
            {data?.analystId && (
              <Link to="/analyst/$analystId" params={{ analystId: data.analystId }} className="text-xs font-medium text-accent hover:underline inline-flex items-center gap-1">
                View profile & book private session <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </Card>
      )}

      {videoAns?.video_url && (
        <Card className="p-6 border-l-4 border-l-primary" id="expert-video">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <AnalystBlock analyst={analyst} analystId={data?.analystId ?? null} videoLabel />
            <Badge variant="outline" className="text-[10px]">
              {videoAns.duration_seconds ? `${Math.floor(videoAns.duration_seconds / 60)}:${String(videoAns.duration_seconds % 60).padStart(2, "0")}` : "video"}
            </Badge>
          </div>
          <video
            src={videoAns.video_url}
            poster={videoAns.video_thumbnail ?? undefined}
            controls
            className="w-full rounded-lg bg-black aspect-video"
          />
          <p className="text-[11px] text-muted-foreground mt-2">
            {formatDistanceToNow(new Date(videoAns.created_at!), { addSuffix: true })}
          </p>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground italic px-2">{SEBI_DISCLAIMER}</p>
    </section>
  );
}
