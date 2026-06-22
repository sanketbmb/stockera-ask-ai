import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Activity, FileText, Video, Clock3 } from "lucide-react";

const REFRESH_MS = 60_000;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type Metrics = {
  queries: number | null;
  published: number | null;
  videoRequests: number | null;
  avgTurnaroundMinutes: number | null;
};

function formatInt(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN");
}

function formatTurnaround(mins: number | null): string {
  if (mins === null || !Number.isFinite(mins) || mins <= 0) return "—";
  const totalMinutes = Math.round(mins);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function FounderPulseCard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Metrics>({
    queries: null,
    published: null,
    videoRequests: null,
    avgTurnaroundMinutes: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();

      const [qRes, pRes, vRes, ansRes] = await Promise.allSettled([
        supabase
          .from("queries")
          .select("id", { count: "exact", head: true })
          .gte("created_at", sinceIso),
        supabase
          .from("answers")
          .select("id", { count: "exact", head: true })
          .eq("is_published", true)
          .gte("created_at", sinceIso),
        supabase
          .from("queries")
          .select("id", { count: "exact", head: true })
          .eq("video_requested", true)
          .gte("created_at", sinceIso),
        supabase
          .from("answers")
          .select("query_id, created_at")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      let avgMinutes: number | null = null;
      if (ansRes.status === "fulfilled" && ansRes.value.data && ansRes.value.data.length > 0) {
        const rows = ansRes.value.data as Array<{ query_id: string | null; created_at: string }>;
        const ids = Array.from(new Set(rows.map((r) => r.query_id).filter((x): x is string => !!x)));
        if (ids.length > 0) {
          const { data: qrows } = await supabase
            .from("queries")
            .select("id, created_at")
            .in("id", ids);
          if (qrows && qrows.length > 0) {
            const qmap = new Map<string, string>();
            for (const q of qrows as Array<{ id: string; created_at: string }>) {
              qmap.set(q.id, q.created_at);
            }
            const diffs: number[] = [];
            for (const a of rows) {
              if (!a.query_id) continue;
              const qc = qmap.get(a.query_id);
              if (!qc) continue;
              const ms = new Date(a.created_at).getTime() - new Date(qc).getTime();
              if (Number.isFinite(ms) && ms > 0) diffs.push(ms / 60000);
            }
            if (diffs.length > 0) {
              avgMinutes = diffs.reduce((s, n) => s + n, 0) / diffs.length;
            }
          }
        }
      }

      if (cancelled) return;
      setMetrics({
        queries: qRes.status === "fulfilled" ? qRes.value.count ?? 0 : null,
        published: pRes.status === "fulfilled" ? pRes.value.count ?? 0 : null,
        videoRequests: vRes.status === "fulfilled" ? vRes.value.count ?? 0 : null,
        avgTurnaroundMinutes: avgMinutes,
      });
      setLoading(false);
    }

    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const tiles = useMemo(
    () => [
      { label: "Queries", value: formatInt(metrics.queries), Icon: Activity },
      { label: "Published answers", value: formatInt(metrics.published), Icon: FileText },
      { label: "Premium video requests", value: formatInt(metrics.videoRequests), Icon: Video },
      { label: "Avg answer turnaround", value: formatTurnaround(metrics.avgTurnaroundMinutes), Icon: Clock3 },
    ],
    [metrics],
  );

  return (
    <section
      aria-label="Founder pulse"
      className="mb-6 rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-card shadow-sm"
    >
      <Card className="rounded-3xl border-0 bg-transparent shadow-none p-5 md:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Founder pulse · 30-day window
          </p>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />
            <span>Read-only live metrics</span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map(({ label, value, Icon }) => (
            <div
              key={label}
              className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur p-4"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <Icon aria-hidden="true" className="h-4 w-4" />
              </div>
              {loading ? (
                <Skeleton className="h-8 w-20 mt-2" />
              ) : (
                <p className="font-display text-2xl md:text-3xl mt-1 tabular-nums">{value}</p>
              )}
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground mt-4">
          Operational view only · based on live application data
        </p>
      </Card>
    </section>
  );
}

export default FounderPulseCard;
