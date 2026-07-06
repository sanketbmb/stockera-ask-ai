import { useEffect, useMemo, useRef } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PublicShell } from "@/components/layout/PublicShell";
import { CuratedEmbed } from "@/components/curated/CuratedEmbed";
import { CuratedLinkOutCard } from "@/components/curated/CuratedLinkOutCard";
import { SourceAttribution } from "@/components/curated/SourceAttribution";
import {
  getCuratedItem,
  recordCuratedView,
  recordCuratedClickThrough,
} from "@/lib/curated.functions";

const SITE_ORIGIN = "https://asktheexpert.lovable.app";

function viewerKey(): string {
  if (typeof window === "undefined") return "ssr";
  const KEY = "stockera:curated:viewer";
  let v = window.localStorage.getItem(KEY);
  if (!v) {
    v = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    try { window.localStorage.setItem(KEY, v); } catch { /* ignore */ }
  }
  return v;
}

export const Route = createFileRoute("/curated/$itemId")({
  loader: async ({ params }) => {
    const item = await getCuratedItem({ data: { id: params.itemId } });
    if (!item || !item.is_published) throw notFound();
    return { item };
  },
  head: ({ loaderData }) => {
    const item = loaderData?.item;
    if (!item) {
      return { meta: [{ title: "Curated · Stockera" }, { name: "robots", content: "noindex" }] };
    }
    const desc = (item.description ?? "").slice(0, 160);
    return {
      meta: [
        { title: `${item.title} — Curated · Stockera` },
        { name: "description", content: desc },
        { property: "og:title", content: item.title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        ...(item.custom_thumbnail_url ? [{ property: "og:image", content: item.custom_thumbnail_url }] : []),
      ],
      // Canonical points to the ORIGINAL source — Stockera never claims authorship.
      links: [{ rel: "canonical", href: item.source_url }],
    };
  },
  component: CuratedItemPage,
});

function CuratedItemPage() {
  const { item } = Route.useLoaderData();
  const recordView = useServerFn(recordCuratedView);
  const recordClick = useServerFn(recordCuratedClickThrough);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    recordView({ data: { id: item.id, viewer_key: viewerKey() } }).catch(() => {});
  }, [item.id, recordView]);

  const onClickThrough = () => {
    recordClick({ data: { id: item.id, viewer_key: viewerKey() } }).catch(() => {});
  };

  const embed = useMemo(
    () => (item.embed_kind === "embed"
      ? <CuratedEmbed provider={item.source_provider} sourceUrl={item.source_url} />
      : null),
    [item.embed_kind, item.source_provider, item.source_url],
  );

  const siteName =
    (item.og_scrape_meta as Record<string, string> | null)?.["og:site_name"] ?? null;

  return (
    <PublicShell
      eyebrow="Curated"
      title={item.title}
      subtitle={item.source_provider}
    >
      <section className="mx-auto w-full max-w-4xl px-4 sm:px-6 pb-16">
        {embed ? (
          <div className="grid gap-3">
            {embed}
            {item.description ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.description}</p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <SourceAttribution
                provider={item.source_provider}
                sourceUrl={item.source_url}
                siteName={siteName}
              />
              <a
                href={item.source_url}
                onClick={onClickThrough}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-xs font-semibold underline"
              >
                Open on source ↗
              </a>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <CuratedLinkOutCard
              title={item.title}
              description={item.description}
              thumbnailUrl={item.custom_thumbnail_url}
              sourceUrl={item.source_url}
              provider={item.source_provider}
              onClickThrough={onClickThrough}
            />
            <SourceAttribution
              provider={item.source_provider}
              sourceUrl={item.source_url}
              siteName={siteName}
            />
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-6">
          Curated by Stockera editors · Free to view · No unlock or wallet charge applies.
        </p>
      </section>
    </PublicShell>
  );
}
