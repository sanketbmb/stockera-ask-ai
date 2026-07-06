import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/layout/PublicShell";
import { DiscoverFilters, type DiscoverTab } from "@/components/discover/DiscoverFilters";
import { DiscoverFeed } from "@/components/discover/DiscoverFeed";

const SITE_ORIGIN = "https://asktheexpert.lovable.app";
const TITLE = "Discover — Free analyst videos, curated media & AI reports | Stockera";
const DESCRIPTION =
  "Fresh, editorially ranked analyst videos, curated market media, and AI research reports — all free to browse on Stockera Discover.";

interface DiscoverSearch {
  tab?: DiscoverTab;
  symbol?: string;
}

export const Route = createFileRoute("/discover")({
  validateSearch: (raw: Record<string, unknown>): DiscoverSearch => {
    const t = typeof raw.tab === "string" ? raw.tab : "all";
    const tab: DiscoverTab =
      t === "videos" || t === "ra_answers" || t === "news" || t === "reports" ? t : "all";
    const symbol = typeof raw.symbol === "string" && raw.symbol ? String(raw.symbol).toUpperCase() : undefined;
    return { tab, symbol };
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_ORIGIN}/discover` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/discover` }],
  }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = (search.tab ?? "all") as DiscoverTab;
  const [symbol, setSymbol] = useState<string>(search.symbol ?? "");

  const setTab = (t: DiscoverTab) =>
    navigate({
      search: {
        tab: t === "all" ? undefined : t,
        symbol: symbol || undefined,
      } as { tab?: DiscoverTab; symbol?: string },
      replace: true,
    });

  const setSym = (v: string) => {
    setSymbol(v);
    navigate({
      search: {
        tab: tab === "all" ? undefined : tab,
        symbol: v || undefined,
      } as { tab?: DiscoverTab; symbol?: string },
      replace: true,
    });
  };

  return (
    <PublicShell
      eyebrow="Discover"
      title="What's fresh across analyst media"
      subtitle="Free analyst videos, curated market coverage, and AI reports — ranked by freshness and editorial priority."
    >
      <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-16 space-y-6">
        <DiscoverFilters tab={tab} onTabChange={setTab} symbol={symbol} onSymbolChange={setSym} />
        <DiscoverFeed tab={tab} symbol={symbol} />
        <p className="text-[11px] text-muted-foreground text-center pt-2">
          Curated links open on their original source. Stockera never re-hosts third-party media.
        </p>
      </section>
    </PublicShell>
  );
}
