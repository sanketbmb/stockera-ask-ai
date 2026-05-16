import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAnalystComplaintsSummary } from "@/lib/grievances.functions";
import { Card } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

interface Props {
  analystId: string;
}

export function ComplaintsDataCard({ analystId }: Props) {
  const fetchSummary = useServerFn(getAnalystComplaintsSummary);
  const { data, isLoading } = useQuery({
    queryKey: ["analyst-complaints-summary", analystId],
    queryFn: () => fetchSummary({ data: { analyst_id: analystId } }),
    staleTime: 5 * 60 * 1000,
  });

  const s = data ?? {
    total_last_30d: 0,
    resolved_last_30d: 0,
    pending_last_30d: 0,
    total_all_time: 0,
    resolved_all_time: 0,
  };

  return (
    <Card className="border-border p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-primary" />
        <h3 className="font-display text-base text-foreground">Complaints data</h3>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">SEBI disclosure</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Investor complaints filed against this analyst in the last 30 days.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <Stat label="Received" value={isLoading ? "…" : s.total_last_30d} />
        <Stat label="Resolved" value={isLoading ? "…" : s.resolved_last_30d} tone="ok" />
        <Stat label="Pending" value={isLoading ? "…" : s.pending_last_30d} tone={s.pending_last_30d > 0 ? "warn" : "default"} />
      </div>

      <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        <div className="flex justify-between"><span>Total complaints (all time)</span><span className="font-mono text-foreground">{s.total_all_time}</span></div>
        <div className="mt-1 flex justify-between"><span>Resolved (all time)</span><span className="font-mono text-foreground">{s.resolved_all_time}</span></div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        File a complaint at <a className="text-primary underline" href="/grievance-redressal">/grievance-redressal</a>. Unresolved beyond 30 days? Escalate to SEBI SCORES.
      </p>
    </Card>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "ok" | "warn" }) {
  const color =
    tone === "ok" ? "text-emerald-600" :
    tone === "warn" ? "text-amber-600" :
    "text-foreground";
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <p className={`font-display text-2xl ${color}`}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
