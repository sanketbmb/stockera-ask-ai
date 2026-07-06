import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { listVideoAnswersForSymbol } from "@/lib/video-answers.functions";
import type { LockedVideoCardItem } from "@/components/video-answers/LockedVideoCard";
import type { SymbolLibraryResponse } from "@/types/library-symbol";

type Kind = "all" | "report" | "video" | "community_query";

const ORIGIN = "https://asktheexpert.lovable.app";

function fallbackResponse(input: string): SymbolLibraryResponse {
  return {
    input_symbol: input,
    normalized_symbol: null,
    counts: { all: 0, reports: 0, videos: 0, community: 0 },
    items: [],
    faq_questions: [],
  };
}

export const Route = createFileRoute("/library/$symbol")({
  loader: async ({ params }): Promise<SymbolLibraryResponse> => {
    try {
      const { data, error } = await supabase.functions.invoke("library-symbol", {
        body: { symbol: params.symbol, kind: "all", limit: 24 },
      });
      if (error || !data) return fallbackResponse(params.symbol);
      return data as SymbolLibraryResponse;
    } catch {
      return fallbackResponse(params.symbol);
    }
  },
  head: ({ loaderData, params }) => {
    const data = loaderData ?? fallbackResponse(params.symbol);
    const symbol = (data.normalized_symbol ?? data.input_symbol ?? params.symbol).toUpperCase();
    const counts = data.counts;
    const shouldNoIndex = !data.normalized_symbol || counts.all === 0;

    const title = `${symbol} — Analyst Reports, Videos & Community Questions | Stockera Research Library`;
    const description = `${counts.all} analyst-verified items for ${symbol}: ${counts.reports} written reports, ${counts.videos} videos, ${counts.community} community questions. Curated by SEBI-registered research analysts. Stockera Research Library.`;
    const url = `${ORIGIN}/library/${symbol}`;

    const items = data.items ?? [];
    const faq = data.faq_questions ?? [];

    const itemListLd = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${symbol} Research Library`,
      numberOfItems: counts.all,
      itemListElement: items.slice(0, 10).map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.title,
        url: item.related_query_id ? `${ORIGIN}/report/${item.related_query_id}` : undefined,
      })),
    };

    const faqLd =
      faq.length > 0
        ? {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((q) => ({
              "@type": "Question",
              name: q,
              acceptedAnswer: {
                "@type": "Answer",
                text: "Get a SEBI-registered analyst's verdict on this question in 24 hours. Post your question on Stockera.",
              },
            })),
          }
        : null;

    const breadcrumbLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Library", item: url },
        { "@type": "ListItem", position: 3, name: symbol, item: url },
      ],
    };

    const scripts: Array<{ type: string; children: string }> = [
      { type: "application/ld+json", children: JSON.stringify(itemListLd) },
      { type: "application/ld+json", children: JSON.stringify(breadcrumbLd) },
    ];
    if (faqLd) {
      scripts.push({ type: "application/ld+json", children: JSON.stringify(faqLd) });
    }
    scripts.push({
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FinancialProduct",
        name: `${symbol} stock research`,
        category: "Equity research",
        provider: { "@id": "https://asktheexpert.lovable.app/#organization" },
        url: `${ORIGIN}/library/${symbol}`,
        description: `Analyst-verified research, video answers, and community questions for ${symbol} on the Stockera Research Library.`,
      }),
    });

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: shouldNoIndex ? "noindex,nofollow" : "index,follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/eryFVTpnbyUAD07bQk2YgBPPUs13/social-images/social-1780395980513-Stock_queries_AI_answered.webp" },
        { property: "og:site_name", content: "Ask The Expert by Stockera" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/eryFVTpnbyUAD07bQk2YgBPPUs13/social-images/social-1780395980513-Stock_queries_AI_answered.webp" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts,
    };
  },

  component: SymbolLibraryPage,
});

function SymbolLibraryPage() {
  const { symbol } = Route.useParams();
  const initialData = Route.useLoaderData();
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
    initialData: activeKind === "all" ? initialData : undefined,
  });

  const displaySymbol = (data?.normalized_symbol ?? symbol).toUpperCase();
  const counts = data?.counts ?? { all: 0, reports: 0, videos: 0, community: 0 };
  const items: SymbolLibraryResponse["items"] = data?.items ?? [];
  const faq: string[] = data?.faq_questions ?? [];

  // Stage 4F.2 APPLY-1 — enrich kind==='video' rows via 4F.1 public RPC.
  // `source_id` for video rows is the answer_id (plan §F.0.1).
  const hasVideoRows = useMemo(() => items.some((it) => it.kind === "video"), [items]);
  const listVideosFn = useServerFn(listVideoAnswersForSymbol);
  const { data: videoRows } = useQuery({
    queryKey: ["video-answers", displaySymbol],
    queryFn: () => listVideosFn({ data: { symbol: displaySymbol } }),
    enabled: hasVideoRows,
    staleTime: 60_000,
  });
  const videoEnrichmentMap = useMemo(() => {
    const m = new Map<string, LockedVideoCardItem>();
    (videoRows ?? []).forEach((r) => {
      m.set(r.answer_id, {
        answerId: r.answer_id,
        title: `Analyst video on ${r.symbol ?? displaySymbol}${r.verdict ? ` — ${r.verdict}` : ""}`,
        verdict: r.verdict,
        symbol: r.symbol,
        analystName: r.analyst_name,
        analystSebiRegNumber: r.analyst_sebi_reg_number,
        unlockPriceCredits: r.unlock_price_credits,
        videoDurationSec: r.video_duration_sec,
        posterThumb: r.poster_thumb,
        publishedAt: r.published_at,
      });
    });
    return m;
  }, [videoRows, displaySymbol]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
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
              {items.map((it, i) => (
                <div
                  key={it.id}
                  className={`sym-row${i === 0 ? " sym-halo" : ""}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <LibraryItemCard
                    item={it}
                    videoEnrichment={it.kind === "video" ? videoEnrichmentMap.get(it.source_id) : undefined}
                  />
                </div>
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
