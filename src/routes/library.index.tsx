import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MasterLibraryPagination } from "@/components/library/MasterLibraryPagination";

const PAGE_SIZE = 24;
import { useQuery } from "@tanstack/react-query";
import { PublicShell } from "@/components/layout/PublicShell";
import { supabase } from "@/integrations/supabase/client";
import {
  MasterLibraryCard,
  type MasterLibraryRow,
} from "@/components/library/MasterLibraryCard";
import { MasterLibrarySkeletonCard } from "@/components/library/MasterLibrarySkeletonCard";
import {
  MasterLibraryToolbar,
  type SortKey,
  type VerdictFilter,
} from "@/components/library/MasterLibraryToolbar";
import { Stagger, StaggerItem, Reveal } from "@/lib/motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralTab } from "@/components/library/GeneralTab";


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
  validateSearch: (search: Record<string, unknown>) => ({
    page:
      typeof search.page === "string" || typeof search.page === "number"
        ? Math.max(1, Math.floor(Number(search.page)) || 1)
        : 1,
  }),
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

async function fetchLibraryGrid(): Promise<MasterLibraryRow[]> {
  const { data, error } = await supabase
    .from("library_items")
    .select(
      "id, kind, source_table, source_id, symbol, symbol_exchange, title, verdict, sector, analyst_id, body_excerpt, published_at, is_public, is_tombstoned",
    )
    .eq("is_public", true)
    .eq("is_tombstoned", false)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as MasterLibraryRow[];
}

function canonVerdict(v: string | null | undefined): string {
  if (!v) return "";
  return v.toUpperCase().replace(/\s+/g, "_");
}

function LibraryIndexPage() {
  const { page: urlPage } = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["library", "grid"],
    queryFn: fetchLibraryGrid,
    staleTime: 5 * 60 * 1000,
  });

  const [search, setSearch] = useState("");
  const [verdict, setVerdict] = useState<VerdictFilter | null>(null);
  const [sector, setSector] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("latest");

  const rows = data ?? [];

  const sectorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const s = r.sector?.trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const wantVerdict = verdict ? canonVerdict(verdict) : null;

    const filtered = rows.filter((r) => {
      if (q) {
        const hay = [
          r.symbol ?? "",
          r.title ?? "",
          r.body_excerpt ?? "",
        ]
          .join(" \u0000 ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (wantVerdict && canonVerdict(r.verdict) !== wantVerdict) return false;
      if (sector && (r.sector ?? "") !== sector) return false;
      return true;
    });

    // Sort: 'latest' only (most_viewed disabled — view_count not in row shape).
    filtered.sort((a, b) => {
      const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
      const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
      return tb - ta;
    });

    return filtered;
  }, [rows, search, verdict, sector]);

  const hasActiveFilters =
    search.trim().length > 0 || verdict !== null || sector !== "" || sort !== "latest";

  const clearAll = () => {
    setSearch("");
    setVerdict(null);
    setSector("");
    setSort("latest");
  };

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, urlPage || 1), totalPages);
  const pagedRows = useMemo(
    () => filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredRows, safePage],
  );

  // Silently coerce invalid ?page to a valid page (or strip when page 1).
  useEffect(() => {
    if (isLoading) return;
    if (urlPage !== safePage) {
      navigate({
        search: { page: safePage === 1 ? undefined : safePage } as { page?: number },
        replace: true,
      });
    }
  }, [isLoading, urlPage, safePage, navigate]);

  // Reset to page 1 whenever filters/sort change.
  useEffect(() => {
    if (urlPage !== 1) {
      navigate({
        search: { page: undefined } as { page?: number },
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, verdict, sector, sort]);

  const handlePageChange = (n: number) => {
    navigate({
      search: { page: n === 1 ? undefined : n } as { page?: number },
      replace: false,
    });
    if (typeof document !== "undefined") {
      document
        .getElementById("library-grid-top")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };


  return (
    <PublicShell
      eyebrow="Public library"
      title="Browse analyst-answered stock questions"
      subtitle="Public market questions, verdicts, and report summaries from SEBI-registered experts."
    >
      <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 animate-fade-in">
        <MasterLibraryToolbar
          search={search}
          onSearchChange={setSearch}
          verdict={verdict}
          onVerdictChange={setVerdict}
          sector={sector}
          onSectorChange={setSector}
          sectorOptions={sectorOptions}
          sort={sort}
          onSortChange={setSort}
          mostViewedDisabled
          onClear={clearAll}
          hasActiveFilters={hasActiveFilters}
        />

        <div className="py-8 sm:py-10">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <MasterLibrarySkeletonCard key={i} />
              ))}
            </div>
          ) : isError ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Library is temporarily unavailable. Please try again shortly.
            </p>
          ) : rows.length === 0 ? (
            <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <h2 className="font-display text-xl text-foreground">
                No public reports yet
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Be the first to ask a question and build the library.
              </p>
              <Link
                to="/post-query"
                className="mt-5 inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Post a query
              </Link>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <h2 className="font-display text-xl text-foreground">
                No matches found
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Try a different search, verdict, or sector filter.
              </p>
              <button
                type="button"
                onClick={clearAll}
                className="mt-5 inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent/30"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div id="library-grid-top" />
              <Stagger
                key={`page-${safePage}-${search}-${verdict ?? ""}-${sector}-${sort}`}
                staggerChildren={0.04}
                className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
              >
                {pagedRows.map((row, i) =>
                  i < 12 ? (
                    <StaggerItem key={row.id} y={10}>
                      <MasterLibraryCard item={row} />
                    </StaggerItem>
                  ) : (
                    <div key={row.id}>
                      <MasterLibraryCard item={row} />
                    </div>
                  ),
                )}
              </Stagger>
              {filteredRows.length > PAGE_SIZE && (
                <Reveal className="mt-6">
                  <MasterLibraryPagination
                    currentPage={safePage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                  />
                </Reveal>
              )}
            </>
          )}
        </div>
      </section>
    </PublicShell>
  );
}
