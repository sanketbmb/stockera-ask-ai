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

interface PickedStock {
  ticker: string;
  exchange: string;
  sector: string | null;
  verdict: string;
  composite_score: number | null;
  batch_id: string;
  generated_at: string;
  data_completeness: StockDataCompleteness;
}

interface StockPickerResponse {
  ok: boolean;
  horizon: string;
  risk_profile: string;
  sector: string;
  index: string;
  generated_at: string;
  data_completeness: string;
  stocks: PickedStock[];
  note?: string;
  error?: string;
}

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

  async function runQuery() {
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
      sector: proOn ? sector : "All Sectors",
      index: proOn ? indexName : "All Indices",
      stock_count: Math.max(1, Math.min(5, stockCount)),
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
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Investment horizon
              </Label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {HORIZONS.map((h) => {
                  const active = horizon === h.id;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      aria-label={`Horizon: ${h.label}`}
                      onClick={() => setHorizon(h.id)}
                      className={`rounded-xl border px-3 py-2 text-sm transition ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      {h.label}
                    </button>
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
                max={5}
                step={1}
                value={stockCount}
                aria-label="Number of stocks"
                onChange={(e) => setStockCount(Number(e.target.value))}
                className="mt-3 w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1 font-mono">
                {[1, 2, 3, 4, 5].map((n) => (
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
                  <Select value={sector} onValueChange={setSector}>
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
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Index
                  </Label>
                  <Select value={indexName} onValueChange={setIndexName}>
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

            <DisclaimerFooter />
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}

function ChevronRightIcon() {
  return <span className="text-muted-foreground/60">›</span>;
}

function ResultsView({
  result,
  showCompletenessChips,
}: {
  result: StockPickerResponse;
  showCompletenessChips: boolean;
}) {
  if (!result.stocks || result.stocks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          No live survivors matched your selected filters.
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
          showCompletenessChips={showCompletenessChips}
        />
      ))}
    </div>
  );
}

function StockCard({
  stock,
  showCompletenessChips,
}: {
  stock: PickedStock;
  showCompletenessChips: boolean;
}) {
  const shortBatch = stock.batch_id ? stock.batch_id.slice(0, 8) : "—";
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg">{stock.ticker}</h3>
            <Badge variant="outline" className="text-[10px]">
              {stock.exchange}
            </Badge>
            <Badge variant="secondary" className="text-[10px] uppercase">
              {stock.verdict}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sector: {stock.sector ?? "Unmapped"} · Batch {shortBatch} ·{" "}
            {new Date(stock.generated_at).toLocaleString()}
          </p>
        </div>
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-mono">
          SP-1 ONLY — MOCK SCORE PENDING BACKTEST
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <PendingTile label="CMP" phase="Phase 2C" />
        <PendingTile label="Buy Zone" phase="Phase 2D" />
        <PendingTile label="Target 1 / 2" phase="Phase 2D" />
        <PendingTile label="Stop Loss" phase="Phase 2D" />
        <PendingTile label="Technicals (RSI / MACD / EMA / ATR)" phase="Phase 2C" />
        <PendingTile label="Fundamentals (PE / Mkt Cap / Beta)" phase="Phase 2C" />
        <PendingTile label="Catalyst / News" phase="Phase 2E" />
        <PendingTile label="Risk tier" phase="Phase 2B" />
        <div className="rounded-lg border border-border p-2">
          <p className="text-[10px] uppercase text-muted-foreground">Composite Score</p>
          <p className="text-sm font-mono">
            {stock.composite_score == null ? "Pending Phase 2D" : stock.composite_score}
          </p>
        </div>
      </div>

      {showCompletenessChips && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
          {(
            [
              ["CMP", stock.data_completeness.cmp],
              ["Technicals", stock.data_completeness.technicals],
              ["Zones", stock.data_completeness.zones],
              ["Fundamentals", stock.data_completeness.fundamentals],
              ["News", stock.data_completeness.news],
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

function PendingTile({ label, phase }: { label: string; phase: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="text-[11px] text-muted-foreground/80 italic">Pending {phase}</p>
    </div>
  );
}

function DisclaimerFooter() {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground flex items-start gap-2">
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <p>
        AI-generated. SEBI-registered analyst review recommended. SP-1 layer
        live; risk / technicals / zones / news pending later phases.
      </p>
    </div>
  );
}

// Silence unused-icon import lints if any environment trims them.
void ChevronDown;
void ChevronUp;
