import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

interface Props {
  symbol: string;
}

export function SymbolEmptyState({ symbol }: Props) {
  const sym = symbol.toUpperCase();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <Search className="mb-4 h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h3 className="text-lg font-semibold">No public reports for {sym} yet.</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Be the first to ask. Get a SEBI-registered analyst&apos;s written verdict in 24 hours.
      </p>
      <Button asChild className="mt-6">
        <Link to="/post-query" search={{ prefill_symbol: sym } as never}>
          Ask about {sym} →
        </Link>
      </Button>
    </div>
  );
}

export default SymbolEmptyState;
