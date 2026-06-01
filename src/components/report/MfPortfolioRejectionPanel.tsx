// Phase 2 — calm rejection panel when free-text capture contains
// mutual fund / portfolio / SIP intent. The stock report still renders;
// only this notice is added on top.

import { Info } from "lucide-react";
import { MF_REJECTION_COPY } from "@/lib/position-copy";

export function MfPortfolioRejectionPanel() {
  return (
    <aside
      aria-label="Out of scope notice"
      className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex items-start gap-3"
    >
      <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
      <p className="text-sm text-amber-900 dark:text-amber-200">{MF_REJECTION_COPY}</p>
    </aside>
  );
}
