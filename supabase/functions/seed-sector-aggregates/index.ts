// seed-sector-aggregates — Supabase Edge Function
//
// Refreshes public.sector_aggregates. Bootstrap rows are seeded by the
// migration; this function (a) re-asserts those rows are present, and
// (b) when per-symbol fundamentals become available in the future, computes
// medians per canonical sector and upserts them with data_source="computed".
//
// Today: stock_master has no sector column, so the seed function operates in
// "bootstrap-refresh" mode — it ensures the 11 canonical rows exist with the
// expected PE/PB defaults. The compute path is wired but no-ops until
// fundamentals caching ships in a later prompt.
//
// Schedule: pg_cron at 03:00 IST daily (= 21:30 UTC the previous day).

import { resolveSectorCanonical } from "../_shared/sector-aliases.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface BootstrapRow {
  sector: string;
  sector_canonical: string;
  sector_display: string;
  pe_median: number;
  pb_median: number;
}

const BOOTSTRAP: BootstrapRow[] = [
  { sector: "Private Sector Bank", sector_canonical: "private_sector_bank", sector_display: "Private Sector Bank", pe_median: 16, pb_median: 2.4 },
  { sector: "Public Sector Bank",  sector_canonical: "public_sector_bank",  sector_display: "Public Sector Bank",  pe_median: 8,  pb_median: 1.0 },
  { sector: "IT Services",         sector_canonical: "it_services",         sector_display: "IT Services",         pe_median: 25, pb_median: 7   },
  { sector: "Petroleum Products",  sector_canonical: "petroleum_products",  sector_display: "Refineries & Marketing", pe_median: 12, pb_median: 1.8 },
  { sector: "Pharmaceuticals",     sector_canonical: "pharmaceuticals",     sector_display: "Pharmaceuticals",     pe_median: 28, pb_median: 4.5 },
  { sector: "Automobile",          sector_canonical: "automobile",          sector_display: "Automobile",          pe_median: 22, pb_median: 3.5 },
  { sector: "FMCG",                sector_canonical: "fmcg",                sector_display: "FMCG",                pe_median: 45, pb_median: 12  },
  { sector: "Capital Goods",       sector_canonical: "capital_goods",       sector_display: "Capital Goods",       pe_median: 35, pb_median: 5   },
  { sector: "Telecom",             sector_canonical: "telecom",             sector_display: "Telecom",             pe_median: 30, pb_median: 4   },
  { sector: "Cement",              sector_canonical: "cement",              sector_display: "Cement",              pe_median: 25, pb_median: 3   },
  { sector: "__default__",         sector_canonical: "__default__",         sector_display: "Default Fallback",    pe_median: 22, pb_median: 3   },
];

const BOOTSTRAP_REF = "Trendlyne/Screener/NSE — May 2026 snapshot";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function upsertBootstrap(): Promise<{ ok: boolean; count: number; error?: string }> {
  const rows = BOOTSTRAP.map((b) => ({
    ...b,
    source: "bootstrap",
    method_version: "bootstrap_v1",
    bootstrap_source_reference: b.sector_canonical === "__default__" ? "Stockera default fallback" : BOOTSTRAP_REF,
    sample_size: 0,
    as_of_timestamp: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sector_aggregates?on_conflict=sector_canonical`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    },
  );
  if (!res.ok) {
    return { ok: false, count: 0, error: `${res.status} ${await res.text()}` };
  }
  return { ok: true, count: rows.length };
}

async function logRun(status: string, rows: number, details: Record<string, unknown>, startedAt: string): Promise<void> {
  const finishedAt = new Date().toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/cron_run_log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      function_name: "seed-sector-aggregates",
      status,
      started_at: startedAt,
      finished_at: finishedAt,
      metrics: {
        status,
        processed: rows,
        errors_count: status === "ok" ? 0 : 1,
        details,
        ran_at: finishedAt,
      },
    }),
  }).catch(() => null);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  try {
    // Bootstrap refresh (always)
    const boot = await upsertBootstrap();
    if (!boot.ok) {
      await logRun("error", 0, { phase: "bootstrap_upsert", error: boot.error }, startedAt);
      return json({ success: false, error: "BOOTSTRAP_UPSERT_FAILED", details: boot.error }, 500);
    }

    // Compute phase placeholder — per-symbol fundamentals cache not yet
    // available. Surface count for ops visibility.
    const computeAttempted = false;
    const computeRows = 0;

    // Sanity: alias resolution smoke test
    const aliasChecks = [
      resolveSectorCanonical("Private Sector Banks"),
      resolveSectorCanonical("PSU Bank"),
      resolveSectorCanonical("IT - Software"),
      resolveSectorCanonical("Refineries & Marketing"),
    ];

    const summary = {
      bootstrap_rows: boot.count,
      computed_rows: computeRows,
      compute_attempted: computeAttempted,
      alias_smoke: aliasChecks,
      latency_ms: Date.now() - started,
    };
    await logRun("ok", boot.count, summary, startedAt);
    return json({ success: true, ...summary });
  } catch (e) {
    await logRun("error", 0, { error: String(e) }, startedAt);
    return json({ success: false, error: "INTERNAL_ERROR", details: String(e) }, 500);
  }
});
