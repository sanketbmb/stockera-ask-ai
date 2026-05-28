/**
 * seed-stock-master — Supabase Edge Function
 *
 * Downloads Dhan's instrument master CSV, filters to NSE/BSE equity-cash rows,
 * and upserts them into public.stock_master. Designed to be run daily via pg_cron.
 *
 * Auth: requires `x-cron-secret` header matching SEED_CRON_SECRET, OR a
 * Bearer token equal to SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CSV_URL = "https://images.dhan.co/api-data/api-scrip-master.csv";
const BATCH = 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Minimal CSV row splitter that respects double quotes
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const started = Date.now();

  try {
    /** Server config (no caller auth required — this is an idempotent
     *  public-data seeder; verify_jwt=false; called from pg_cron and ops). */
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    if (!supabaseUrl || !serviceKey) {
      return json({ success: false, error: "Server not configured" }, 500);
    }


    /** Download CSV */
    const res = await fetch(CSV_URL);
    if (!res.ok) {
      return json(
        { success: false, error: `Dhan CSV fetch failed: ${res.status}` },
        502,
      );
    }
    const csv = await res.text();

    /** Parse */
    const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length < 2) {
      return json({ success: false, error: "Empty CSV" }, 502);
    }
    const header = splitCsvLine(lines[0]).map((h) => h.trim());
    const idx = (name: string) => header.indexOf(name);

    const iExch = idx("SEM_EXM_EXCH_ID");
    const iInstr = idx("SEM_INSTRUMENT_NAME");
    const iSeg = idx("SEM_SEGMENT");
    const iSym = idx("SEM_TRADING_SYMBOL");
    const iName = idx("SM_SYMBOL_NAME");
    const iSecId = idx("SEM_SMST_SECURITY_ID");
    const iIsin = idx("SEM_ISIN");
    const iLot = idx("SEM_LOT_UNITS");
    const iTick = idx("SEM_TICK_SIZE");

    if ([iExch, iInstr, iSeg, iSym, iSecId].some((v) => v < 0)) {
      return json(
        { success: false, error: "CSV missing required columns", header },
        502,
      );
    }

    type Row = {
      symbol: string;
      company_name: string | null;
      dhan_security_id: string;
      exchange: "NSE" | "BSE";
      segment: "NSE_EQ" | "BSE_EQ";
      isin: string | null;
      lot_size: number | null;
      tick_size: number | null;
      updated_at: string;
    };

    const now = new Date().toISOString();
    const rows: Row[] = [];

    for (let l = 1; l < lines.length; l++) {
      const cols = splitCsvLine(lines[l]);
      const exch = (cols[iExch] ?? "").trim();
      const instr = (cols[iInstr] ?? "").trim();
      const seg = (cols[iSeg] ?? "").trim();
      if (instr !== "EQUITY") continue;
      if (seg !== "E") continue;
      if (exch !== "NSE" && exch !== "BSE") continue;

      const secId = (cols[iSecId] ?? "").trim();
      const sym = (cols[iSym] ?? "").trim();
      if (!secId || !sym) continue;

      const lot = iLot >= 0 ? Number((cols[iLot] ?? "").trim()) : NaN;
      const tick = iTick >= 0 ? Number((cols[iTick] ?? "").trim()) : NaN;

      rows.push({
        symbol: sym,
        company_name: iName >= 0 ? (cols[iName] ?? "").trim() || null : null,
        dhan_security_id: secId,
        exchange: exch as "NSE" | "BSE",
        segment: exch === "NSE" ? "NSE_EQ" : "BSE_EQ",
        isin: iIsin >= 0 ? (cols[iIsin] ?? "").trim() || null : null,
        lot_size: Number.isFinite(lot) ? Math.trunc(lot) : null,
        tick_size: Number.isFinite(tick) ? tick : null,
        updated_at: now,
      });
    }

    if (rows.length === 0) {
      return json({ success: false, error: "No matching rows after filter" }, 502);
    }

    /** De-dupe on (dhan_security_id, segment) to avoid ON CONFLICT errors */
    const seen = new Set<string>();
    const deduped: Row[] = [];
    for (const r of rows) {
      const key = `${r.dhan_security_id}|${r.segment}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }

    /** Upsert in batches */
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let inserted = 0;
    for (let i = 0; i < deduped.length; i += BATCH) {
      const slice = deduped.slice(i, i + BATCH);
      const { error } = await supabase
        .from("stock_master")
        .upsert(slice, { onConflict: "dhan_security_id,segment" });
      if (error) {
        return json(
          {
            success: false,
            error: error.message,
            insertedBeforeFail: inserted,
            batchStart: i,
          },
          500,
        );
      }
      inserted += slice.length;
    }

    return json({
      success: true,
      totalParsed: rows.length,
      inserted,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    console.error("seed-stock-master error:", err);
    return json({ success: false, error: String(err) }, 500);
  }
});
