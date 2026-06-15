/**
 * W2 — Analytics Seam
 *
 * Client-side analytics helper. Writes events to public.analytics_events via
 * the supabase browser client. SSR-safe: all window/document/localStorage/
 * navigator access is guarded. No PII (no raw IP, no ip_hash) is produced
 * here; the DB layer is responsible for any server-side enrichment.
 *
 * Public surface:
 *   - getAnalyticsSessionId()
 *   - getFirstTouchAttribution()
 *   - track(eventName, props?)
 *   - trackPageView(props?)
 */

import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnalyticsEventName =
  | "page_view"
  | "signup_started"
  | "signup_completed"
  | "login_started"
  | "login_completed"
  | "query_submitted"
  | "report_viewed"
  | "report_shared"
  | "paywall_shown"
  | "paywall_dismissed"
  | "checkout_started"
  | "checkout_completed"
  | "checkout_failed"
  | "wallet_topup_started"
  | "wallet_topup_completed"
  | "welcome_bonus_granted"
  | "first_topup_bonus_granted"
  | "subscription_changed";

export type AnalyticsProps = Record<string, unknown>;

export interface FirstTouchAttribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
}

interface AnalyticsRow {
  user_id: string | null;
  session_id: string;
  event_name: string;
  event_props: AnalyticsProps;
  page_path: string | null;
  referrer: string | null;
  user_agent: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_KEY = "stx_analytics_session_id";
const FIRST_TOUCH_KEY = "stx_analytics_first_touch";
const LAST_PAGE_KEY = "stx_analytics_last_page";
const BATCH_FLUSH_MS = 2000;
const BATCH_MAX_SIZE = 10;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let queue: AnalyticsRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight = false;
let pagehideBound = false;

// ---------------------------------------------------------------------------
// Environment guards
// ---------------------------------------------------------------------------

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function devWarn(message: string, err?: unknown): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[analytics] ${message}`, err);
  }
}

function safeStorageGet(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore quota / privacy mode errors */
  }
}

// ---------------------------------------------------------------------------
// Session id
// ---------------------------------------------------------------------------

function generateId(): string {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  // RFC4122-ish fallback. Not cryptographically strong but fine for a session id.
  const rand = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return `${rand()}-${rand().slice(0, 4)}-4${rand().slice(0, 3)}-a${rand().slice(0, 3)}-${rand()}${rand().slice(0, 4)}`;
}

function getOrCreateSessionId(): string {
  if (!isBrowser()) return "ssr";
  const existing = safeStorageGet(SESSION_KEY);
  if (existing && existing.length > 0) return existing;
  const fresh = generateId();
  safeStorageSet(SESSION_KEY, fresh);
  return fresh;
}

export function getAnalyticsSessionId(): string {
  return getOrCreateSessionId();
}

// ---------------------------------------------------------------------------
// First-touch attribution
// ---------------------------------------------------------------------------

function parseCurrentUtm(): FirstTouchAttribution {
  const empty: FirstTouchAttribution = {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null,
  };
  if (!isBrowser()) return empty;
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      utm_term: params.get("utm_term"),
      utm_content: params.get("utm_content"),
    };
  } catch {
    return empty;
  }
}

function captureFirstTouch(): FirstTouchAttribution {
  const empty: FirstTouchAttribution = {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null,
  };
  if (!isBrowser()) return empty;

  const stored = safeStorageGet(FIRST_TOUCH_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<FirstTouchAttribution>;
      return {
        utm_source: parsed.utm_source ?? null,
        utm_medium: parsed.utm_medium ?? null,
        utm_campaign: parsed.utm_campaign ?? null,
        utm_term: parsed.utm_term ?? null,
        utm_content: parsed.utm_content ?? null,
      };
    } catch {
      /* fall through and recompute */
    }
  }

  const current = parseCurrentUtm();
  const hasAny =
    current.utm_source ||
    current.utm_medium ||
    current.utm_campaign ||
    current.utm_term ||
    current.utm_content;

  const toStore: FirstTouchAttribution = hasAny ? current : empty;
  try {
    safeStorageSet(FIRST_TOUCH_KEY, JSON.stringify(toStore));
  } catch {
    /* ignore */
  }
  return toStore;
}

export function getFirstTouchAttribution(): FirstTouchAttribution {
  return captureFirstTouch();
}

// ---------------------------------------------------------------------------
// Auth + browser metadata
// ---------------------------------------------------------------------------

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch (err) {
    devWarn("getSession failed", err);
    return null;
  }
}

function getUserAgent(): string | null {
  if (!isBrowser()) return null;
  try {
    return typeof navigator !== "undefined" && typeof navigator.userAgent === "string"
      ? navigator.userAgent
      : null;
  } catch {
    return null;
  }
}

function getBrowserMetadata(): AnalyticsProps {
  if (!isBrowser()) return {};
  const meta: AnalyticsProps = {};
  try {
    meta.path = window.location.pathname;
    meta.href = window.location.href;
    meta.title = document.title || null;
  } catch {
    /* ignore */
  }
  try {
    if (document.referrer) meta.referrer = document.referrer;
  } catch {
    /* ignore */
  }
  try {
    if (typeof window.innerWidth === "number" && typeof window.innerHeight === "number") {
      meta.viewport = { w: window.innerWidth, h: window.innerHeight };
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof screen !== "undefined" && screen) {
      meta.screen = { w: screen.width ?? null, h: screen.height ?? null };
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof navigator !== "undefined") {
      meta.language = navigator.language ?? null;
    }
  } catch {
    /* ignore */
  }
  try {
    meta.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    /* ignore */
  }
  const lastPage = safeStorageGet(LAST_PAGE_KEY);
  if (lastPage) meta.last_page = lastPage;
  return meta;
}

// ---------------------------------------------------------------------------
// Batching
// ---------------------------------------------------------------------------

function scheduleFlush(): void {
  if (!isBrowser()) return;
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, BATCH_FLUSH_MS);
}

async function flushQueue(): Promise<void> {
  if (flushInFlight) return;
  if (queue.length === 0) return;
  flushInFlight = true;
  const batch = queue;
  queue = [];
  try {
    const { error } = await supabase
      .from("analytics_events")
      .insert(batch as never);
    if (error) {
      devWarn("insert failed", error);
    }
  } catch (err) {
    devWarn("insert threw", err);
  } finally {
    flushInFlight = false;
  }
}

function ensureLifecycleHooks(): void {
  if (!isBrowser() || pagehideBound) return;
  pagehideBound = true;
  try {
    window.addEventListener(
      "pagehide",
      () => {
        if (flushTimer !== null) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        // Best-effort flush. Cannot await in a pagehide handler; the network
        // request may or may not complete depending on the browser.
        void flushQueue();
      },
      { capture: true },
    );
  } catch {
    /* ignore */
  }
}

function enqueueEvent(row: AnalyticsRow): void {
  queue.push(row);
  ensureLifecycleHooks();
  if (queue.length >= BATCH_MAX_SIZE) {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flushQueue();
    return;
  }
  scheduleFlush();
}

// ---------------------------------------------------------------------------
// Payload assembly
// ---------------------------------------------------------------------------

async function buildEventPayload(
  eventName: AnalyticsEventName,
  props: AnalyticsProps | undefined,
): Promise<AnalyticsRow> {
  const meta = getBrowserMetadata();
  const firstTouch = captureFirstTouch();
  const userId = await getCurrentUserId();

  const mergedProps: AnalyticsProps = {
    ...meta,
    ...(props ?? {}),
    first_touch: firstTouch,
  };

  const pagePath =
    typeof meta.path === "string"
      ? meta.path
      : isBrowser()
        ? (() => {
            try {
              return window.location.pathname;
            } catch {
              return null;
            }
          })()
        : null;

  const referrer = typeof mergedProps.referrer === "string" ? mergedProps.referrer : null;

  return {
    user_id: userId,
    session_id: getOrCreateSessionId(),
    event_name: eventName,
    event_props: mergedProps,
    page_path: pagePath,
    referrer,
    user_agent: getUserAgent(),
    utm_source: firstTouch.utm_source,
    utm_medium: firstTouch.utm_medium,
    utm_campaign: firstTouch.utm_campaign,
    utm_term: firstTouch.utm_term,
    utm_content: firstTouch.utm_content,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function track(
  eventName: AnalyticsEventName,
  props?: AnalyticsProps,
): Promise<void> {
  try {
    if (!isBrowser()) return;
    const row = await buildEventPayload(eventName, props);
    enqueueEvent(row);
  } catch (err) {
    devWarn("track failed", err);
  }
}

export async function trackPageView(props?: AnalyticsProps): Promise<void> {
  try {
    if (!isBrowser()) return;
    await track("page_view", props);
    try {
      safeStorageSet(LAST_PAGE_KEY, window.location.pathname);
    } catch {
      /* ignore */
    }
  } catch (err) {
    devWarn("trackPageView failed", err);
  }
}
