import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Zap, ShieldCheck, Sparkles, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { SESSION_TIERS, formatINR } from "@/lib/session-tiers";
import { FIRM } from "@/lib/firm-details";

const VIDEO_PRICE_PAISE = 10000;
const REFRESH_INTERVAL_MS = 60_000;

type RecentItem = { id: string; created_at: string; label: string };

function prettifyQueryType(s: string): string {
  if (!s) return "";
  const map: Record<string, string> = {
    fresh_entry: "Fresh-entry",
    existing_position: "Existing position",
    sector_view: "Sector view",
  };
  if (map[s]) return map[s];
  return s
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function LiveDemandBlock() {
  const reduced = useReducedMotion();
  const [loading, setLoading] = useState(true);
  const [queryCount, setQueryCount] = useState(0);
  const [topTypes, setTopTypes] = useState<string[]>([]);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      try {
        const { count } = await supabase
          .from("queries")
          .select("*", { count: "exact", head: true })
          .gte("created_at", since);
        if (!cancelled) setQueryCount(count ?? 0);
      } catch {
        /* fallback to 0 */
      }

      try {
        const { data: qRows } = await supabase
          .from("queries")
          .select("query_type, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(200);
        const bucket: Record<string, number> = {};
        (qRows ?? []).forEach((r: any) => {
          if (!r?.query_type) return;
          bucket[r.query_type] = (bucket[r.query_type] ?? 0) + 1;
        });
        const top = Object.entries(bucket)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k]) => prettifyQueryType(k));
        if (!cancelled) setTopTypes(top);
      } catch {
        if (!cancelled) setTopTypes([]);
      }

      try {
        const { data: ans } = await supabase
          .from("answers")
          .select("id, created_at, body, video_url")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(4);
        const items: RecentItem[] = (ans ?? []).map((a: any) => ({
          id: String(a.id),
          created_at: a.created_at,
          label: a.video_url ? "Video answer published" : "Analyst answer published",
        }));
        if (!cancelled) setRecentItems(items);
      } catch {
        if (!cancelled) setRecentItems([]);
      }

      if (!cancelled) setLoading(false);
    }

    load();
    const t = setInterval(load, REFRESH_INTERVAL_MS);
    const minDone = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 500);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearTimeout(minDone);
    };
  }, []);

  const priceLine = `₹${VIDEO_PRICE_PAISE / 100} video · ${formatINR(
    SESSION_TIERS[0].amountPaise,
  )} / ${formatINR(SESSION_TIERS[1].amountPaise)} / ${formatINR(
    SESSION_TIERS[2].amountPaise,
  )} for live sessions`;

  const topLine = topTypes.length > 0 ? topTypes.join(" · ") : "Building history · trending questions live";

  return (
    <section
      aria-labelledby="live-demand-heading"
      className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16"
    >
      <h2 id="live-demand-heading" className="sr-only">
        Live demand and honest pricing
      </h2>

      {/* Row A */}
      <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Live signal · 30-day pulse
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Reading across {queryCount} recent queries
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Card 1 */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-accent" />
            <h3 className="font-display text-base font-semibold">Honest pricing, no surprises</h3>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            ₹100 for a personalized video from a SEBI-registered Research Analyst. Or book a 1:1 live session in three lengths.
          </p>
          <p className="mt-3 text-sm font-medium text-foreground">{priceLine}</p>
        </Card>

        {/* Card 2 */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-accent" />
            <h3 className="font-display text-base font-semibold">What users asked about — 30 days</h3>
          </div>
          {loading && !reduced ? (
            <Skeleton className="h-4 w-3/4" />
          ) : (
            <p className="text-sm text-muted-foreground">{topLine}</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground/80">
            Tracked from real user queries · no synthetic data
          </p>
        </Card>

        {/* Card 3 */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Zap aria-hidden="true" className="h-4 w-4 text-accent" />
            <h3 className="font-display text-base font-semibold">Recent activity</h3>
          </div>
          {loading && !reduced ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ) : recentItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Activity will appear once analysts publish their first answers.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recentItems.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-foreground/90">{it.label}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Clock aria-hidden="true" className="h-3 w-3" />
                    {relTime(it.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Row B */}
      <p className="mt-6 rounded-xl bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        {FIRM.legalName} is a SEBI-registered Research Analyst ({FIRM.sebiRegNumber}). Personalized educational analysis — not investment advice. All quotes are in INR.
      </p>
    </section>
  );
}
