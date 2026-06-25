import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { SymbolHeader, SymbolCountsStrip } from "@/components/library/SymbolHeader";
import { SymbolTabs } from "@/components/library/SymbolTabs";
import { LibraryItemCard } from "@/components/library/LibraryItemCard";
import { SymbolFAQ } from "@/components/library/SymbolFAQ";
import { SymbolCompliance } from "@/components/library/SymbolCompliance";
import { SymbolEmptyState } from "@/components/library/SymbolEmptyState";
import type { SymbolLibraryResponse } from "@/types/library-symbol";

type Kind = "all" | "report" | "video" | "community_query";

const ORIGIN = "https://asktheexpert.lovable.app";

export const Route = createFileRoute("/library/$symbol")({
  head: ({ params }) => {
    const sym = (params.symbol ?? "").toUpperCase();
    return {
      meta: [
        {
          title: `${sym} — Analyst Reports, Videos & Community Questions | Stockera Research Library`,
        },
        {
          property: "og:title",
          content: `${sym} — Research Library | Stockera`,
        },
        {
          property: "og:url",
          content: `${ORIGIN}/library/${sym}`,
        },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "canonical", href: `${ORIGIN}/library/${sym}` }],
    };
  },
  component: SymbolLibraryPage,
});

function SymbolLibraryPage() {
  const { symbol } = Route.useParams();
  const [activeKind, setActiveKind] = useState<Kind>("all");

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [symbol]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["library-symbol", symbol, activeKind],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("library-symbol", {
        body: { symbol, kind: activeKind, limit: 24 },
      });
      if (error) throw error;
      return data as SymbolLibraryResponse;
    },
  });

  const displaySymbol = (data?.normalized_symbol ?? symbol).toUpperCase();
  const counts = data?.counts ?? { all: 0, reports: 0, videos: 0, community: 0 };
  const items = data?.items ?? [];
  const faq = data?.faq_questions ?? [];

  // Dynamic description + noindex via document head
  useEffect(() => {
    if (!data) return;
    const desc = `${counts.all} analyst-verified items for ${displaySymbol}: ${counts.reports} written reports, ${counts.videos} videos, ${counts.community} community questions. Curated by SEBI-registered research analysts. Stockera Research Library.`;
    setMeta("description", desc);
    setMeta("og:description", desc, true);
    const shouldNoIndex = data.normalized_symbol == null || counts.all === 0;
    setMeta("robots", shouldNoIndex ? "noindex,nofollow" : "index,follow");
    return () => {
      // leave tags in place; subsequent navigation will overwrite
    };
  }, [data, counts.all, counts.reports, counts.videos, counts.community, displaySymbol]);

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `${displaySymbol} Research Library`,
    "numberOfItems": counts.all,
    "itemListElement": items.slice(0, 10).map((item, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": item.title,
      "url": item.related_query_id ? `${ORIGIN}/report/${item.related_query_id}` : undefined,
    })),
  };

  const faqLd =
    faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": faq.map((q) => ({
            "@type": "Question",
            "name": q,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Get a SEBI-registered analyst's verdict on this question in 24 hours. Post your question on Stockera.",
            },
          })),
        }
      : null;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
      // Library index does not exist yet — temporary self-reference until L5.
      { "@type": "ListItem", position: 2, name: "Library", item: `${ORIGIN}/library/${displaySymbol}` },
      { "@type": "ListItem", position: 3, name: displaySymbol, item: `${ORIGIN}/library/${displaySymbol}` },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <Navbar />
      <main className="flex-1">
        <SymbolHeader
          symbol={displaySymbol}
          counts={counts}
          activeKind={activeKind}
          onKindChange={setActiveKind}
        />
        <SymbolCountsStrip counts={counts} />
        <div className="mx-auto w-full max-w-5xl px-4">
          <SymbolTabs counts={counts} activeKind={activeKind} onKindChange={setActiveKind} />

          {isError && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Library is temporarily unavailable. Try again shortly.
            </p>
          )}

          {!isError && isLoading && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-56 w-full rounded-xl" />
              ))}
            </div>
          )}

          {!isError && !isLoading && items.length === 0 && counts.all === 0 && (
            <SymbolEmptyState symbol={displaySymbol} />
          )}

          {!isError && !isLoading && items.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((it) => (
                <LibraryItemCard key={it.id} item={it} />
              ))}
            </div>
          )}
        </div>

        <SymbolFAQ symbol={displaySymbol} questions={faq} />
        <SymbolCompliance />
      </main>
      <SiteFooter />
    </div>
  );
}

function setMeta(name: string, content: string, isProperty = false) {
  if (typeof document === "undefined") return;
  const attr = isProperty || name.startsWith("og:") ? "property" : "name";
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}
