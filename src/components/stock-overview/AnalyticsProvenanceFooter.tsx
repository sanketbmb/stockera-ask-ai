import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { AnalyticsProvenance } from "./types";

interface Props {
  provenance: AnalyticsProvenance | null | undefined;
  formulaVersion?: string | null;
  weightingProfileId?: string | null;
}

function humanizeOrigin(origin: string | null | undefined): string {
  if (origin === "prewarm") return "Nightly pre-warm";
  if (origin === "on_demand_authenticated") return "Refreshed on demand";
  return origin ?? "cache";
}

function relativeIst(iso: string | null | undefined): { absolute: string; relative: string } {
  if (!iso) return { absolute: "—", relative: "" };
  const d = new Date(iso);
  const absolute = d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  let relative = "";
  if (diffMin < 1) relative = "just now";
  else if (diffMin < 60) relative = `${diffMin}m ago`;
  else if (diffMin < 60 * 24) relative = `${Math.round(diffMin / 60)}h ago`;
  else relative = `${Math.round(diffMin / (60 * 24))}d ago`;
  return { absolute, relative };
}

export function AnalyticsProvenanceFooter({ provenance, formulaVersion, weightingProfileId }: Props) {
  if (!provenance) return null;
  const { absolute, relative } = relativeIst(provenance.computed_at as string | null | undefined);
  const origin = humanizeOrigin(provenance.origin);
  // Stage 4A.3.x B1 — always prefer the compute-layer audit_meta values.
  // provenance.cache_* describes the cache/fetch layer, not the math.
  const fv = formulaVersion ?? "—";
  const profile = weightingProfileId ?? null;
  return (
    <div className="mt-6 rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Refreshed{" "}
          <span className="text-foreground" title={`${absolute} IST`}>
            {relative || absolute}
          </span>
        </span>
        <span>Source: <span className="text-foreground">{origin}</span></span>
        <span>Formula: <span className="text-foreground">{fv}</span></span>
        {profile && (
          <span>Profile: <span className="text-foreground">{profile}</span></span>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Info className="h-3 w-3" />
              What's this?
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-w-xs text-xs leading-relaxed">
            <p className="font-medium text-foreground">Public stock analytics</p>
            <p className="mt-1 text-muted-foreground">
              These signals are pre-computed for every user daily. They are <span className="text-foreground">not personalized</span> and don't include an entry / exit plan.
            </p>
            <p className="mt-2 text-muted-foreground">
              For a personalized AI report with position sizing and risk framing, start a query from the header CTA.
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
