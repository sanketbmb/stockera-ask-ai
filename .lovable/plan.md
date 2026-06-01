## Root cause — both bugs are the same bug

`originFromRequest()` (src/lib/pdf.functions.ts:86–90) builds the print URL from the **incoming request's `host` header**:

```ts
const host = getRequestHeader("host") ?? `id-preview--ade3c248-….lovable.app`;
const proto = getRequestHeader("x-forwarded-proto") ?? "https";
return `${proto}://${host}`;
```

In the preview sandbox the server function is invoked at `https://localhost:8080/_serverFn/...` (confirmed by the runtime stack trace: `Page URL: https://localhost:8080/_serverFn/...generateAccuracyRoadmapPdf`). So:

- `host` header = `localhost:8080`
- printUrl handed to Browserless = **`https://localhost:8080/docs/accuracy-roadmap/print`**

Browserless runs on `chrome.browserless.io` (public internet). It tries to navigate Chrome to `https://localhost:8080/...`, which resolves to Browserless's own loopback — there's nothing there, the navigation aborts mid-flight, and Browserless reports the famous Puppeteer error **`Navigating frame was detached`**. Same 500 you're seeing.

All three generators (`generateAnalysisPdf` line 208, `generateArchitecturePdf` line 381, `generateAccuracyRoadmapPdf` line 498) call `originFromRequest()`. So every single PDF goes through the broken origin path in preview/dev.

### Why "Volume I works"
Architecture PDF was generated successfully earlier (when you accessed the project via the public `id-preview--…lovable.app` URL — at that time `host` was correct). Its cache key `architecture_v1.0_${todayIST()}` matched a successful row in `pdf_generation_log`, so the cache hit at lines 357–375 returned the cached signed URL **without ever calling Browserless**. The accuracy roadmap has no cached entry yet (different cache key, fresh today), so it actually hit Browserless and exposed the bug.

### Why AI Report PDFs regressed
Same mechanism. The cache key is `${symbol}_${horizon}_n${0|1}_${todayIST()}`. Any symbol+horizon combination you hadn't already cached for today now goes through Browserless with `https://localhost:8080/...` and dies the same way. Nothing in Part D touched the analysis PDF code directly — but Part D shifted the day's traffic onto fresh combinations, so the bug that was always latent in dev/preview became visible.

### Secondary nit (not the root cause, but worth flagging)
`waitUntil: "networkidle0"` + `waitForSelector: "#print-ready"` with both at 30s, while the `AbortController` is also 30s, means a Browserless run that takes exactly the timeout to download fonts will abort the outer fetch rather than letting Browserless return a clean error. Not the cause of "Navigating frame was detached", but worth tightening when we touch this.

## Files involved
- `src/lib/pdf.functions.ts:86–90` — `originFromRequest()` (the bug)
- `src/lib/pdf.functions.ts:208, 381, 498` — three call sites
- `src/routes/docs.accuracy-roadmap.print.tsx` — fine, no auth gate, renders `print-ready`
- `src/routes/docs.architecture.print.tsx` — fine, identical pattern
- `src/components/docs/AccuracyRoadmap.tsx:678–706` — renders `#print-ready`, fine
- No shared helper regressed; no auth/noindex guard issue; `waitUntil`/timeout identical across all three generators

## Ranked fix options

### Option A (RECOMMENDED) — Always use a public, Browserless-reachable origin
Change `originFromRequest()` to **prefer a publicly-reachable origin** and only trust the request host when it's already public:

```ts
const PUBLIC_PRINT_FALLBACK = `https://id-preview--ade3c248-761c-43a7-a732-1638e82a3239.lovable.app`;

function publicPrintOrigin(): string {
  // 1. Explicit env override (set this once we publish or move domains)
  const envOrigin = process.env.PUBLIC_PRINT_ORIGIN;
  if (envOrigin) return envOrigin.replace(/\/$/, "");

  // 2. Use the request host ONLY if it's clearly a public URL Browserless can reach
  const host = getRequestHeader("host") ?? "";
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  const isLocal = /^(localhost|127\.|0\.0\.0\.0|::1)/i.test(host);
  if (host && !isLocal) return `${proto}://${host}`;

  // 3. Fall back to the stable preview URL
  return PUBLIC_PRINT_FALLBACK;
}
```

- **Pros**: Fixes all three generators with one change. No new infra. Works in preview *and* production. Cache keys unchanged, no DB migration.
- **Cons**: The hardcoded preview URL is still hardcoded. Mitigated by the `PUBLIC_PRINT_ORIGIN` env override — when we publish to `project--ade3c248-….lovable.app` or a custom domain, set the secret once and the code adapts.
- **Verification**: After fix, click "Generate Volume II" → Browserless navigates to the public preview URL → returns PDF. Click an AI report PDF for a never-cached symbol → same.

### Option B — Send HTML directly to Browserless (`html` payload, no public URL needed)
Browserless accepts `{ html: "<full doc string>" }` instead of `{ url }`. We'd render the React tree to a string server-side (renderToString) and ship the HTML.

- **Pros**: No dependence on a publicly-reachable URL — works on `localhost`, any environment, any future hosting platform.
- **Cons**: Much bigger lift. Need to inline the print-encyclopedia CSS, fonts, and SVGs into the HTML string. Need a server-only renderer for `AccuracyRoadmap`/`ArchitectureEncyclopedia` components. The analysis PDF additionally depends on the orchestrator data that the print route currently fetches client-side — we'd need to thread that through SSR. High risk of subtle font/CSS regressions.
- **Verdict**: Right answer long-term, wrong answer for an urgent fix.

### Option C — Inline CSS @page-rendered PDF from a pure HTML template (no Browserless)
Drop Browserless entirely for the two static docs. Generate the static PDFs once at build time, store them in the bucket, serve from cache.

- **Pros**: Zero per-render cost; no Browserless dependency for docs.
- **Cons**: Doesn't help the AI report PDFs (those are dynamic per-symbol). Adds a build-time step. Doesn't match the existing pipeline. Out of scope for the bug we're fixing.

## Recommendation
**Ship Option A** as the single-file fix. Add `PUBLIC_PRINT_ORIGIN` to the documented secrets list so we can override per-environment when we publish, but don't require it — the localhost detection + hardcoded preview fallback covers dev/preview today.

While I'm in the file, also tighten the secondary nit:
- Make the AbortController timeout `BROWSERLESS_TIMEOUT_MS + 5_000` so Browserless's internal timeout fires first with a clean error rather than the outer fetch aborting.

## Out of scope
- No changes to `/docs/accuracy-roadmap/print`, `/docs/architecture/print`, the components, or the print stylesheet — they're correct.
- No new Edge Functions, no schema migration, no auth changes.
- Cache rows for today already keyed `accuracy_roadmap_v1.0_YYYYMMDD` will retry on next click (the previous failure was never logged with `success=true`, so the cache check correctly misses).

Awaiting your approval before editing.
