// @ts-nocheck
// Stockera sitemap — SEO-5. GET-only. Public. No auth.
// Emits XML sitemap of static indexable routes + per-symbol library pages.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGIN = "https://asktheexpert.lovable.app";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const STATIC_URLS: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/pricing", changefreq: "monthly", priority: "0.9" },
  { path: "/faq", changefreq: "monthly", priority: "0.8" },
  { path: "/investor-charter", changefreq: "yearly", priority: "0.5" },
  { path: "/risk-disclosure", changefreq: "yearly", priority: "0.5" },
  { path: "/grievance-redressal", changefreq: "yearly", priority: "0.5" },
  { path: "/fee-schedule", changefreq: "yearly", priority: "0.5" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/sebi-compliance", changefreq: "yearly", priority: "0.4" },
];

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function staticBlock(): string {
  return STATIC_URLS.map(
    (u) =>
      `  <url><loc>${ORIGIN}${u.path}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
  ).join("\n");
}

function degradedSitemap(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- degraded: dynamic rows unavailable -->
${staticBlock()}
</urlset>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") {
    return new Response("method_not_allowed", { status: 405, headers: CORS });
  }

  const comments: string[] = [];
  let symbolBlock = "";
  let reportBlock = "";
  let generalBlock = "";

  // (b) library_items → /library/<symbol> (existing behaviour)
  try {
    const { data, error } = await admin
      .from("library_items")
      .select("symbol, updated_at")
      .eq("is_public", true)
      .eq("is_tombstoned", false)
      .not("symbol", "is", null)
      .order("updated_at", { ascending: false })
      .limit(45000);
    if (error) throw error;
    const maxBySymbol = new Map<string, string>();
    for (const r of (data ?? []) as Array<{ symbol: string; updated_at: string }>) {
      if (!r.symbol) continue;
      if (!maxBySymbol.has(r.symbol)) maxBySymbol.set(r.symbol, r.updated_at);
    }
    const symbols = Array.from(maxBySymbol.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    symbolBlock = symbols
      .map(([sym, lastmod]) => {
        const iso = new Date(lastmod).toISOString();
        const loc = `${ORIGIN}/library/${encodeURIComponent(sym)}`;
        return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${iso}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
      })
      .join("\n");
  } catch (_e) {
    comments.push("  <!-- partial: library symbols unavailable -->");
  }

  // (c) published AI reports → /report/<uuid>
  try {
    const { data, error } = await admin
      .from("queries")
      .select("id, updated_at, created_at")
      .eq("is_public_library", true)
      .is("library_tombstoned_at", null)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(45000);
    if (error) throw error;
    reportBlock = ((data ?? []) as Array<{ id: string; updated_at: string | null; created_at: string | null }>)
      .map((r) => {
        const iso = new Date(r.updated_at ?? r.created_at ?? Date.now()).toISOString();
        const loc = `${ORIGIN}/report/${r.id}`;
        return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${iso}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
      })
      .join("\n");
  } catch (_e) {
    comments.push("  <!-- partial: reports unavailable -->");
  }

  // (d) published general analyst videos → /general/<answerId>
  try {
    const { data, error } = await admin
      .from("answers")
      .select("id, created_at")
      .eq("category", "general")
      .eq("is_published", true)
      .eq("answer_type", "video")
      .order("created_at", { ascending: false })
      .limit(45000);
    if (error) throw error;
    generalBlock = ((data ?? []) as Array<{ id: string; created_at: string | null }>)
      .map((r) => {
        const iso = new Date(r.created_at ?? Date.now()).toISOString();
        const loc = `${ORIGIN}/general/${r.id}`;
        return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${iso}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
      })
      .join("\n");
  } catch (_e) {
    comments.push("  <!-- partial: general videos unavailable -->");
  }

  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...comments,
    staticBlock(),
  ];
  if (symbolBlock) parts.push(symbolBlock);
  if (reportBlock) parts.push(reportBlock);
  if (generalBlock) parts.push(generalBlock);
  parts.push(`</urlset>`);
  const xml = parts.join("\n");

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      ...CORS,
    },
  });
});
