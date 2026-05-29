// PDF export pipeline — Browserless (Chrome) → Supabase Storage cache → signed URL.
// Single source of truth for SEBI firm details (see FIRM in src/lib/firm-details.ts).

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { StockAnalysisPayload, QueryType } from "@/types/stock-analysis";

const HORIZONS = ["intraday", "medium-term", "long-term"] as const;
const SYMBOL_RE = /^[A-Z0-9._-]{1,20}$/;
const BUCKET = "pdf-cache";
const CACHE_TTL_SEC = 60 * 60; // 1 hour
const SIGNED_URL_TTL_SEC = 60 * 60;
const BROWSERLESS_TIMEOUT_MS = 30_000;
const TOKEN_TTL_SEC = 5 * 60;
const QUOTA_WARN_THRESHOLD = 800;

// ─────────────────────────────────────────────────────────────────
// HMAC token (Web Crypto) — protects the public print route.
// Token format: base64url(payloadJson).base64url(hmacSha256)
// ─────────────────────────────────────────────────────────────────

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
async function signPrintToken(payload: object): Promise<string> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for PDF token signing");
  const json = JSON.stringify(payload);
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(json));
  return `${b64url(new TextEncoder().encode(json))}.${b64url(sig)}`;
}
async function verifyPrintToken<T>(token: string): Promise<T | null> {
  try {
    const [bodyB64, sigB64] = token.split(".");
    if (!bodyB64 || !sigB64) return null;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) return null;
    const key = await hmacKey(secret);
    const bodyBytes = b64urlDecode(bodyB64);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sigB64) as BufferSource, bodyBytes as BufferSource);
    if (!ok) return null;
    const obj = JSON.parse(new TextDecoder().decode(bodyBytes)) as { exp?: number };
    if (!obj.exp || obj.exp < Math.floor(Date.now() / 1000)) return null;
    return obj as T;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function todayIST(): string {
  // YYYY-MM-DD in IST (Asia/Kolkata)
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(new Date());
}
function cacheKeyFor(symbol: string, horizon: QueryType, includeNews: boolean): string {
  return `${symbol}_${horizon}_n${includeNews ? 1 : 0}_${todayIST()}`;
}
function originFromRequest(): string {
  const host = getRequestHeader("host") ?? `id-preview--ade3c248-761c-43a7-a732-1638e82a3239.lovable.app`;
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
async function callOrchestrator(symbol: string, horizon: QueryType, includeNews: boolean): Promise<StockAnalysisPayload> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase server env for orchestrator call");
  const res = await fetch(`${url}/functions/v1/generate-stock-analysis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ symbol, query_type: horizon, include_news: includeNews }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Orchestrator HTTP ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  if (!json?.success) throw new Error(`Orchestrator returned error: ${json?.error ?? "unknown"}`);
  return json as StockAnalysisPayload;
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC: Print payload fetcher (token-gated, used by /print route)
// ─────────────────────────────────────────────────────────────────

const PrintTokenSchema = z.object({
  symbol: z.string().regex(SYMBOL_RE),
  horizon: z.enum(HORIZONS),
  include_news: z.boolean(),
  exp: z.number(),
});

export const getPrintAnalysisPayload = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      symbol: z.string().regex(SYMBOL_RE),
      horizon: z.enum(HORIZONS),
      include_news: z.boolean(),
      token: z.string().min(10).max(2000),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const verified = await verifyPrintToken<z.infer<typeof PrintTokenSchema>>(data.token);
    if (!verified) throw new Error("Invalid or expired print token");
    if (
      verified.symbol !== data.symbol ||
      verified.horizon !== data.horizon ||
      verified.include_news !== data.include_news
    ) {
      throw new Error("Print token does not match requested parameters");
    }
    return callOrchestrator(data.symbol, data.horizon, data.include_news);
  });

// ─────────────────────────────────────────────────────────────────
// AUTHENTICATED: Generate PDF (cache → Browserless → upload → log)
// ─────────────────────────────────────────────────────────────────

export const generateAnalysisPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      symbol: z.string().regex(SYMBOL_RE),
      horizon: z.enum(HORIZONS),
      include_news: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();
    const key = cacheKeyFor(data.symbol, data.horizon, data.include_news);
    const filename = `Stockera_Analysis_${data.symbol}_${data.horizon}_${todayIST()}.pdf`;
    const objectPath = `${key}.pdf`;

    // 1. Cache check — look up the most recent successful generation row.
    try {
      const since = new Date(Date.now() - CACHE_TTL_SEC * 1000).toISOString();
      const { data: cachedRow } = await supabaseAdmin
        .from("pdf_generation_log")
        .select("created_at")
        .eq("cache_key", key)
        .eq("success", true)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cachedRow) {
        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC, { download: filename });
        if (!signErr && signed?.signedUrl) {
          await supabaseAdmin.from("pdf_generation_log").insert({
            symbol: data.symbol,
            horizon: data.horizon,
            include_news: data.include_news,
            as_of_date: todayIST(),
            cache_key: key,
            duration_ms: Date.now() - startedAt,
            success: true,
            cache_hit: true,
            user_id: context.userId,
          });
          return { ok: true as const, url: signed.signedUrl, filename, cache_hit: true };
        }
      }
    } catch (e) {
      console.warn("[pdf] cache lookup failed (non-fatal):", e);
    }

    // 2. Sign short-lived print token.
    const token = await signPrintToken({
      symbol: data.symbol,
      horizon: data.horizon,
      include_news: data.include_news,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
    });

    // 3. Build print URL on this deployment.
    const origin = originFromRequest();
    const printUrl =
      `${origin}/print/${encodeURIComponent(data.symbol)}` +
      `?horizon=${data.horizon}&news=${data.include_news ? 1 : 0}&token=${encodeURIComponent(token)}`;

    // 4. Call Browserless.
    const browserlessToken = process.env.BROWSERLESS_TOKEN;
    if (!browserlessToken) {
      await logAttempt(key, data, startedAt, false, false, "BROWSERLESS_TOKEN missing", context.userId);
      throw new Error("PDF service is not configured. Please contact support.");
    }

    let pdfBytes: ArrayBuffer;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), BROWSERLESS_TIMEOUT_MS);
      const browserlessRes = await fetch(
        `https://chrome.browserless.io/pdf?token=${encodeURIComponent(browserlessToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            url: printUrl,
            gotoOptions: { waitUntil: "networkidle0", timeout: BROWSERLESS_TIMEOUT_MS },
            waitForSelector: { selector: "#print-ready", timeout: BROWSERLESS_TIMEOUT_MS },
            options: {
              format: "A4",
              printBackground: true,
              preferCSSPageSize: false,
              displayHeaderFooter: true,
              margin: { top: "18mm", bottom: "18mm", left: "12mm", right: "12mm" },
              headerTemplate: `<div style="font-size:8px;color:#888;width:100%;padding:0 12mm;display:flex;justify-content:space-between;"><span>Stockera Analysis — ${data.symbol}</span><span>${todayIST()}</span></div>`,
              footerTemplate: `<div style="font-size:8px;color:#888;width:100%;padding:0 12mm;display:flex;justify-content:space-between;"><span>Educational only — not SEBI investment advice.</span><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
            },
          }),
        },
      );
      clearTimeout(timer);
      if (!browserlessRes.ok) {
        const txt = await browserlessRes.text().catch(() => "");
        throw new Error(`Browserless HTTP ${browserlessRes.status}: ${txt.slice(0, 200)}`);
      }
      pdfBytes = await browserlessRes.arrayBuffer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logAttempt(key, data, startedAt, false, false, msg, context.userId);
      throw new Error(`PDF generation failed: ${msg}`);
    }

    // 5. Upload to storage.
    try {
      const { error: uploadErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(objectPath, new Uint8Array(pdfBytes), {
          contentType: "application/pdf",
          upsert: true,
          cacheControl: `${CACHE_TTL_SEC}`,
        });
      if (uploadErr) throw uploadErr;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logAttempt(key, data, startedAt, false, false, `Upload failed: ${msg}`, context.userId);
      throw new Error(`PDF upload failed: ${msg}`);
    }

    // 6. Sign URL & log success.
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC, { download: filename });
    if (signErr || !signed?.signedUrl) {
      await logAttempt(key, data, startedAt, false, false, "Sign URL failed", context.userId);
      throw new Error("Could not create download URL for PDF");
    }

    await logAttempt(key, data, startedAt, true, false, null, context.userId);
    await maybeWarnQuota();

    return { ok: true as const, url: signed.signedUrl, filename, cache_hit: false };
  });

async function logAttempt(
  cache_key: string,
  data: { symbol: string; horizon: QueryType; include_news: boolean },
  startedAt: number,
  success: boolean,
  cache_hit: boolean,
  error_message: string | null,
  user_id: string | null,
) {
  try {
    await supabaseAdmin.from("pdf_generation_log").insert({
      symbol: data.symbol,
      horizon: data.horizon,
      include_news: data.include_news,
      as_of_date: todayIST(),
      cache_key,
      duration_ms: Date.now() - startedAt,
      success,
      cache_hit,
      error_message,
      user_id,
    });
  } catch (e) {
    console.error("[pdf] log insert failed:", e);
  }
}

async function maybeWarnQuota() {
  try {
    const firstOfMonth = new Date();
    firstOfMonth.setUTCDate(1);
    firstOfMonth.setUTCHours(0, 0, 0, 0);
    const { count } = await supabaseAdmin
      .from("pdf_generation_log")
      .select("id", { count: "exact", head: true })
      .eq("success", true)
      .eq("cache_hit", false)
      .gte("created_at", firstOfMonth.toISOString());
    if ((count ?? 0) >= QUOTA_WARN_THRESHOLD) {
      console.warn(`BROWSERLESS_BUDGET_WARNING: ${count} non-cache PDFs generated this month (threshold ${QUOTA_WARN_THRESHOLD}, ceiling 1000). Consider upgrading.`);
    }
  } catch (e) {
    console.warn("[pdf] quota check failed:", e);
  }
}
