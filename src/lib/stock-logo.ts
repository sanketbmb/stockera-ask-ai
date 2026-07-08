// SEO STAGE B — pure client-safe helpers for stock logos.
// No React, no supabase, no fetch. Deterministic.

export const STOCK_LOGO_ORIGIN = "";

function sanitize(symbol: string | null | undefined): string {
  return (symbol ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function toBase64(s: string): string {
  // SSR-safe base64: prefer btoa in the browser, Buffer on the server.
  if (typeof btoa === "function") {
    // btoa accepts latin1 only; escape unicode first.
    return btoa(unescape(encodeURIComponent(s)));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B = (globalThis as any).Buffer;
  if (B) return B.from(s, "utf-8").toString("base64");
  return "";
}

export function initialsDataUrl(symbol: string | null | undefined): string {
  const s = sanitize(symbol) || "?";
  const letters = s.slice(0, 2);
  const hue = hashCode(s) % 360;
  const bg = `hsl(${hue}, 65%, 45%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="24" fill="${bg}"/><text x="50%" y="50%" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="90" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">${letters}</text></svg>`;
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

export function stockLogoSrc(symbol: string | null | undefined): string {
  const s = sanitize(symbol);
  if (!s) return initialsDataUrl("?");
  return `/api/logo/${s}`;
}
