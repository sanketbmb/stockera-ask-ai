import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { data, error } = await supabase.functions.invoke("sitemap");
          if (error || !data) throw error ?? new Error("empty");
          const xml =
            typeof data === "string" ? data : await new Response(data as BodyInit).text();
          return new Response(xml, {
            status: 200,
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (_e) {
          const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- degraded: dynamic rows unavailable -->
  <url><loc>https://asktheexpert.lovable.app/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://asktheexpert.lovable.app/pricing</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>
  <url><loc>https://asktheexpert.lovable.app/faq</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
</urlset>`;
          return new Response(fallback, {
            status: 200,
            headers: { "Content-Type": "application/xml; charset=utf-8" },
          });
        }
      },
    },
  },
});
