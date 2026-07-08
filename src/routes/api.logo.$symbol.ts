// SEO STAGE B — same-origin proxy for /api/logo/:symbol.
// Forwards to the stock-logo edge function so the browser (and OG scrapers)
// see a stable https://asktheexpert.in/api/logo/<SYMBOL> URL.
import { createFileRoute } from "@tanstack/react-router";
import { initialsDataUrl } from "@/lib/stock-logo";

const FALLBACK_SVG_ORIGIN = "https://asktheexpert.in/stockera-logo.png";

function sanitize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function fallbackResponse(symbol: string): Response {
  // 302 to inline SVG initials — the browser caches this on the requesting URL.
  const url = initialsDataUrl(symbol || "?");
  return new Response(null, {
    status: 302,
    headers: {
      Location: url || FALLBACK_SVG_ORIGIN,
      "Cache-Control": "public, max-age=3600",
      "X-Logo-Source": "initials",
    },
  });
}

export const Route = createFileRoute("/api/logo/$symbol")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const symbol = sanitize(params.symbol ?? "");
        if (!symbol) return fallbackResponse("?");
        try {
          const base = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
          if (!base) return fallbackResponse(symbol);
          const res = await fetch(`${base}/functions/v1/stock-logo/${symbol}`, {
            method: "GET",
            redirect: "follow",
          });
          if (!res.ok) return fallbackResponse(symbol);
          const buf = await res.arrayBuffer();
          const contentType = res.headers.get("content-type") ?? "image/png";
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
              "X-Logo-Source": res.headers.get("x-logo-source") ?? "proxy",
            },
          });
        } catch {
          return fallbackResponse(symbol);
        }
      },
    },
  },
});
