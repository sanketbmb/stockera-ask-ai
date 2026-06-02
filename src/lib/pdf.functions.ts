// PDF export pipeline — Browserless (Chrome) → Supabase Storage cache → signed URL.
// Single source of truth for SEBI firm details (see FIRM in src/lib/firm-details.ts).

import { createServerFn } from "@tanstack/react-start";
// (request-header helper removed — print origin no longer comes from the request host)
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { StockAnalysisPayload, QueryType } from "@/types/stock-analysis";

const HORIZONS = ["intraday", "medium-term", "long-term"] as const;
const SYMBOL_RE = /^[A-Z0-9._-]{1,20}$/;
const BUCKET = "pdf-cache";
const CACHE_TTL_SEC = 60 * 60; // 1 hour
const SIGNED_URL_TTL_SEC = 60 * 60;
// Browserless plans cap individual /pdf calls around 60s. Keep our wait
// budget comfortably under that so we never trip an upstream 408.
const BROWSERLESS_TIMEOUT_MS = 55_000;
const PRINT_READY_SELECTOR = "#print-ready, #print-error";
const TOKEN_TTL_SEC = 10 * 60;
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
  const secret = process.env.SB_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing SB_SERVICE_ROLE_KEY for PDF token signing");
  const json = JSON.stringify(payload);
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(json));
  return `${b64url(new TextEncoder().encode(json))}.${b64url(sig)}`;
}
async function verifyPrintToken<T>(token: string): Promise<T | null> {
  try {
    const [bodyB64, sigB64] = token.split(".");
    if (!bodyB64 || !sigB64) return null;
    const secret = process.env.SB_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
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
// Bump when the print template layout changes — invalidates stale cached PDFs.
// Phase 3C: bumped to v3 to invalidate Phase 2 cached PDFs alongside the
// new educational + sector cache-key shape.
const ANALYSIS_PDF_TEMPLATE_VERSION = "v3";
function cacheKeyFor(symbol: string, horizon: QueryType, includeNews: boolean): string {
  // Stock-report cache key — namespaced so it cannot collide with sector
  // (`sec_*`) or educational (`edu_*`) keys.
  return `stk_${symbol}_${horizon}_n${includeNews ? 1 : 0}_${ANALYSIS_PDF_TEMPLATE_VERSION}_${todayIST()}`;
}
// Browserless runs on the public internet — the print URL MUST be a
// publicly-reachable origin that doesn't require Lovable auth.
//
// The `id-preview--{id}.lovable.app` and `{id}.lovableproject.com` hosts
// are gated by the Lovable auth-bridge (302 → /auth-bridge) for any project
// that hasn't been published. Browserless can't pass that gate, so it sees
// a login page and times out waiting for #print-ready.
//
// The only reliably public host for a Lovable project is the published
// production URL: `project--{id}.lovable.app`. We prefer that. An explicit
// PUBLIC_PRINT_ORIGIN env var (set to any reachable URL) overrides.
const LOVABLE_PROJECT_ID = "ade3c248-761c-43a7-a732-1638e82a3239";
const PUBLIC_PRINT_FALLBACK = `https://project--${LOVABLE_PROJECT_ID}.lovable.app`;

function originFromRequest(): string {
  const envOrigin = process.env.PUBLIC_PRINT_ORIGIN;
  if (envOrigin) return envOrigin.replace(/\/$/, "");
  // Always use the stable published host — the request host (preview /
  // lovableproject) is auth-gated and unreachable to Browserless.
  return PUBLIC_PRINT_FALLBACK;
}

// Preflight: a HEAD request to the print URL with redirect:manual. If we
// see a 302 to lovable.dev/auth-bridge, the project is not published and
// Browserless cannot render it. Throw a clear, actionable error instead of
// waiting 55 seconds for an inevitable timeout.
async function ensurePrintUrlIsPublic(printUrl: string): Promise<void> {
  try {
    const res = await fetch(printUrl, { method: "GET", redirect: "manual" });
    const status = res.status;
    const location = res.headers.get("location") ?? "";
    if (status >= 300 && status < 400 && /lovable\.dev\/auth-bridge/i.test(location)) {
      throw new Error(
        "Preview is private. Publish the project (Publish button, top right) so the PDF service can reach your report. After publishing, click Download PDF again.",
      );
    }
    if (status === 403 || status === 401) {
      throw new Error(
        "Preview is not publicly accessible. Publish the project (Publish button, top right) so the PDF service can reach your report.",
      );
    }
    if (status === 404) {
      throw new Error(
        "Print page returned 404. Publish the project so the latest preview is deployed, then try again.",
      );
    }
  } catch (err) {
    // Network errors on preflight are non-fatal — let Browserless try.
    if (err instanceof Error && /^Preview is|^Print page/i.test(err.message)) throw err;
    console.warn("[pdf] preflight check failed (non-fatal):", err);
  }
}
async function callOrchestrator(symbol: string, horizon: QueryType, includeNews: boolean): Promise<StockAnalysisPayload> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SB_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
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
      await ensurePrintUrlIsPublic(printUrl);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), BROWSERLESS_TIMEOUT_MS + 5_000);
      const browserlessRes = await fetch(
        `https://chrome.browserless.io/pdf?token=${encodeURIComponent(browserlessToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            url: printUrl,
            gotoOptions: { waitUntil: "domcontentloaded", timeout: BROWSERLESS_TIMEOUT_MS },
            waitForSelector: { selector: PRINT_READY_SELECTOR, timeout: BROWSERLESS_TIMEOUT_MS },
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

// ─────────────────────────────────────────────────────────────────
// ARCHITECTURE ENCYCLOPEDIA PDF (admin-gated, static doc)
// ─────────────────────────────────────────────────────────────────

import {
  DOC_VERSION,
  architecturePdfFilename,
  ACCURACY_ROADMAP_VERSION,
  accuracyRoadmapPdfFilename,
} from "@/lib/doc-version";


export const generateArchitecturePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const startedAt = Date.now();
    const today = todayIST();
    const cache_key = `architecture_v${DOC_VERSION}_${today}`;
    const filename = architecturePdfFilename();
    const objectPath = `${cache_key}.pdf`;

    // 1. Cache check.
    try {
      const since = new Date(Date.now() - CACHE_TTL_SEC * 1000).toISOString();
      const { data: cachedRow } = await supabaseAdmin
        .from("pdf_generation_log")
        .select("created_at")
        .eq("cache_key", cache_key)
        .eq("success", true)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cachedRow) {
        const { data: signed } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC, { download: filename });
        if (signed?.signedUrl) {
          return { ok: true as const, url: signed.signedUrl, filename, cache_hit: true };
        }
      }
    } catch (e) {
      console.warn("[pdf-arch] cache lookup failed (non-fatal):", e);
    }

    // 2. Build print URL (public route, no token needed).
    const origin = originFromRequest();
    const printUrl = `${origin}/docs/architecture/print`;

    // 3. Browserless call.
    const browserlessToken = process.env.BROWSERLESS_TOKEN;
    if (!browserlessToken) {
      throw new Error("PDF service is not configured. Please contact support.");
    }

    let pdfBytes: ArrayBuffer;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), BROWSERLESS_TIMEOUT_MS + 5_000);
      const res = await fetch(
        `https://chrome.browserless.io/pdf?token=${encodeURIComponent(browserlessToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            url: printUrl,
            gotoOptions: { waitUntil: "domcontentloaded", timeout: BROWSERLESS_TIMEOUT_MS },
            waitForSelector: { selector: PRINT_READY_SELECTOR, timeout: BROWSERLESS_TIMEOUT_MS },
            options: {
              format: "A4",
              printBackground: true,
              preferCSSPageSize: true,
              displayHeaderFooter: false,
              margin: { top: "0", bottom: "0", left: "0", right: "0" },
            },
          }),
        },
      );
      clearTimeout(timer);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Browserless HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      pdfBytes = await res.arrayBuffer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`PDF generation failed: ${msg}`);
    }

    // 4. Upload + sign.
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(objectPath, new Uint8Array(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
        cacheControl: `${CACHE_TTL_SEC}`,
      });
    if (uploadErr) throw new Error(`PDF upload failed: ${uploadErr.message}`);

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC, { download: filename });
    if (signErr || !signed?.signedUrl) throw new Error("Could not create download URL for PDF");

    // 5. Log success.
    try {
      await supabaseAdmin.from("pdf_generation_log").insert({
        symbol: "__ARCH__",
        horizon: "long-term",
        include_news: false,
        as_of_date: today,
        cache_key,
        duration_ms: Date.now() - startedAt,
        success: true,
        cache_hit: false,
        user_id: context.userId,
      });
    } catch (e) {
      console.warn("[pdf-arch] log insert failed:", e);
    }

    return { ok: true as const, url: signed.signedUrl, filename, cache_hit: false };
  });

// ─────────────────────────────────────────────────────────────────
// ACCURACY ROADMAP PDF (admin-gated, static doc)
// ─────────────────────────────────────────────────────────────────

export const generateAccuracyRoadmapPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const startedAt = Date.now();
    const today = todayIST();
    const cache_key = `accuracy_roadmap_v${ACCURACY_ROADMAP_VERSION}_${today}`;
    const filename = accuracyRoadmapPdfFilename();
    const objectPath = `${cache_key}.pdf`;

    // 1. Cache check.
    try {
      const since = new Date(Date.now() - CACHE_TTL_SEC * 1000).toISOString();
      const { data: cachedRow } = await supabaseAdmin
        .from("pdf_generation_log")
        .select("created_at")
        .eq("cache_key", cache_key)
        .eq("success", true)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cachedRow) {
        const { data: signed } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC, { download: filename });
        if (signed?.signedUrl) {
          return { ok: true as const, url: signed.signedUrl, filename, cache_hit: true };
        }
      }
    } catch (e) {
      console.warn("[pdf-acc] cache lookup failed (non-fatal):", e);
    }

    // 2. Build print URL.
    const origin = originFromRequest();
    const printUrl = `${origin}/docs/accuracy-roadmap/print`;

    // 3. Browserless call.
    const browserlessToken = process.env.BROWSERLESS_TOKEN;
    if (!browserlessToken) {
      throw new Error("PDF service is not configured. Please contact support.");
    }

    let pdfBytes: ArrayBuffer;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), BROWSERLESS_TIMEOUT_MS + 5_000);
      const res = await fetch(
        `https://chrome.browserless.io/pdf?token=${encodeURIComponent(browserlessToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            url: printUrl,
            gotoOptions: { waitUntil: "domcontentloaded", timeout: BROWSERLESS_TIMEOUT_MS },
            waitForSelector: { selector: PRINT_READY_SELECTOR, timeout: BROWSERLESS_TIMEOUT_MS },
            options: {
              format: "A4",
              printBackground: true,
              preferCSSPageSize: true,
              displayHeaderFooter: false,
              margin: { top: "0", bottom: "0", left: "0", right: "0" },
            },
          }),
        },
      );
      clearTimeout(timer);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Browserless HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      pdfBytes = await res.arrayBuffer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`PDF generation failed: ${msg}`);
    }

    // 4. Upload + sign.
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(objectPath, new Uint8Array(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
        cacheControl: `${CACHE_TTL_SEC}`,
      });
    if (uploadErr) throw new Error(`PDF upload failed: ${uploadErr.message}`);

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC, { download: filename });
    if (signErr || !signed?.signedUrl) throw new Error("Could not create download URL for PDF");

    // 5. Log success.
    try {
      await supabaseAdmin.from("pdf_generation_log").insert({
        symbol: "__ACC_ROADMAP__",
        horizon: "long-term",
        include_news: false,
        as_of_date: today,
        cache_key,
        duration_ms: Date.now() - startedAt,
        success: true,
        cache_hit: false,
        user_id: context.userId,
      });
    } catch (e) {
      console.warn("[pdf-acc] log insert failed:", e);
    }

    return { ok: true as const, url: signed.signedUrl, filename, cache_hit: false };
  });

// ─────────────────────────────────────────────────────────────────
// SECTOR + EDUCATIONAL — kinded print tokens + PDF server fns.
// Cache keys are namespaced (`sec_*` / `edu_*`) to avoid colliding
// with the stock cache (`stk_*`).
// ─────────────────────────────────────────────────────────────────

const SECTOR_PDF_TEMPLATE_VERSION = "v1";
const EDUCATIONAL_PDF_TEMPLATE_VERSION = "v1";
const STOCK_UNIFIED_PDF_TEMPLATE_VERSION = "v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cacheKeyForSector(queryId: string): string {
  return `sec_${queryId}_${SECTOR_PDF_TEMPLATE_VERSION}_${todayIST()}`;
}
function cacheKeyForEducational(queryId: string): string {
  return `edu_${queryId}_${EDUCATIONAL_PDF_TEMPLATE_VERSION}_${todayIST()}`;
}
function cacheKeyForUnifiedStock(queryId: string, horizon: QueryType): string {
  return `stk_q_${queryId}_${horizon}_${STOCK_UNIFIED_PDF_TEMPLATE_VERSION}_${todayIST()}`;
}

const KindedTokenSchema = z.object({
  kind: z.enum(["sector", "educational", "stock_unified"]),
  queryId: z.string().regex(UUID_RE),
  exp: z.number(),
});
export type KindedPrintToken = z.infer<typeof KindedTokenSchema>;

export async function verifyKindedPrintToken(
  token: string,
  expectedKind: "sector" | "educational" | "stock_unified",
  expectedQueryId: string,
): Promise<boolean> {
  const v = await verifyPrintToken<KindedPrintToken>(token);
  if (!v) return false;
  if (v.kind !== expectedKind) return false;
  if (v.queryId !== expectedQueryId) return false;
  return true;
}


async function callBrowserlessForUrl(printUrl: string, label: string): Promise<ArrayBuffer> {
  const browserlessToken = process.env.BROWSERLESS_TOKEN;
  if (!browserlessToken) throw new Error("PDF service is not configured. Please contact support.");
  // Preflight — fail fast with a clear error if the preview is auth-gated.
  await ensurePrintUrlIsPublic(printUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BROWSERLESS_TIMEOUT_MS + 5_000);
  try {
    const res = await fetch(
      `https://chrome.browserless.io/pdf?token=${encodeURIComponent(browserlessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          url: printUrl,
          gotoOptions: { waitUntil: "domcontentloaded", timeout: BROWSERLESS_TIMEOUT_MS },
          waitForSelector: { selector: PRINT_READY_SELECTOR, timeout: BROWSERLESS_TIMEOUT_MS },
          options: {
            format: "A4",
            printBackground: true,
            preferCSSPageSize: false,
            displayHeaderFooter: true,
            margin: { top: "18mm", bottom: "18mm", left: "12mm", right: "12mm" },
            headerTemplate: `<div style="font-size:8px;color:#888;width:100%;padding:0 12mm;display:flex;justify-content:space-between;"><span>${label}</span><span>${todayIST()}</span></div>`,
            footerTemplate: `<div style="font-size:8px;color:#888;width:100%;padding:0 12mm;display:flex;justify-content:space-between;"><span>Educational only — not SEBI investment advice.</span><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
          },
        }),
      },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Browserless HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    return await res.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

async function logKindedAttempt(
  cache_key: string,
  symbolLabel: string,
  startedAt: number,
  success: boolean,
  cache_hit: boolean,
  error_message: string | null,
  user_id: string | null,
) {
  try {
    await supabaseAdmin.from("pdf_generation_log").insert({
      symbol: symbolLabel,
      horizon: "long-term",
      include_news: false,
      as_of_date: todayIST(),
      cache_key,
      duration_ms: Date.now() - startedAt,
      success,
      cache_hit,
      error_message,
      user_id,
    });
  } catch (e) {
    console.error("[pdf-kinded] log insert failed:", e);
  }
}

async function lookupKindedCache(cache_key: string, objectPath: string, filename: string) {
  try {
    const since = new Date(Date.now() - CACHE_TTL_SEC * 1000).toISOString();
    const { data: cachedRow } = await supabaseAdmin
      .from("pdf_generation_log")
      .select("created_at")
      .eq("cache_key", cache_key)
      .eq("success", true)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cachedRow) return null;
    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC, { download: filename });
    return signed?.signedUrl ?? null;
  } catch (e) {
    console.warn("[pdf-kinded] cache lookup failed (non-fatal):", e);
    return null;
  }
}

export const generateSectorPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ queryId: z.string().regex(UUID_RE) }).parse(input))
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();
    const key = cacheKeyForSector(data.queryId);
    const filename = `Stockera_Sector_${data.queryId.slice(0, 8)}_${todayIST()}.pdf`;
    const objectPath = `${key}.pdf`;

    // Authz — the requesting user must own this query.
    const { data: row, error: rowErr } = await supabaseAdmin
      .from("queries")
      .select("user_id, query_type")
      .eq("id", data.queryId)
      .single();
    if (rowErr || !row) throw new Error("Query not found");
    if (row.user_id !== context.userId) throw new Error("Not authorized");
    if (row.query_type !== "sector_view") throw new Error("Not a sector_view query");

    const cachedUrl = await lookupKindedCache(key, objectPath, filename);
    if (cachedUrl) {
      await logKindedAttempt(key, "__SECTOR__", startedAt, true, true, null, context.userId);
      return { ok: true as const, url: cachedUrl, filename, cache_hit: true };
    }

    const token = await signPrintToken({
      kind: "sector",
      queryId: data.queryId,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
    });
    const origin = originFromRequest();
    const printUrl = `${origin}/print-sector/${encodeURIComponent(data.queryId)}?token=${encodeURIComponent(token)}`;

    let pdfBytes: ArrayBuffer;
    try {
      pdfBytes = await callBrowserlessForUrl(printUrl, "Stockera Sector View");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logKindedAttempt(key, "__SECTOR__", startedAt, false, false, msg, context.userId);
      throw new Error(`PDF generation failed: ${msg}`);
    }

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(objectPath, new Uint8Array(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
        cacheControl: `${CACHE_TTL_SEC}`,
      });
    if (uploadErr) {
      await logKindedAttempt(key, "__SECTOR__", startedAt, false, false, `Upload: ${uploadErr.message}`, context.userId);
      throw new Error(`PDF upload failed: ${uploadErr.message}`);
    }

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC, { download: filename });
    if (signErr || !signed?.signedUrl) {
      await logKindedAttempt(key, "__SECTOR__", startedAt, false, false, "Sign URL failed", context.userId);
      throw new Error("Could not create download URL for PDF");
    }

    await logKindedAttempt(key, "__SECTOR__", startedAt, true, false, null, context.userId);
    await maybeWarnQuota();
    return { ok: true as const, url: signed.signedUrl, filename, cache_hit: false };
  });

export const generateEducationalPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ queryId: z.string().regex(UUID_RE) }).parse(input))
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();
    const key = cacheKeyForEducational(data.queryId);
    const filename = `Stockera_Concept_${data.queryId.slice(0, 8)}_${todayIST()}.pdf`;
    const objectPath = `${key}.pdf`;

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("queries")
      .select("user_id, query_type")
      .eq("id", data.queryId)
      .single();
    if (rowErr || !row) throw new Error("Query not found");
    if (row.user_id !== context.userId) throw new Error("Not authorized");
    if (row.query_type !== "educational") throw new Error("Not an educational query");

    const cachedUrl = await lookupKindedCache(key, objectPath, filename);
    if (cachedUrl) {
      await logKindedAttempt(key, "__EDUCATIONAL__", startedAt, true, true, null, context.userId);
      return { ok: true as const, url: cachedUrl, filename, cache_hit: true };
    }

    const token = await signPrintToken({
      kind: "educational",
      queryId: data.queryId,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
    });
    const origin = originFromRequest();
    const printUrl = `${origin}/print-educational/${encodeURIComponent(data.queryId)}?token=${encodeURIComponent(token)}`;

    let pdfBytes: ArrayBuffer;
    try {
      pdfBytes = await callBrowserlessForUrl(printUrl, "Stockera Concept Brief");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logKindedAttempt(key, "__EDUCATIONAL__", startedAt, false, false, msg, context.userId);
      throw new Error(`PDF generation failed: ${msg}`);
    }

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(objectPath, new Uint8Array(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
        cacheControl: `${CACHE_TTL_SEC}`,
      });
    if (uploadErr) {
      await logKindedAttempt(key, "__EDUCATIONAL__", startedAt, false, false, `Upload: ${uploadErr.message}`, context.userId);
      throw new Error(`PDF upload failed: ${uploadErr.message}`);
    }

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC, { download: filename });
    if (signErr || !signed?.signedUrl) {
      await logKindedAttempt(key, "__EDUCATIONAL__", startedAt, false, false, "Sign URL failed", context.userId);
      throw new Error("Could not create download URL for PDF");
    }

    await logKindedAttempt(key, "__EDUCATIONAL__", startedAt, true, false, null, context.userId);
    await maybeWarnQuota();
    return { ok: true as const, url: signed.signedUrl, filename, cache_hit: false };
  });

// Public, token-gated payload fetchers used by the print routes.
// These do NOT require user auth — Browserless calls them anonymously
// using the short-lived HMAC token signed by the PDF generators above.

export const getPrintSectorPayload = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      queryId: z.string().regex(UUID_RE),
      token: z.string().min(10).max(4000),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const ok = await verifyKindedPrintToken(data.token, "sector", data.queryId);
    if (!ok) throw new Error("Invalid or expired print token");
    const { data: row, error } = await supabaseAdmin
      .from("queries")
      .select("ai_report, query_text, custom_question, engine_version")
      .eq("id", data.queryId)
      .single();
    if (error || !row) throw new Error("Query not found");
    if (row.engine_version !== "v1_sector_view" || !row.ai_report) {
      throw new Error("Sector report is not frozen yet");
    }
    return {
      payload: row.ai_report,
      rawQuestion: (row.query_text ?? row.custom_question ?? "") as string,
    };
  });

export const getPrintEducationalPayload = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      queryId: z.string().regex(UUID_RE),
      token: z.string().min(10).max(4000),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const ok = await verifyKindedPrintToken(data.token, "educational", data.queryId);
    if (!ok) throw new Error("Invalid or expired print token");
    const { data: row, error } = await supabaseAdmin
      .from("queries")
      .select("ai_report, query_text, custom_question, engine_version")
      .eq("id", data.queryId)
      .single();
    if (error || !row) throw new Error("Query not found");
    if (row.engine_version !== "v1_educational" || !row.ai_report) {
      throw new Error("Educational report is not frozen yet");
    }
    return {
      payload: row.ai_report,
      rawQuestion: (row.query_text ?? row.custom_question ?? "") as string,
    };
  });

// ─────────────────────────────────────────────────────────────────
// UNIFIED STOCK (frozen artifact) — used by /report/$queryId stock PDFs.
// Reads queries.ai_report directly; never calls the live orchestrator.
// ─────────────────────────────────────────────────────────────────

export const generateUnifiedStockPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ queryId: z.string().regex(UUID_RE) }).parse(input))
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("queries")
      .select("user_id, query_type, engine_version, ai_report, stock_symbol, stock_name, horizon")
      .eq("id", data.queryId)
      .single();
    if (rowErr || !row) throw new Error("Query not found");
    if (row.user_id !== context.userId) throw new Error("Not authorized");
    if (row.engine_version !== "v1_tier_shaped" || !row.ai_report) {
      throw new Error("Stock report is not frozen yet");
    }

    const symbol = (row.stock_symbol ?? row.stock_name ?? "STOCK").toString().toUpperCase();
    const horizonRaw = (row.horizon ?? "medium-term") as string;
    const horizon: QueryType = (HORIZONS as readonly string[]).includes(horizonRaw)
      ? (horizonRaw as QueryType)
      : "medium-term";

    const key = cacheKeyForUnifiedStock(data.queryId, horizon);
    const filename = `Stockera_Analysis_${symbol}_${horizon}_${todayIST()}.pdf`;
    const objectPath = `${key}.pdf`;

    const cachedUrl = await lookupKindedCache(key, objectPath, filename);
    if (cachedUrl) {
      await logKindedAttempt(key, symbol, startedAt, true, true, null, context.userId);
      return { ok: true as const, url: cachedUrl, filename, cache_hit: true };
    }

    const token = await signPrintToken({
      kind: "stock_unified",
      queryId: data.queryId,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
    });
    const origin = originFromRequest();
    const printUrl = `${origin}/print-stock/${encodeURIComponent(data.queryId)}?token=${encodeURIComponent(token)}`;
    console.log(`[pdf-stock-unified] queryId=${data.queryId} symbol=${symbol} horizon=${horizon} print=${printUrl.replace(/token=[^&]+/, "token=***")}`);

    let pdfBytes: ArrayBuffer;
    try {
      pdfBytes = await callBrowserlessForUrl(printUrl, `Stockera Analysis — ${symbol}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logKindedAttempt(key, symbol, startedAt, false, false, msg, context.userId);
      throw new Error(`PDF generation failed: ${msg}`);
    }

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(objectPath, new Uint8Array(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
        cacheControl: `${CACHE_TTL_SEC}`,
      });
    if (uploadErr) {
      await logKindedAttempt(key, symbol, startedAt, false, false, `Upload: ${uploadErr.message}`, context.userId);
      throw new Error(`PDF upload failed: ${uploadErr.message}`);
    }

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC, { download: filename });
    if (signErr || !signed?.signedUrl) {
      await logKindedAttempt(key, symbol, startedAt, false, false, "Sign URL failed", context.userId);
      throw new Error("Could not create download URL for PDF");
    }

    await logKindedAttempt(key, symbol, startedAt, true, false, null, context.userId);
    await maybeWarnQuota();
    const dur = Date.now() - startedAt;
    console.log(`[pdf-stock-unified] success queryId=${data.queryId} duration_ms=${dur}`);
    return { ok: true as const, url: signed.signedUrl, filename, cache_hit: false };
  });

export const getPrintUnifiedStockPayload = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      queryId: z.string().regex(UUID_RE),
      token: z.string().min(10).max(4000),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const ok = await verifyKindedPrintToken(data.token, "stock_unified", data.queryId);
    if (!ok) throw new Error("Invalid or expired print token");
    const { data: row, error } = await supabaseAdmin
      .from("queries")
      .select("ai_report, query_text, custom_question, engine_version, stock_symbol, stock_name, horizon")
      .eq("id", data.queryId)
      .single();
    if (error || !row) throw new Error("Query not found");
    if (row.engine_version !== "v1_tier_shaped" || !row.ai_report) {
      throw new Error("Stock report is not frozen yet");
    }
    const symbol = (row.stock_symbol ?? row.stock_name ?? "STOCK").toString().toUpperCase();
    const horizonRaw = (row.horizon ?? "medium-term") as string;
    const horizon: QueryType = (HORIZONS as readonly string[]).includes(horizonRaw)
      ? (horizonRaw as QueryType)
      : "medium-term";
    return {
      payload: row.ai_report,
      rawQuestion: (row.custom_question ?? row.query_text ?? "") as string,
      symbol,
      horizon,
    };
  });


