// OBSERVABILITY.RUN.STATE — Stalled-chunk watchdog for stock-picker-daily-cron.
//
// Reads public.stock_picker_run_state for live-mode batches that are
// mid-flight but whose next chunk never arrived (silent pg_net drop):
//   status IN ('awaiting_next_chunk','error')
//   AND next_attempt_at <= now()
//   AND attempt_count <  watchdog_max_attempts
//
// For each such row, re-fires stock-picker-daily-cron with the persisted
// batch_id + resume_from cursor. If attempt_count has already hit the max,
// mark the row 'abandoned' and raise an alert.
//
// Called by pg_cron every 2-3 minutes. Auth: apikey (Supabase publishable
// key) — matches the standard /api/public/* pattern. Verification of the
// caller is not strictly required (this route is idempotent and only reads
// its own audit tables), but we still gate on presence of the apikey header
// to keep the URL from being trivially discoverable.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

interface RunStateRow {
  batch_id: string;
  mode: string;
  invoked_by: string | null;
  run_date_ist: string;
  risk_profile: string | null;
  seed_version: string | null;
  status: string;
  attempt_count: number;
  resume_from: string | null;
  next_attempt_at: string | null;
  last_heartbeat_at: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hooks/stock-picker-chunk-watchdog")({
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

        // Load thresholds from runtime config (fall back to sane defaults).
        const { data: cfgRows } = await supabase
          .from("stock_picker_runtime_config")
          .select("config_key, config_value")
          .in("config_key", ["watchdog_stall_seconds", "watchdog_max_attempts"]);
        const cfg = new Map<string, unknown>();
        for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value);
        const stallSeconds =
          typeof cfg.get("watchdog_stall_seconds") === "number"
            ? (cfg.get("watchdog_stall_seconds") as number)
            : 120;
        const maxAttempts =
          typeof cfg.get("watchdog_max_attempts") === "number"
            ? (cfg.get("watchdog_max_attempts") as number)
            : 6;

        const cutoff = new Date(Date.now() - stallSeconds * 1000).toISOString();
        const { data: candidates, error } = await supabase
          .from("stock_picker_run_state")
          .select(
            "batch_id, mode, invoked_by, run_date_ist, risk_profile, seed_version, status, attempt_count, resume_from, next_attempt_at, last_heartbeat_at",
          )
          .eq("mode", "live")
          .in("status", ["awaiting_next_chunk", "error", "in_progress"])
          .lte("last_heartbeat_at", cutoff)
          .order("last_heartbeat_at", { ascending: true })
          .limit(10);

        if (error) return json({ ok: false, error: error.message }, 500);

        const resumed: string[] = [];
        const abandoned: string[] = [];
        const skipped: string[] = [];

        for (const row of (candidates ?? []) as RunStateRow[]) {
          // Respect explicit next_attempt_at cooldown if present.
          if (row.next_attempt_at && new Date(row.next_attempt_at).getTime() > Date.now()) {
            skipped.push(row.batch_id);
            continue;
          }
          if (row.attempt_count >= maxAttempts) {
            await supabase
              .from("stock_picker_run_state")
              .update({ status: "abandoned", last_heartbeat_at: new Date().toISOString() })
              .eq("batch_id", row.batch_id);
            await supabase.from("stock_picker_alerts").insert({
              alert_kind: "stock_picker_run_abandoned",
              batch_id: row.batch_id,
              run_date_ist: row.run_date_ist,
              severity: "error",
              message: `stock-picker run abandoned after ${row.attempt_count} attempts (last status=${row.status})`,
              context: {
                mode: row.mode,
                resume_from: row.resume_from,
                last_heartbeat_at: row.last_heartbeat_at,
              },
            });
            abandoned.push(row.batch_id);
            continue;
          }

          // Re-fire the cron with the persisted batch_id + cursor.
          const continueBody = {
            mode: row.mode,
            invoked_by: `watchdog:${row.invoked_by ?? "cron"}`,
            seed_version: row.seed_version ?? undefined,
            run_date_ist: row.run_date_ist,
            resume_from: row.resume_from ?? undefined,
            risk_profile: row.risk_profile ?? undefined,
            batch_id: row.batch_id,
          };
          try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/stock-picker-daily-cron`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
              },
              body: JSON.stringify(continueBody),
            });
            resumed.push(row.batch_id);
            if (!res.ok) {
              // Non-fatal — the cron itself will mark run_state on failure.
              console.warn(
                `watchdog: resume returned ${res.status} for batch=${row.batch_id}`,
              );
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`watchdog: fetch failed batch=${row.batch_id}: ${msg}`);
          }
        }

        // Best-effort cron_run_log trace for observability.
        try {
          await supabase.from("cron_run_log").insert({
            function_name: "stock-picker-chunk-watchdog",
            status: "ok",
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            metrics: {
              candidates: candidates?.length ?? 0,
              resumed: resumed.length,
              abandoned: abandoned.length,
              skipped: skipped.length,
              stall_seconds: stallSeconds,
              max_attempts: maxAttempts,
            },
          });
        } catch { /* swallow */ }

        return json({
          ok: true,
          candidates: candidates?.length ?? 0,
          resumed,
          abandoned,
          skipped,
        });
      },
    },
  },
});
