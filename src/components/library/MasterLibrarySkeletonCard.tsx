export function MasterLibrarySkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted/70" />
        <div className="h-5 w-14 animate-pulse rounded-full bg-muted/70" />
      </div>
      <div className="h-5 w-5/6 animate-pulse rounded bg-muted/70" />
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-muted/60" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted/60" />
      </div>
      <div className="mt-auto flex items-center justify-between pt-2">
        <div className="h-3 w-16 animate-pulse rounded bg-muted/50" />
        <div className="h-3 w-24 animate-pulse rounded bg-muted/50" />
      </div>
    </div>
  );
}

export default MasterLibrarySkeletonCard;
