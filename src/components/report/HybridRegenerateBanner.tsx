// Hybrid Regenerate Banner — mounted at the top of legacy /report/<uuid>
// renderings only. Lets the user create a fresh tier-shaped report from
// the legacy record's stored symbol + horizon. Regeneration is free.

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { regenerateFromLegacy } from "@/lib/regenerate-from-legacy.functions";

export function HybridRegenerateBanner({ legacyQueryId }: { legacyQueryId: string }) {
  const run = useServerFn(regenerateFromLegacy);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    const t = toast.loading("Regenerating with the latest engine…");
    try {
      const res = await run({ data: { legacyQueryId } });
      toast.success("Fresh tier-shaped report ready", { id: t });
      navigate({ to: "/report/$queryId", params: { queryId: res.queryId } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not regenerate";
      toast.error(msg, { id: t });
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mb-4 max-w-4xl rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex flex-wrap items-center gap-3">
      <Sparkles className="h-4 w-4 text-primary shrink-0" />
      <p className="text-sm text-foreground flex-1 min-w-[240px]">
        This report was generated under Stockera v0. Regenerate with the latest engine for tier-shaped analysis.
      </p>
      <Button size="sm" onClick={handleClick} disabled={busy} className="gap-1.5">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        <span>{busy ? "Regenerating…" : "Regenerate Free"}</span>
      </Button>
    </div>
  );
}
