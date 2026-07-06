// Stage 4F.3 APPLY-2 — inert preview of what a locked user would see.
// NEVER routes through UnlockVideoModal or the unlock server fn. The card's
// unlock button is intercepted with an `onUnlockClick` toast so no debit path
// is reachable from this surface.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { LockedVideoCard, type LockedVideoCardItem } from "@/components/video-answers/LockedVideoCard";

interface Props {
  answerId: string;
}

interface AnswerRow {
  id: string;
  is_published: boolean;
  youtube_video_id: string | null;
  video_title: string | null;
  video_description: string | null;
  question_addressed_override: string | null;
  verdict: string | null;
  unlock_price_credits: number | null;
  video_duration_sec: number | null;
  created_at: string;
  queries: { stock_symbol: string | null; stock_name: string | null; query_text: string | null } | null;
  analyst_profiles: { display_name: string | null; sebi_reg_number: string | null } | null;
}

export default function VideoAnswerPreview({ answerId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin_video_answer_preview", answerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("answers")
        .select(
          "id, is_published, youtube_video_id, video_title, video_description, question_addressed_override, verdict, unlock_price_credits, video_duration_sec, created_at, queries:query_id(stock_symbol, stock_name, query_text), analyst_profiles:expert_id(display_name, sebi_reg_number)"
        )
        .eq("id", answerId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as AnswerRow | null;
    },
  });

  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link to={"/admin/videos" as never}><ArrowLeft className="h-4 w-4 mr-1" /> Back to list</Link>
        </Button>
        <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
          Preview only — no debit
        </Badge>
      </div>

      {isLoading || !data ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-mono">
              This is exactly what a locked user sees pre-unlock. Clicking Unlock here does nothing.
            </p>
            <div className="max-w-lg">
              <LockedVideoCard
                item={toLockedItem(data)}
                onUnlockClick={() => toast.info("Preview only — no debit is performed.")}
              />
            </div>
          </div>
          <Card className="p-5 space-y-2 text-sm">
            <h2 className="font-semibold">Watch-page header (locked)</h2>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground font-mono">Question addressed</p>
              <p>{data.question_addressed_override || data.queries?.query_text || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground font-mono">Description</p>
              <p className="text-muted-foreground">{data.video_description || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground font-mono">Answered by</p>
              <p>
                {data.analyst_profiles?.display_name ?? "—"}
                {data.analyst_profiles?.sebi_reg_number ? ` · SEBI RA ${data.analyst_profiles.sebi_reg_number}` : ""}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground font-mono">Status</p>
              <p>{data.is_published ? "Published" : "Draft (invisible to users)"}</p>
            </div>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}

function toLockedItem(r: AnswerRow): LockedVideoCardItem {
  const title = r.video_title || r.question_addressed_override || r.queries?.query_text || "Analyst video";
  return {
    answerId: r.id,
    title,
    verdict: r.verdict,
    symbol: r.queries?.stock_symbol ?? null,
    analystName: r.analyst_profiles?.display_name ?? null,
    analystSebiRegNumber: r.analyst_profiles?.sebi_reg_number ?? null,
    unlockPriceCredits: r.unlock_price_credits,
    videoDurationSec: r.video_duration_sec,
    posterThumb: r.youtube_video_id ? `https://i.ytimg.com/vi/${r.youtube_video_id}/hqdefault.jpg` : null,
    publishedAt: r.created_at,
  };
}
