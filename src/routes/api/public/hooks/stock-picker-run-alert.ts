// OBSERVABILITY.RUN.STATE — Missing-run alert for stock-picker-daily-cron.
//
// Fires from pg_cron once per day (recommended: 22:35 IST). For today's IST
// run date, raises an alert when:
//   • no stock_picker_run_state row exists (cron never fired), OR
//   • the newest row is still not 'completed' by the configured cutoff, OR
//   • no completed stock_picker_batch_rejection row exists for today.
//
// Alerts are deduplicated via the partial unique index on
// stock_picker_alerts (alert_kind, batch_id, run_date_ist) WHERE
// resolved_at IS NULL — a second invocation the same night is a no-op.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function istDate(): string {
  const ist = new Date(Date.now() + (5 * 60 + 30) * 60_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
}

export const Route = createFileRoute("/api/public/hooks/stock-picker-run-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        if (!apikey) return json({ ok: false, error: "missing_apikey" }, 401);

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_KEY =
          process.env.SB_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
        if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "missing_env" }, 500);

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const runDateIst = istDate();
        const raised: Array<{ kind: string; batch_id: string | null }> = [];

        // 1) Did any run_state row for today exist?
        const { data: runs } = await supabase
          .from("stock_picker_run_state")
          .select("batch_id, status, attempt_count, resume_from, last_heartbeat_at")
          .eq("mode", "live")
          .eq("run_date_ist", runDateIst)
          .order("last_heartbeat_at", { ascending: false });

        if (!runs || runs.length === 0) {
          const { error } = await supabase.from("stock_picker_alerts").insert({
            alert_kind: "stock_picker_run_missing",
            batch_id: null,
            run_date_ist: runDateIst,
            severity: "error",
            message: `No stock-picker live run recorded for ${runDateIst}`,
            context: {},
          });
          if (!error) raised.push({ kind: "stock_picker_run_missing", batch_id: null });
        } else {
          const completed = runs.find((r) => r.status === "completed");
          if (!completed) {
            const newest = runs[0];
            const { error } = await supabase.from("stock_picker_alerts").insert({
              alert_kind: "stock_picker_run_incomplete",
              batch_id: newest.batch_id as string,
              run_date_ist: runDateIst,
              severity: "error",
              message: `stock-picker live run for ${runDateIst} did not complete by cutoff (newest status=${newest.status}, attempts=${newest.attempt_count})`,
              context: {
                resume_from: newest.resume_from,
                last_heartbeat_at: newest.last_heartbeat_at,
                attempt_count: newest.attempt_count,
              },
            });
            if (!error)
              raised.push({
                kind: "stock_picker_run_incomplete",
                batch_id: newest.batch_id as string,
              });
          }
        }

        // 2) Was a completed batch_rejection row actually written today?
        const dayStartUtc = new Date(`${runDateIst}T00:00:00+05:30`).toISOString();
        const { count: rejCount } = await supabase
          .from("stock_picker_batch_rejection")
          .select("id", { count: "exact", head: true })
          .eq("batch_type", "live")
          .eq("batch_state", "completed")
          .gte("run_at", dayStartUtc);

        if (!rejCount || rejCount === 0) {
          const { error } = await supabase.from("stock_picker_alerts").insert({
            alert_kind: "stock_picker_batch_not_persisted",
            batch_id: null,
            run_date_ist: runDateIst,
            severity: "error",
            message: `No completed stock_picker_batch_rejection row for ${runDateIst}`,
            context: {},
          });
          if (!error)
            raised.push({ kind: "stock_picker_batch_not_persisted", batch_id: null });
        }

        try {
          await supabase.from("cron_run_log").insert({
            function_name: "stock-picker-run-alert",
            status: "ok",
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            metrics: {
              run_date_ist: runDateIst,
              runs_found: runs?.length ?? 0,
              batch_rejection_count: rejCount ?? 0,
              alerts_raised: raised.length,
            },
          });
        } catch { /* swallow */ }

        return json({ ok: true, run_date_ist: runDateIst, raised });
      },
    },
  },
});
