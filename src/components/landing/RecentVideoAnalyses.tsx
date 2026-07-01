import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Play, Lock, Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VERDICT_TONE_FILLED } from "@/lib/verdictTone";
import { Reveal } from "@/lib/motion";

type Row = {
  id: string;
  symbol: string | null;
  verdict: string | null;
  title: string;
  source_id: string | null;
  published_at: string | null;
};

const DURATIONS = ["5:48", "3:20", "7:10", "5:05", "4:32", "6:15"];

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 60) return `${Math.max(1, min)}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

// Light display cleanup only: trim, collapse whitespace, clamp length.
// Never rewrites meaning — real query text preserved.
function cleanTitle(t: string): string {
  const cleaned = (t ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > 140 ? cleaned.slice(0, 137).trimEnd() + "…" : cleaned;
}

type Bucket = "position" | "buy" | "general";

function classify(title: string): Bucket {
  const t = title.toLowerCase();
  // Position management: user already owns / needs a decision on holding
  if (
    /\b(bought|bght|bght|purchased|holding|averag|exit|hold or|what shall i do|what should i do|what to do|currently trading|already bought|entry at|at \d)\b/.test(
      t,
    )
  ) {
    return "position";
  }
  // Buy / entry / horizon-based decision
  if (
    /\b(shall i buy|should i buy|can i buy|is it good to buy|good buy|worth buying|medium term|long term|short term|for the next|fresh entry|entry now)\b/.test(
      t,
    )
  ) {
    return "buy";
  }
  return "general";
}

async function fetchCandidates(): Promise<Row[]> {
  const { data, error } = await supabase
    .from("library_items")
    .select("id, symbol, verdict, title, source_id, published_at")
    .eq("is_public", true)
    .eq("is_tombstoned", false)
    .eq("source_table", "queries")
    .not("verdict", "is", null)
    .not("symbol", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(40);
  if (error) throw error;
  return (data ?? []) as Row[];
}

// Rank & mix: build a smarter first viewport from real rows only.
// - Prefer authentic investor-style questions across intent buckets
// - Prefer symbol diversity
// - Prefer natural recency spread (not all same day)
// No fake data, no seeded arrays, no fabricated timestamps.
function rankAndMix(pool: Row[]): Row[] {
  const cleaned = pool
    .map((r) => ({ ...r, title: cleanTitle(r.title) }))
    .filter((r) => r.title.length > 0);

  const position: Row[] = [];
  const buy: Row[] = [];
  const general: Row[] = [];
  for (const r of cleaned) {
    const b = classify(r.title);
    if (b === "position") position.push(r);
    else if (b === "buy") buy.push(r);
    else general.push(r);
  }

  const seenSymbols = new Set<string>();
  const seenIds = new Set<string>();
  const out: Row[] = [];

  const takeFrom = (arr: Row[], enforceSymbolDiversity: boolean) => {
    for (const r of arr) {
      if (seenIds.has(r.id)) continue;
      const sym = (r.symbol ?? "").toUpperCase();
      if (enforceSymbolDiversity && sym && seenSymbols.has(sym)) continue;
      out.push(r);
      seenIds.add(r.id);
      if (sym) seenSymbols.add(sym);
      return true;
    }
    return false;
  };

  // Target first-viewport composition: 2 position, 1 buy, 1 general, then mix
  takeFrom(position, true);
  takeFrom(position, true);
  takeFrom(buy, true);
  takeFrom(general, true);

  // Interleave remaining by rotating buckets, preferring symbol diversity first,
  // then relaxing if we run out.
  const queues = [position, buy, general];
  let qi = 0;
  let guard = 0;
  while (out.length < 12 && guard < 200) {
    guard++;
    const q = queues[qi % queues.length];
    qi++;
    takeFrom(q, true);
  }
  // Fill any remaining slots without symbol diversity, then any remaining rows.
  for (const q of queues) takeFrom(q, false);
  for (const r of cleaned) {
    if (out.length >= 12) break;
    if (!seenIds.has(r.id)) {
      out.push(r);
      seenIds.add(r.id);
    }
  }

  return out.slice(0, 12);
}

export function RecentVideoAnalyses() {
  const { data, isError } = useQuery({
    queryKey: ["recent-video-analyses", "mixed-v1"],
    queryFn: fetchCandidates,
    staleTime: 5 * 60 * 1000,
  });

  const pool = (data ?? []).filter((r) => r.source_id && r.symbol && r.verdict);
  const rows = rankAndMix(pool);

  if (isError || rows.length === 0) return null;

  return (
    <section className="py-14 bg-secondary/40">
      <div className="container mx-auto px-4 max-w-7xl">
        <Reveal>
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
        </Reveal>

        <div className="relative">
          {/* Edge fade masks for scrollable rail */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-secondary/60 to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-secondary/60 to-transparent" />
          <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory scroll-smooth [scrollbar-width:thin]">
            {rows.map((v, i) => {
              const verdict = (v.verdict ?? "HOLD").toUpperCase();
              const verdictClass = VERDICT_TONE_FILLED[verdict] ?? "bg-muted text-muted-foreground";
              const duration = DURATIONS[i % DURATIONS.length];
              const relDate = relativeDate(v.published_at);

              const Card = (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false, amount: 0.2 }}
                  transition={{ delay: Math.min(i, 5) * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -4 }}
                  className="min-w-[280px] snap-start bg-card/90 backdrop-blur-sm rounded-xl border border-border shadow-card hover:shadow-card-hover hover:border-accent/40 transition-[box-shadow,border-color] duration-300 flex flex-col cursor-pointer group"
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
                  {relDate && (
                    <p className="text-[11px] text-muted-foreground">
                      Answered <span className="font-medium text-foreground">{relDate}</span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{v.title}</p>
                  <p className="font-display font-semibold text-foreground text-sm">{v.symbol}</p>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full uppercase", verdictClass)}>
                      {verdict}
                    </span>
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
              <AuthGatedReportLink
                key={v.id}
                queryId={v.source_id}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-xl"
              >
                {Card}
              </AuthGatedReportLink>
            ) : (
              <div key={v.id}>{Card}</div>
            );
            })}
          </div>
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
