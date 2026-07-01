import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Play, Lock, Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VERDICT_TONE_FILLED } from "@/lib/verdictTone";

type Row = {
  id: string;
  symbol: string | null;
  verdict: string | null;
  title: string;
  source_id: string | null;
  published_at: string | null;
};

const DURATIONS = ["5:48", "3:20", "7:10", "5:05", "4:32", "6:15"];


async function fetchVideos(): Promise<Row[]> {
  const { data, error } = await supabase
    .from("library_items")
    .select("id, symbol, verdict, title, source_id, published_at")
    .eq("is_public", true)
    .eq("is_tombstoned", false)
    .eq("source_table", "queries")
    .not("verdict", "is", null)
    .not("symbol", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(12);
  if (error) throw error;
  return (data ?? []) as Row[];
}

export function RecentVideoAnalyses() {
  const { data, isError } = useQuery({
    queryKey: ["recent-video-analyses"],
    queryFn: fetchVideos,
    staleTime: 5 * 60 * 1000,
  });

  const live = (data ?? []).filter((r) => r.source_id && r.symbol && r.verdict);
  const rows: Row[] = isError || live.length < 4 ? FALLBACK : live;

  return (
    <section className="py-14 bg-secondary/40">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-1">
              Recent Video Analyses
            </h2>
            <p className="text-muted-foreground text-sm">
              Real queries. Real expert answers. See what others asked.
            </p>
          </div>
          <Link
            to="/library"
            className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
          >
            Watch more analyses <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory [scrollbar-width:thin]">
          {rows.map((v, i) => {
            const verdict = (v.verdict ?? "HOLD").toUpperCase();
            const verdictClass = VERDICT_TONE_FILLED[verdict] ?? "bg-muted text-muted-foreground";
            const investor = INVESTORS[i % INVESTORS.length];
            const expert = EXPERTS[i % EXPERTS.length];
            const duration = DURATIONS[i % DURATIONS.length];

            const Card = (
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i, 5) * 0.06 }}
                className="min-w-[280px] snap-start bg-card/90 backdrop-blur-sm rounded-xl border border-border shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300 flex flex-col cursor-pointer group"
              >
                <div className="relative h-36 bg-muted rounded-t-xl flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/10" />
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center z-10 group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 text-accent ml-0.5" />
                  </div>
                  <span className="absolute bottom-2 right-2 bg-foreground/80 text-primary-foreground text-xs px-2 py-0.5 rounded z-10">
                    {duration}
                  </span>
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-card/95 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm">
                    <span className="inline-grid h-5 w-5 place-items-center rounded-md bg-accent/10 text-[9px] font-bold text-accent">
                      {(v.symbol ?? "").slice(0, 3)}
                    </span>
                    <span className="text-xs font-bold text-foreground pr-1">{v.symbol}</span>
                  </div>
                  <div className="absolute top-2 right-2 z-10">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase", verdictClass)}>
                      {verdict}
                    </span>
                  </div>
                </div>
                <div className="p-4 flex flex-col gap-2 flex-1">
                  <p className="text-[11px] text-muted-foreground">
                    Asked by <span className="font-medium text-foreground">{investor}</span>
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{v.title}</p>
                  <p className="font-display font-semibold text-foreground text-sm">{v.symbol}</p>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full uppercase", verdictClass)}>
                      {verdict}
                    </span>
                    <span className="text-[11px] text-muted-foreground">by {expert}</span>
                  </div>
                  <Button variant="outline" size="sm" className="mt-auto gap-1.5">
                    <Lock className="w-3 h-3" />
                    <span>Unlock Answer</span>
                    <span className="text-xs line-through text-muted-foreground ml-1">₹100</span>
                    <span className="text-xs font-bold text-success flex items-center gap-0.5">
                      <Sparkles className="w-3 h-3" /> FREE
                    </span>
                  </Button>
                </div>
              </motion.div>
            );

            return v.source_id ? (
              <Link
                key={v.id}
                to="/report/$queryId"
                params={{ queryId: v.source_id }}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-xl"
              >
                {Card}
              </Link>
            ) : (
              <div key={v.id}>{Card}</div>
            );
          })}
        </div>

        <div className="text-center mt-6">
          <Link to="/library" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
            Watch more analyses <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export default RecentVideoAnalyses;
