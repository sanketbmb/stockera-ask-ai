import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/layout/PublicShell";
import { MasterLibraryGrid } from "@/components/library/MasterLibraryGrid";

const SITE_ORIGIN = "https://asktheexpert.lovable.app";
const TITLE =
  "Public Research Library — Browse analyst-answered stock questions | Stockera";
const DESCRIPTION =
  "Public market questions, verdicts, and report summaries from SEBI-registered experts. Browse the Stockera Research Library.";

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
    { "@type": "ListItem", position: 2, name: "Library", item: `${SITE_ORIGIN}/library` },
  ],
};

export const Route = createFileRoute("/library/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_ORIGIN}/library` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/library` }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(breadcrumbLd) },
    ],
  }),
  component: LibraryIndexPage,
});

function LibraryIndexPage() {
  return (
    <PublicShell
      eyebrow="Public library"
      title="Browse analyst-answered stock questions"
      subtitle="Public market questions, verdicts, and report summaries from SEBI-registered experts."
    >
      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <MasterLibraryGrid />
      </section>
    </PublicShell>
  );
}
