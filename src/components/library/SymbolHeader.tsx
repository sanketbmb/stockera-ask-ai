import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StockLogo } from "@/components/common/StockLogo";
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
    <header className="mx-auto w-full max-w-5xl px-4 pt-8 pb-6">
      <div className="flex items-center gap-3">
        <StockLogo symbol={sym} size={48} />
        <h1 className="sym-fade-1 font-mono text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {sym}
        </h1>
      </div>
      <p className="sym-fade-2 mt-2 text-sm text-muted-foreground sm:text-base">
        Analyst research library for {sym}
      </p>
      <div className="sym-fade-3 mt-6">
        <Button asChild size="lg" className="sym-cta-pulse">
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
