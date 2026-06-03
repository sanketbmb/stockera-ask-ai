import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface RunSummary {
  run_id: string;
  engine_version: string;
  universe_size: number;
  total_cases: number;
  completed_cases: number;
  data_error_cases: number;
  entry_hit_rate: number | null;
  t1_hit_rate: number | null;
  t2_hit_rate: number | null;
  sl_hit_rate: number | null;
  timeout_rate: number | null;
  breakdown_by_horizon: Record<string, BreakdownRow> | null;
  breakdown_by_regime: Record<string, BreakdownRow> | null;
  breakdown_by_reasoning_code: Record<string, BreakdownRow> | null;
  status: string;
  next_chunk_index: number;
  started_at: string;
  finished_at: string | null;
  last_progress_at: string | null;
  error_message: string | null;
}

interface BreakdownRow {
  n: number;
  entry_hit_rate: number;
  t1_hit_rate: number;
  t2_hit_rate: number;
  sl_hit_rate: number;
}

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export default function AdminBacktest() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("backtest_run_summary")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    if (error) {
      toast.error("Failed to load runs: " + error.message);
    } else {
      setRuns((data as RunSummary[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  async function startRun(mode: "start" | "pilot") {
    setStarting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-backtest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ action: mode }),
      });
      const body = await res.json();
      if (body.success) {
        toast.success(`${mode === "pilot" ? "Pilot" : "Full"} run started: ${body.run_id.slice(0, 8)}… (${body.total_cases} cases)`);
        await load();
      } else {
        toast.error(body.error || "Failed to start run");
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setStarting(false);
    }
  }

  const latest = runs[0];

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Backtest Harness</h1>
          <p className="text-sm text-muted-foreground">Engine accuracy on historical NSE candles · admin only</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => startRun("pilot")} disabled={starting}>
            {starting ? "Starting…" : "Pilot (45 cases)"}
          </Button>
          <Button onClick={() => startRun("start")} disabled={starting}>
            {starting ? "Starting…" : "Run full backtest"}
          </Button>
        </div>
      </div>

      {loading && !runs.length && <p className="text-muted-foreground">Loading…</p>}

      {latest && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Latest run · {latest.run_id.slice(0, 8)}…</CardTitle>
            <Badge variant={latest.status === "completed" ? "default" : "secondary"}>
              {latest.status === "running"
                ? `running (chunk ${latest.next_chunk_index})`
                : latest.status}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Stat label="Engine" value={latest.engine_version} />
              <Stat label="Universe" value={String(latest.universe_size)} />
              <Stat label="Total cases" value={String(latest.total_cases)} />
              <Stat label="Completed" value={`${latest.completed_cases} (${latest.data_error_cases} err)`} />
              <Stat label="Entry hit" value={pct(latest.entry_hit_rate)} />
              <Stat label="T1 hit" value={pct(latest.t1_hit_rate)} />
              <Stat label="T2 hit" value={pct(latest.t2_hit_rate)} />
              <Stat label="SL hit" value={pct(latest.sl_hit_rate)} />
            </div>

            <BreakdownTable title="By horizon" data={latest.breakdown_by_horizon} />
            <BreakdownTable title="By regime" data={latest.breakdown_by_regime} />
            <BreakdownTable title="By reasoning code" data={latest.breakdown_by_reasoning_code} compact />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Run history</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3">Run</th>
                  <th className="py-2 pr-3">Engine</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Cases</th>
                  <th className="py-2 pr-3">Entry</th>
                  <th className="py-2 pr-3">T1</th>
                  <th className="py-2 pr-3">T2</th>
                  <th className="py-2 pr-3">SL</th>
                  <th className="py-2 pr-3">Started</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.run_id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{r.run_id.slice(0, 8)}…</td>
                    <td className="py-2 pr-3 text-xs">{r.engine_version}</td>
                    <td className="py-2 pr-3"><Badge variant="outline">{r.status}</Badge></td>
                    <td className="py-2 pr-3">{r.completed_cases}/{r.total_cases}</td>
                    <td className="py-2 pr-3">{pct(r.entry_hit_rate)}</td>
                    <td className="py-2 pr-3">{pct(r.t1_hit_rate)}</td>
                    <td className="py-2 pr-3">{pct(r.t2_hit_rate)}</td>
                    <td className="py-2 pr-3">{pct(r.sl_hit_rate)}</td>
                    <td className="py-2 pr-3 text-xs">{new Date(r.started_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function BreakdownTable({
  title, data, compact,
}: { title: string; data: Record<string, BreakdownRow> | null; compact?: boolean }) {
  if (!data || Object.keys(data).length === 0) return null;
  const entries = Object.entries(data).sort((a, b) => b[1].n - a[1].n);
  const rows = compact ? entries.slice(0, 10) : entries;
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-1 pr-3">Key</th>
              <th className="py-1 pr-3">N</th>
              <th className="py-1 pr-3">Entry</th>
              <th className="py-1 pr-3">T1</th>
              <th className="py-1 pr-3">T2</th>
              <th className="py-1 pr-3">SL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-b last:border-0">
                <td className="py-1 pr-3 font-mono">{k}</td>
                <td className="py-1 pr-3 tabular-nums">{v.n}</td>
                <td className="py-1 pr-3 tabular-nums">{pct(v.entry_hit_rate)}</td>
                <td className="py-1 pr-3 tabular-nums">{pct(v.t1_hit_rate)}</td>
                <td className="py-1 pr-3 tabular-nums">{pct(v.t2_hit_rate)}</td>
                <td className="py-1 pr-3 tabular-nums">{pct(v.sl_hit_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
