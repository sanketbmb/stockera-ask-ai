import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion-helpers";

type MarqueeRow = {
  id: string;
  symbol: string | null;
  verdict: string | null;
  title: string;
  source_id: string | null;
  source_table: string | null;
  published_at: string | null;
};

type DisplayCard = {
  key: string;
  ticker: string;
  question: string;
  verdict: string;
  href: string | null; // null => disabled span
};

const VERDICT_TONE: Record<string, string> = {
  BUY: "bg-success/15 text-success",
  WATCHLIST: "bg-primary/10 text-primary",
  HOLD: "bg-gold/15 text-[hsl(var(--gold-foreground))]",
  WAIT: "bg-muted text-muted-foreground",
  AVERAGE: "bg-accent/15 text-accent",
  "PARTIAL EXIT": "bg-warning/15 text-[hsl(var(--gold-foreground))]",
  REDUCE: "bg-warning/15 text-[hsl(var(--gold-foreground))]",
  EXIT: "bg-destructive/15 text-destructive",
  AVOID: "bg-destructive/15 text-destructive",
};

function verdictClass(v: string) {
  return VERDICT_TONE[v.toUpperCase()] ?? "bg-muted text-muted-foreground";
}

const FALLBACK: DisplayCard[] = [
  { key: "fb-1", ticker: "SAMPLE LTD", question: "Bought higher, market dropped — average or exit?", verdict: "HOLD", href: null },
  { key: "fb-2", ticker: "SAMPLE LTD", question: "Fresh entry now or wait for a pullback?", verdict: "WAIT", href: null },
  { key: "fb-3", ticker: "SAMPLE LTD", question: "Up 40% from buy price. Book profits or stay?", verdict: "PARTIAL EXIT", href: null },
  { key: "fb-4", ticker: "SAMPLE LTD", question: "Long-term hold worth it after sector weakness?", verdict: "HOLD", href: null },
  { key: "fb-5", ticker: "SAMPLE LTD", question: "Stuck at cost for months — what now?", verdict: "AVERAGE", href: null },
  { key: "fb-6", ticker: "SAMPLE LTD", question: "Re-rating story still intact at these levels?", verdict: "WATCHLIST", href: null },
];

async function fetchMarqueeRows(): Promise<MarqueeRow[]> {
  const { data, error } = await supabase
    .from("library_items")
    .select("id, symbol, verdict, title, source_id, source_table, published_at")
    .eq("is_public", true)
    .eq("is_tombstoned", false)
    .eq("source_table", "queries")
    .not("verdict", "is", null)
    .not("symbol", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(24);
  if (error) throw error;
  return (data ?? []) as MarqueeRow[];
}

export function PublicAnswersMarquee() {
  const { data, isError } = useQuery({
    queryKey: ["public-answers-marquee"],
    queryFn: fetchMarqueeRows,
    staleTime: 5 * 60 * 1000,
  });

  const live: DisplayCard[] = (data ?? [])
    .filter((r) => r.source_id && r.symbol && r.verdict && r.title)
    .map((r) => ({
      key: r.id,
      ticker: r.symbol as string,
      question: r.title,
      verdict: (r.verdict as string).toUpperCase(),
      href: r.source_id ? `/report/${r.source_id}` : null,
    }));

  const cards: DisplayCard[] = isError || live.length < 6 ? FALLBACK : live;
  // Duplicate for seamless -50% loop in global .marquee keyframes.
  const track = [...cards, ...cards];

  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Recently answered
          </p>
          <h2 className="mt-2 font-display text-3xl text-foreground sm:text-4xl">
            Questions Like Yours — <span className="text-gradient">Answered</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Real queries from real investors. Real verdicts from SEBI-registered experts.
          </p>
        </Reveal>
      </div>

      {/* Edge fade + overflow clip wraps the marquee track. */}
      <div
        className={cn(
          "group relative mt-10 overflow-hidden",
          "[mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]",
        )}
      >
        <div
          className={cn(
            "marquee flex w-max gap-5 px-4 sm:px-6",
            // Pause on hover / keyboard focus within the strip; respect reduced motion.
            "group-hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]",
            "motion-reduce:[animation:none]",
          )}
        >
          {track.map((c, i) => {
            const Inner = (
              <div className="group/card flex h-full w-[280px] shrink-0 flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover sm:w-[320px]">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-primary">
                    {c.ticker}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                      verdictClass(c.verdict),
                    )}
                  >
                    {c.verdict}
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-foreground">"{c.question}"</p>
                <div className="mt-auto flex items-center justify-end pt-4">
                  {c.href ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent group-hover/card:underline">
                      See Full Answer <ArrowRight className="h-3 w-3" />
                    </span>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="inline-flex cursor-not-allowed items-center gap-1 text-xs font-semibold text-muted-foreground/60"
                    >
                      See Full Answer <ArrowRight className="h-3 w-3" />
                    </span>
                  )}
                </div>
              </div>
            );

            return c.href ? (
              <Link
                key={`${c.key}-${i}`}
                to="/report/$queryId"
                params={{ queryId: c.href.split("/").pop() as string }}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-2xl"
                aria-label={`See full answer for ${c.ticker}: ${c.question}`}
              >
                {Inner}
              </Link>
            ) : (
              <div key={`${c.key}-${i}`} aria-hidden={i >= cards.length}>
                {Inner}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default PublicAnswersMarquee;
