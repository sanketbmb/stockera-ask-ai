import type { AnalyticsProvenance } from "./types";

interface Props {
  provenance: AnalyticsProvenance | null | undefined;
  formulaVersion?: string | null;
}

export function AnalyticsProvenanceFooter({ provenance, formulaVersion }: Props) {
  if (!provenance) return null;
  const computed = provenance.computed_at ? new Date(provenance.computed_at) : null;
  const computedIst = computed
    ? computed.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
    : "—";
  const origin = provenance.origin === "prewarm"
    ? "Nightly pre-warmed"
    : provenance.origin === "on_demand_authenticated"
      ? "On-demand refresh"
      : provenance.origin ?? "cache";
  const fv = formulaVersion ?? provenance.formula_version ?? "—";
  return (
    <div className="mt-6 rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>Computed: <span className="text-foreground">{computedIst} IST</span></span>
        <span>Origin: <span className="text-foreground">{origin}</span></span>
        <span>Formula: <span className="text-foreground">{fv}</span></span>
        {provenance.weighting_profile_id && (
          <span>Weights: <span className="text-foreground">{provenance.weighting_profile_id}</span></span>
        )}
        {provenance.action_bucket_version && (
          <span>Bucket: <span className="text-foreground">{provenance.action_bucket_version}</span></span>
        )}
      </div>
    </div>
  );
}
