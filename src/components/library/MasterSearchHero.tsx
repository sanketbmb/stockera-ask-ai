import { useEffect, useState } from "react";
import { MasterSearch } from "./MasterSearch";
import { Reveal } from "@/lib/motion";


const PLACEHOLDERS = [
  "Search Suzlon Energy…",
  "Search 'should I average HDFC?'",
  "Search 'IT sector outlook'",
  "Search by analyst name…",
] as const;

const CHIPS = ["Suzlon", "Should I average?", "IT sector"] as const;

export function MasterSearchHero() {
  const [idx, setIdx] = useState(0);
  const [seed, setSeed] = useState("");

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (m.matches) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % PLACEHOLDERS.length), 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="border-y border-border bg-gradient-to-b from-amber-50/40 to-background py-12 sm:py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="mb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Explore
          </p>
          <h2 className="mt-2 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            What&rsquo;s everyone asking about?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Search analyst-verified responses on Indian stocks.
          </p>
        </div>

        <MasterSearch
          variant="panel"
          placeholder={PLACEHOLDERS[idx]}
          initialQuery={seed}
          key={seed /* re-mount to push seed into controlled input */}
        />

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setSeed(c)}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default MasterSearchHero;
