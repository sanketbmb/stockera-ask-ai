import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { SymbolLibraryCounts } from "@/types/library-symbol";

interface Props {
  symbol: string;
  counts: SymbolLibraryCounts;
  activeKind: "all" | "report" | "video" | "community_query";
  onKindChange: (k: "all" | "report" | "video" | "community_query") => void;
}

export function SymbolHeader({ symbol }: Props) {
  const sym = symbol.toUpperCase();
  return (
    <header className="mx-auto w-full max-w-5xl px-4 pt-8 pb-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <h1 className="font-mono text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {sym}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground sm:text-base">
        Analyst research library for {sym}
      </p>
      <div className="mt-6">
        <Button asChild size="lg">
          <Link to="/post-query" search={{ prefill_symbol: sym } as never}>
            Ask your own question about {sym} →
          </Link>
        </Button>
      </div>
    </header>
  );
}

export function SymbolCountsStrip({ counts }: { counts: SymbolLibraryCounts }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-wrap gap-x-6 gap-y-2 px-4 pb-4 text-sm text-muted-foreground">
      <span><strong className="text-foreground">{counts.all}</strong> items</span>
      <span><strong className="text-foreground">{counts.reports}</strong> reports</span>
      <span><strong className="text-foreground">{counts.videos}</strong> videos</span>
      <span><strong className="text-foreground">{counts.community}</strong> questions</span>
    </div>
  );
}

export default SymbolHeader;
