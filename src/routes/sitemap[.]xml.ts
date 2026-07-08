import { createFileRoute } from "@tanstack/react-router";

const FALLBACK = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- degraded: dynamic rows unavailable -->
  <url><loc>https://asktheexpert.lovable.app/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://asktheexpert.lovable.app/pricing</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>
  <url><loc>https://asktheexpert.lovable.app/faq</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
</urlset>`;

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
          if (!supabaseUrl) throw new Error("no supabase url");
          const res = await fetch(`${supabaseUrl}/functions/v1/sitemap`, {
            method: "GET",
            headers: { accept: "application/xml" },
          });
          if (!res.ok) throw new Error(`edge ${res.status}`);
          const xml = await res.text();
          if (!xml || !xml.includes("<urlset")) throw new Error("empty");
          return new Response(xml, {
            status: 200,
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch {
          return new Response(FALLBACK, {
            status: 200,
            headers: { "Content-Type": "application/xml; charset=utf-8" },
          });
        }
      },
    },
  },
});
