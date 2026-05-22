import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, ShieldCheck, MapPin, Hourglass, AlertTriangle, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { VERDICT_MAP } from "@/lib/verdict";

interface Props {
  queryId: string;
  assignedAnalystId: string | null;
  queryCreatedAt: string;
}

const SEBI_DISCLAIMER =
  "This is the personal educational analysis of a SEBI-registered Research Analyst. It is not a SEBI-registered research report and does not constitute investment advice. Consult your financial advisor before acting.";

export function ExpertAnswerSection({ queryId, assignedAnalystId, queryCreatedAt }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["expert_answers", queryId],
    queryFn: async () => {
      const [{ data: answers }, analystRes] = await Promise.all([
        supabase
          .from("answers")
          .select("*")
          .eq("query_id", queryId)
          .eq("is_published", true)
          .order("created_at", { ascending: false }),
        assignedAnalystId
          ? supabase.from("analyst_profiles").select("id, display_name, sebi_reg_number, sebi_type, avatar_url").eq("id", assignedAnalystId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return { answers: answers ?? [], analyst: analystRes.data };
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
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={analyst?.avatar_url ?? undefined} />
                <AvatarFallback>{(analyst?.display_name ?? "A").slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{analyst?.display_name ?? "SEBI Analyst"}</p>
                <p className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> SEBI {analyst?.sebi_type ?? "RA"} · {analyst?.sebi_reg_number ?? "—"}
                </p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(textAns.created_at!), { addSuffix: true })}</span>
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
            )}
          </div>
        </Card>
      )}

      {videoAns?.video_url && (
        <Card className="p-6 border-l-4 border-l-primary" id="expert-video">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={analyst?.avatar_url ?? undefined} />
                <AvatarFallback>{(analyst?.display_name ?? "A").slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium flex items-center gap-1.5"><Lock className="h-3 w-3" /> Personal video analysis by {analyst?.display_name ?? "your analyst"}</p>
                <p className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> SEBI {analyst?.sebi_type ?? "RA"} · {analyst?.sebi_reg_number ?? "—"}
                </p>
              </div>
            </div>
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
