import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  MasterLibraryCard,
  type MasterLibraryRow,
} from "./MasterLibraryCard";
import { MasterLibrarySkeletonCard } from "./MasterLibrarySkeletonCard";

async function fetchLibraryGrid(): Promise<MasterLibraryRow[]> {
  const { data, error } = await supabase
    .from("library_items")
    .select(
      "id, kind, source_table, source_id, symbol, symbol_exchange, title, verdict, sector, analyst_id, body_excerpt, published_at, is_public, is_tombstoned",
    )
    .eq("is_public", true)
    .eq("is_tombstoned", false)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(60);
  if (error) throw error;
  return (data ?? []) as MasterLibraryRow[];
}

export function MasterLibraryGrid() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["library", "grid"],
    queryFn: fetchLibraryGrid,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <MasterLibrarySkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Library is temporarily unavailable. Please try again shortly.
      </p>
    );
  }

  const rows = data ?? [];

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
        <h2 className="font-display text-xl text-foreground">No public reports yet</h2>
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
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {rows.map((row) => (
        <MasterLibraryCard key={row.id} item={row} />
      ))}
    </div>
  );
}

export default MasterLibraryGrid;
