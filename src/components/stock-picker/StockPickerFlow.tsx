import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  AlertTriangle,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { checkPaywallGate, type PaywallGateResult } from "@/lib/paywall";
import { PaywallDialog } from "@/components/paywall/PaywallDialog";

// ──────────────────────────────────────────────────────────────────────────
// API contract — must match the deployed stock-recommendation-query function.
// ──────────────────────────────────────────────────────────────────────────
type Horizon = "intraday" | "short" | "medium" | "long";
type RiskProfile = "conservative" | "moderate" | "aggressive" | "ultra";

interface StockPickerRequest {
  horizon: Horizon;
  risk_profile: RiskProfile;
  sector: string;
  index: string;
  stock_count: number;
  is_pro: boolean;
}

interface StockDataCompleteness {
  cmp: boolean;
  technicals: boolean;
  zones: boolean;
  fundamentals: boolean;
  news: boolean;
}

interface CmpBlock {
  value: number | null;
  as_of: string | null;
  fetched_at?: string | null;
  source:
    | "dhan_live"
    | "dhan_close"
    | "dhan_cache_stale"
    | "liquidity_20d_close"
    | "ltp_cache"
    | null;
  label?: "LIVE" | "CLOSE" | "CACHE" | "EOD FALLBACK" | null;
  stale_minutes?: number | null;
}
interface TechnicalsBlock {
  sma_20d: number | null;
  high_20d: number | null;
  low_20d: number | null;
  pct_change_20d: number | null;
  realized_vol_20d: number | null;
  sample_size: number;
}
interface FundamentalsBlock {
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  market_cap_rs: number | null;
  cap_band: string | null;
  lot_size: number | null;
  tick_size: number | null;
  regulatory_flags: {
    is_asm: boolean | null;
    is_gsm: boolean | null;
    is_t2t: boolean | null;
    is_suspended: boolean | null;
    pledged_pct: number | null;
  };
}
interface BuyZoneBlock { lower: number | null; upper: number | null; }
interface NewsItemOut {
  headline: string;
  url: string | null;
  source: string;
  published_at: string;
}
interface CacheHealth {
  cmp_fresh: boolean;
  fundamentals_fresh: boolean;
  news_fresh: boolean;
}

interface PickedStock {
  ticker: string;
  exchange: string;
  sector: string | null;
  verdict: string;
  composite_score: number | null;
  composite_score_preview: number | null;
  batch_id: string;
  generated_at: string;
  cmp: CmpBlock;
  technicals: TechnicalsBlock;
  fundamentals: FundamentalsBlock;
  buy_zone: BuyZoneBlock;
  target: number | null;
  stop_loss: number | null;
  news: NewsItemOut[];
  data_completeness: StockDataCompleteness;
  pending: string[];
  cache_health: CacheHealth;
}

interface StockPickerResponse {
  ok: boolean;
  horizon: string;
  risk_profile: "conservative" | "moderate" | "aggressive" | "ultra" | string;
  sector: string;
  index: string;
  generated_at: string;
  data_completeness: string;
  stocks: PickedStock[];
  note?: string;
  error?: string;
  regulatory_stamp?: {
    firm_legal_name: string;
    sebi_reg_no: string;
    regulatory_status_at_generation: string;
  };
}

/** @deprecated Legacy fallback only. Authoritative stamp now comes from
 *  stock-recommendation-query response (regulatory_stamp), sourced from
 *  runtime_config via currentRegulatoryStamp(). */
const SEBI_RA_FIRM = "Stockera Technology Private Limited";
/** @deprecated See SEBI_RA_FIRM above. */
const SEBI_RA_REGNO = "INH000019071";

const HORIZONS: { id: Horizon; label: string }[] = [
  { id: "intraday", label: "Intraday" },
  { id: "short", label: "Short Term" },
  { id: "medium", label: "Medium Term" },
  { id: "long", label: "Long Term" },
];

const RISKS: { id: RiskProfile; label: string }[] = [
  { id: "conservative", label: "Conservative" },
  { id: "moderate", label: "Moderate" },
  { id: "aggressive", label: "Aggressive" },
  { id: "ultra", label: "Ultra High Risk" },
];

const SECTOR_OPTIONS = [
  "All Sectors",
  "Banking & Finance",
  "Information Technology",
  "Pharmaceuticals",
  "Automobile",
  "FMCG",
  "Energy & Power",
  "Infrastructure",
  "Metals & Mining",
  "Real Estate",
  "Telecom",
  "Chemicals",
  "Defence",
  "Consumer Durables",
];

const SECTOR_DATA_LOADED = true;
const INDEX_DATA_LOADED = true;

const INDEX_OPTIONS = [
  "All Indices",
  "Nifty 50",
  "Nifty 100",
  "Nifty 200",
  "Nifty 500",
  "Nifty Midcap 150",
  "Nifty Smallcap 250",
  "Nifty Bank",
  "Nifty IT",
  "Nifty Pharma",
  "Nifty Auto",
  "Nifty FMCG",
];

const LOADING_MESSAGES = [
  "Loading today's verified universe…",
  "Applying your filters…",
  "Selecting survivors…",
];

export function StockPickerFlow() {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const { user } = useAuth();

  // Step A — basic inputs
  const [horizon, setHorizon] = useState<Horizon>("short");
  const [risk, setRisk] = useState<RiskProfile>("moderate");
  const [stockCount, setStockCount] = useState<number>(3);

  // Step B — pro
  const [proOn, setProOn] = useState(false);
  const [sector, setSector] = useState<string>("All Sectors");
  const [indexName, setIndexName] = useState<string>("All Indices");
  const [showCompletenessChips, setShowCompletenessChips] = useState(true);
  const [showRejected, setShowRejected] = useState(false);

  // Step C — submit/results
  const [submitting, setSubmitting] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [result, setResult] = useState<StockPickerResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDetailOpen, setErrorDetailOpen] = useState(false);
  const [paywallGate, setPaywallGate] = useState<PaywallGateResult | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  async function runQuery() {
    const gate = await checkPaywallGate("stock_picker", user?.id);
    if (!gate.allow) {
      setPaywallGate(gate);
      setPaywallOpen(true);
      return;
    }

    setSubmitting(true);
    setResult(null);
    setErrorMsg(null);

    let i = 0;
    setLoadingMsg(LOADING_MESSAGES[0]);
    const tick = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[i]);
    }, 900);

    const body: StockPickerRequest = {
      horizon,
      risk_profile: risk,
      sector: SECTOR_DATA_LOADED ? sector : "All Sectors",
      index: INDEX_DATA_LOADED ? indexName : "All Indices",
      stock_count: Math.max(1, Math.min(10, stockCount)),
      is_pro: proOn,
    };

    try {
      const { data, error } = await supabase.functions.invoke<StockPickerResponse>(
        "stock-recommendation-query",
        { body },
      );
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Empty response from server.");
      if (!data.ok) throw new Error(data.error || "Server returned an error.");
      setResult(data);
    } catch (e) {
      setErrorMsg((e as Error).message || "Unknown error");
    } finally {
      clearInterval(tick);
      setSubmitting(false);
    }
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Stepper */}
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {(["Configure", "Pro filters", "Generate"] as const).map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`h-6 w-6 rounded-full flex items-center justify-center border ${
                  step === i
                    ? "border-primary bg-primary/10 text-primary"
                    : step > i
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted-foreground"
                }`}
              >
                {i + 1}
              </span>
              <span className={step === i ? "text-foreground" : ""}>{label}</span>
              {i < 2 && <ChevronRightIcon />}
            </div>
          ))}
        </div>

        {/* STEP A */}
        {step === 0 && (
          <Card className="p-6 space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Investment horizon
                </Label>
                {/* Phase 2X.1 (F7): horizon scoring not yet wired — flag as coming soon. */}
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  Coming soon
                </Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {HORIZONS.map((h) => {
                  const active = horizon === h.id;
                  return (
                    <Tooltip key={h.id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Horizon: ${h.label} (coming soon)`}
                          aria-disabled="true"
                          disabled
                          onClick={(e) => e.preventDefault()}
                          className={`rounded-xl border px-3 py-2 text-sm transition opacity-50 cursor-not-allowed ${
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border"
                          }`}
                        >
                          {h.label}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Horizon-aware picks coming soon
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Risk appetite
              </Label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {RISKS.map((r) => {
                  const active = risk === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-label={`Risk: ${r.label}`}
                      onClick={() => setRisk(r.id)}
                      className={`rounded-xl border px-3 py-2 text-sm transition ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label
                htmlFor="stock-count"
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                Number of stocks ({stockCount})
              </Label>
              <input
                id="stock-count"
                type="range"
                min={1}
                max={10}
                step={1}
                value={stockCount}
                aria-label="Number of stocks"
                onChange={(e) => setStockCount(Number(e.target.value))}
                className="mt-3 w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1 font-mono">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep(1)} aria-label="Continue to pro filters">
                Continue <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* STEP B */}
        {step === 1 && (
          <Card className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-lg">Pro filters</p>
                <p className="text-xs text-muted-foreground">
                  Optional. Toggle on to narrow by sector or index.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="pro-toggle" className="text-sm">
                  Pro mode
                </Label>
                <Switch
                  id="pro-toggle"
                  checked={proOn}
                  onCheckedChange={setProOn}
                  aria-label="Toggle pro filters"
                />
              </div>
            </div>

            {proOn && (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Sector
                  </Label>
                  <Select
                    value={SECTOR_DATA_LOADED ? sector : "All Sectors"}
                    onValueChange={setSector}
                    disabled={!SECTOR_DATA_LOADED}
                  >
                    <SelectTrigger aria-label="Sector filter" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTOR_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!SECTOR_DATA_LOADED && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Sector filter locked — pending Phase 2A data load.
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Index
                  </Label>
                  <Select
                    value={INDEX_DATA_LOADED ? indexName : "All Indices"}
                    onValueChange={setIndexName}
                    disabled={!INDEX_DATA_LOADED}
                  >
                    <SelectTrigger aria-label="Index filter" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INDEX_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!INDEX_DATA_LOADED && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Index filter locked — pending Phase 2A data load.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm">Show data-completeness chips</p>
                    <p className="text-[11px] text-muted-foreground">
                      CMP / Technicals / Zones / Fundamentals / News
                    </p>
                  </div>
                  <Switch
                    checked={showCompletenessChips}
                    onCheckedChange={setShowCompletenessChips}
                    aria-label="Toggle data-completeness chips"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm">Show stocks rejected this batch</p>
                    <p className="text-[11px] text-muted-foreground">
                      Helpful for transparency. Off by default.
                    </p>
                  </div>
                  <Switch
                    checked={showRejected}
                    onCheckedChange={setShowRejected}
                    aria-label="Toggle rejected stocks"
                  />
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 opacity-60">
                      <div>
                        <p className="text-sm">Filter by composite score ≥ X</p>
                        <p className="text-[11px] text-muted-foreground">
                          Disabled — pending Phase 2D scoring.
                        </p>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        disabled
                        aria-label="Composite score filter (disabled)"
                        className="w-32"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Filter by composite score ≥ X — activates after Phase 2D scoring
                  </TooltipContent>
                </Tooltip>
              </div>
            )}

            <div className="flex justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep(0)}
                aria-label="Back to configure"
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button onClick={() => setStep(2)} aria-label="Continue to generate">
                Continue <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* STEP C */}
        {step === 2 && (
          <Card className="p-6 space-y-6">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p>
                <span className="font-mono uppercase">Horizon:</span>{" "}
                {HORIZONS.find((h) => h.id === horizon)?.label} ·{" "}
                <span className="font-mono uppercase">Risk:</span>{" "}
                {RISKS.find((r) => r.id === risk)?.label} ·{" "}
                <span className="font-mono uppercase">Count:</span> {stockCount}
              </p>
              <p>
                <span className="font-mono uppercase">Sector:</span>{" "}
                {proOn ? sector : "All Sectors"} ·{" "}
                <span className="font-mono uppercase">Index:</span>{" "}
                {proOn ? indexName : "All Indices"} ·{" "}
                <span className="font-mono uppercase">Pro:</span>{" "}
                {proOn ? "on" : "off"}
              </p>
            </div>

            <div className="flex justify-between items-center">
              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                aria-label="Back to pro filters"
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button
                onClick={runQuery}
                disabled={submitting}
                aria-label="Generate AI picks"
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Working…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate AI Picks
                  </>
                )}
              </Button>
            </div>

            {submitting && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{loadingMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-destructive">
                      Unable to load live recommendations right now. Please try again.
                    </p>
                    <button
                      type="button"
                      onClick={() => setErrorDetailOpen((v) => !v)}
                      className="mt-2 text-xs underline text-muted-foreground"
                      aria-label="Toggle error detail"
                    >
                      {errorDetailOpen ? "Hide" : "Show"} details
                    </button>
                    {errorDetailOpen && (
                      <pre className="mt-2 text-[11px] whitespace-pre-wrap break-all text-muted-foreground">
                        {errorMsg}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            )}

            {result && !errorMsg && (
              <ResultsView
                result={result}
                showCompletenessChips={proOn ? showCompletenessChips : true}
              />
            )}

            <DisclaimerFooter stamp={result?.regulatory_stamp} />
          </Card>
        )}
      </div>
      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} gate={paywallGate} />
    </TooltipProvider>
  );
}

function ChevronRightIcon() {
  return <span className="text-muted-foreground/60">›</span>;
}

function resolveStamp(
  s: StockPickerResponse["regulatory_stamp"] | undefined,
): { firm: string; reg: string } {
  if (
    s &&
    typeof s.firm_legal_name === "string" && s.firm_legal_name.trim() !== "" &&
    typeof s.sebi_reg_no === "string" && s.sebi_reg_no.trim() !== ""
  ) {
    return { firm: s.firm_legal_name, reg: s.sebi_reg_no };
  }
  return { firm: SEBI_RA_FIRM, reg: SEBI_RA_REGNO };
}

function ResultsView({
  result,
  showCompletenessChips,
}: {
  result: StockPickerResponse;
  showCompletenessChips: boolean;
}) {
  const stamp = resolveStamp(result.regulatory_stamp);
  if (!result.stocks || result.stocks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          No survivors for the current universe and risk profile
        </p>
        <p className="mt-1 text-xs">
          Try widening sector or index in Pro filters.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground font-mono uppercase">
        <span>
          {result.stocks.length} survivor{result.stocks.length === 1 ? "" : "s"}
        </span>
        <span>Batch generated {new Date(result.generated_at).toLocaleString()}</span>
      </div>
      {result.stocks.map((s) => (
        <StockCard
          key={`${s.ticker}-${s.exchange}`}
          stock={s}
          riskProfile={result.risk_profile}
          showCompletenessChips={showCompletenessChips}
          stamp={stamp}
        />
      ))}
    </div>
  );
}

function fmt(n: number | null | undefined, dp = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtCr(rs: number | null | undefined): string {
  if (rs == null || Number.isNaN(rs)) return "—";
  const cr = rs / 1e7;
  return `₹${cr.toLocaleString(undefined, { maximumFractionDigits: 0 })} Cr`;
}
function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function HealthDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-muted-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
          />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>Indicates whether the displayed data is within refresh window.</TooltipContent>
    </Tooltip>
  );
}

function StockCard({
  stock,
  riskProfile,
  showCompletenessChips,
  stamp,
}: {
  stock: PickedStock;
  riskProfile: string;
  showCompletenessChips: boolean;
  stamp: { firm: string; reg: string };
}) {
  const shortBatch = stock.batch_id ? stock.batch_id.slice(0, 8) : "—";
  const isConservative = riskProfile === "conservative";
  const cmp = stock.cmp;
  const tech = stock.technicals;
  const fund = stock.fundamentals;
  const dc = stock.data_completeness;
  const ch = stock.cache_health;

  // MASTER FIX — collapsible Technicals / Fundamentals, default closed.
  const [techOpen, setTechOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);

  // Phase 2V.2 — badge label/color driven by cmp.label from the API.
  // Fallback inference only if label missing (legacy responses).
  const cmpLabel: "LIVE" | "CLOSE" | "CACHE" | "EOD FALLBACK" | null =
    cmp.label ??
    (cmp.source === "liquidity_20d_close"
      ? "EOD FALLBACK"
      : cmp.source === "dhan_close"
      ? "CLOSE"
      : cmp.source === "dhan_cache_stale"
      ? "CACHE"
      : cmp.source === "dhan_live" || cmp.source === "ltp_cache"
      ? "LIVE"
      : null);
  const cmpBadgeClass =
    cmpLabel === "LIVE"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : cmpLabel === "CLOSE"
      ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
      : cmpLabel === "CACHE"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-border bg-muted text-muted-foreground";
  const cmpBadgeText =
    cmpLabel === "EOD FALLBACK" ? "EOD" : (cmpLabel ?? "—");

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-lg">{stock.ticker}</h3>
            <Badge variant="outline" className="text-[10px]">{stock.exchange}</Badge>
            <Badge variant="secondary" className="text-[10px] uppercase">{stock.verdict}</Badge>
            {stock.sector && (
              <span className="text-[11px] text-muted-foreground">· {stock.sector}</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1" data-testid="sebi-ra-stamp">
            SEBI-registered RA: {stamp.firm} ({stamp.reg})
          </p>
          <p className="text-[10px] text-muted-foreground/80">
            Batch {shortBatch} · {new Date(stock.generated_at).toLocaleString()}
          </p>
        </div>
        {/* Score block */}
        <div className="text-right">
          {isConservative ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-mono uppercase cursor-help">
                  Score Pending Backtest
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Conservative scoring is being validated. Other risk profiles already
                pass our backtest gate.
              </TooltipContent>
            </Tooltip>
          ) : stock.composite_score != null ? (
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-mono">Composite Score</p>
              <p className="font-display text-xl">{stock.composite_score.toFixed(1)}</p>
            </div>
          ) : (
            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-mono uppercase">
              Score Pending Backtest
            </Badge>
          )}
          {stock.composite_score_preview != null && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Preview: {stock.composite_score_preview.toFixed(1)}{" "}
              <span className="italic">· Preview math; not backtest-validated.</span>
            </p>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-[10px] uppercase text-muted-foreground font-mono">CMP</span>
          <span className="font-display text-lg">₹{fmt(cmp.value)}</span>
          {cmpLabel === "CACHE" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  data-testid="cmp-source-badge"
                  className={`text-[10px] font-mono uppercase rounded-full px-2 py-0.5 border cursor-help ${cmpBadgeClass}`}
                >
                  {cmpBadgeText}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Cached {cmp.stale_minutes ?? "?"} min ago
              </TooltipContent>
            </Tooltip>
          ) : (
            <span
              data-testid="cmp-source-badge"
              className={`text-[10px] font-mono uppercase rounded-full px-2 py-0.5 border ${cmpBadgeClass}`}
            >
              {cmpBadgeText}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {cmp.source ?? "—"} · {cmp.fetched_at ?? cmp.as_of ? new Date((cmp.fetched_at ?? cmp.as_of) as string).toLocaleString() : "—"}
          </span>
        </div>
      </div>

      {/* Zones */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg border border-border p-2">
          <p className="text-[10px] uppercase text-muted-foreground font-mono">Buy Zone</p>
          <p className="font-mono">
            {dc.zones && stock.buy_zone.lower != null && stock.buy_zone.upper != null
              ? `₹${fmt(stock.buy_zone.lower)} – ₹${fmt(stock.buy_zone.upper)}`
              : <span className="text-muted-foreground italic">Pending</span>}
          </p>
        </div>
        <div className="rounded-lg border border-border p-2">
          <p className="text-[10px] uppercase text-muted-foreground font-mono">Target</p>
          <p className="font-mono">
            {stock.target != null ? `₹${fmt(stock.target)}` : <span className="text-muted-foreground italic">Pending</span>}
          </p>
        </div>
        <div className="rounded-lg border border-border p-2">
          <p className="text-[10px] uppercase text-muted-foreground font-mono">Stop Loss</p>
          <p className="font-mono">
            {stock.stop_loss != null ? `₹${fmt(stock.stop_loss)}` : <span className="text-muted-foreground italic">Pending</span>}
          </p>
        </div>
      </div>

      {/* Technicals — collapsible, default closed (MASTER FIX) */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setTechOpen((v) => !v)}
          aria-expanded={techOpen}
          aria-controls={`tech-${stock.ticker}`}
          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition"
        >
          <span className="text-[10px] uppercase text-muted-foreground font-mono">Technicals (20d)</span>
          {techOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {techOpen && (
          <div id={`tech-${stock.ticker}`} className="px-3 pb-3">
            {dc.technicals ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
                <KVT k="SMA" v={`₹${fmt(tech.sma_20d)}`} tip="Simple Moving Average: Average price over the last 20 trading days." />
                <KVT k="High" v={`₹${fmt(tech.high_20d)}`} tip="Highest closing price observed in the last 20 trading days." />
                <KVT k="Low" v={`₹${fmt(tech.low_20d)}`} tip="Lowest closing price observed in the last 20 trading days." />
                <KVT k="Δ %" v={tech.pct_change_20d == null ? "—" : `${fmt(tech.pct_change_20d)}%`} tip="Price Change: Percent difference between current price and 20 days ago." />
                <KVT k="Vol" v={tech.realized_vol_20d == null ? "—" : fmt(tech.realized_vol_20d, 4)} tip="Realized Volatility: Measure of how much the price swings up and down." />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Pending</p>
            )}
          </div>
        )}
      </div>

      {/* Fundamentals — collapsible, default closed (MASTER FIX) */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setFundOpen((v) => !v)}
          aria-expanded={fundOpen}
          aria-controls={`fund-${stock.ticker}`}
          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition"
        >
          <span className="text-[10px] uppercase text-muted-foreground font-mono">Fundamentals</span>
          {fundOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {fundOpen && (
          <div id={`fund-${stock.ticker}`} className="px-3 pb-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <KV k="Company" v={fund.company_name ?? "—"} />
              <KV k="Sector" v={fund.sector ?? "—"} />
              <KV k="Industry" v={fund.industry ?? "—"} />
              <KV k="Market Cap" v={fmtCr(fund.market_cap_rs)} />
              <KVT k="Cap Band" v={fund.cap_band ?? "—"} tip="Market Category: Classification by company size (Large/Mid/Small)." />
              <KVT k="Lot / Tick" v={`${fund.lot_size ?? "—"} / ${fund.tick_size ?? "—"}`} tip="Trading Units: Minimum shares per trade / Minimum price movement." />
            </div>
            {(fund.regulatory_flags.is_asm || fund.regulatory_flags.is_gsm ||
              fund.regulatory_flags.is_t2t || fund.regulatory_flags.is_suspended) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {fund.regulatory_flags.is_asm && <FlagPill label="ASM" />}
                {fund.regulatory_flags.is_gsm && <FlagPill label="GSM" />}
                {fund.regulatory_flags.is_t2t && <FlagPill label="T2T" />}
                {fund.regulatory_flags.is_suspended && <FlagPill label="SUSPENDED" />}
              </div>
            )}
          </div>
        )}
      </div>


      {/* News */}
      <div className="rounded-lg border border-border p-3">
        <p className="text-[10px] uppercase text-muted-foreground font-mono mb-2">Recent News</p>
        {dc.news && stock.news.length > 0 ? (
          <ul className="space-y-1.5">
            {stock.news.slice(0, 3).map((n, idx) => (
              <li key={idx} className="text-xs">
                {n.url ? (
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-primary"
                  >
                    {n.headline}
                  </a>
                ) : (
                  <span>{n.headline}</span>
                )}
                <span className="text-muted-foreground"> · {n.source} · {relTime(n.published_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground italic">No recent news in our window</p>
        )}
      </div>

      {/* Cache health */}
      <div className="flex items-center gap-4 pt-1">
        <HealthDot ok={ch.cmp_fresh} label="CMP" />
        <HealthDot ok={ch.fundamentals_fresh} label="Fundamentals" />
        <HealthDot ok={ch.news_fresh} label="News" />
      </div>

      {showCompletenessChips && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
          {(
            [
              ["CMP", dc.cmp],
              ["Technicals", dc.technicals],
              ["Zones", dc.zones],
              ["Fundamentals", dc.fundamentals],
              ["News", dc.news],
            ] as const
          ).map(([label, ready]) => (
            <span
              key={label}
              className={`text-[10px] font-mono uppercase rounded-full px-2 py-0.5 border ${
                ready
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border bg-muted text-muted-foreground"
              }`}
            >
              {label}: {ready ? "Ready" : "Pending"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground font-mono">{k}</p>
      <p className="text-xs font-mono break-words">{v}</p>
    </div>
  );
}

function KVT({ k, v, tip }: { k: string; v: string; tip: string }) {
  return (
    <div>
      <Tooltip>
        <TooltipTrigger asChild>
          <p className="text-[10px] uppercase text-muted-foreground font-mono inline-flex items-center gap-1 cursor-help">
            {k}
            <Info className="h-3 w-3 opacity-60" />
          </p>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px] text-xs">{tip}</TooltipContent>
      </Tooltip>
      <p className="text-xs font-mono break-words">{v}</p>
    </div>
  );
}


function FlagPill({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-mono uppercase rounded-full px-2 py-0.5 border border-destructive/40 bg-destructive/10 text-destructive">
      {label}
    </span>
  );
}

function DisclaimerFooter({
  stamp,
}: {
  stamp?: StockPickerResponse["regulatory_stamp"];
}) {
  const { firm, reg } = resolveStamp(stamp);
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground flex items-start gap-2">
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <div className="space-y-1">
        <p>
          AI-generated. SEBI-registered RA: {firm} ({reg}). Independent
          analyst review recommended before acting on any pick.
        </p>
        <p>
          Composite scores shown are dev-preview math unless this card carries a
          backtest-validated score.
        </p>
      </div>
    </div>
  );
}

// Silence unused-icon import lints if any environment trims them.
void ChevronDown;
void ChevronUp;
