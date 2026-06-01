import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useServerFn } from "@tanstack/react-start";
import { generateAiReport } from "@/lib/report.functions";
import { classifyIntentRouter } from "@/lib/intent-router.functions";
import { normalizeHorizon } from "@/lib/query-intake-parser";
import {
  ENABLE_PHASE3_QUERY_TYPES,
  ENABLE_FREE_TEXT_ROUTER,
  isLiveIntent,
  isRoutableIntent,
  type AnyIntent,
} from "@/lib/feature-flags";
import {
  type RouterOutput,
  toFormIntent,
  routerHorizonToFormHorizon,
  confidenceBand,
} from "@/lib/intent-router-schema";
import { ArrowLeft, ArrowRight, ChevronRight, Info, Loader2, Sparkles, Wallet, CheckCircle2 } from "lucide-react";
import { StockAutocomplete } from "@/components/common/StockAutocomplete";
import type { NseStock } from "@/data/nseStocks";

type Intent = AnyIntent;

// Phase 2.1 — 2 examples per live chip. Each entry pre-selects the matching
// visible intent so a hidden type can never be silently chosen.
const QUESTION_EXAMPLES: { text: string; intent: Intent }[] = [
  // Fresh Entry
  { text: "Should I buy ICICIBANK for the next 6 months?", intent: "buy_decision" },
  { text: "Fresh entry in Reliance for long term — good levels?", intent: "buy_decision" },
  // Sell or Hold
  { text: "I bought HDFC Bank at 1850 last year, should I sell now?", intent: "stuck_position" },
  { text: "Currently holding Reliance, should I exit at current levels?", intent: "stuck_position" },
  // Should I Average
  { text: "I'm at a loss in Suzlon, should I average down?", intent: "should_average" },
  { text: "My position in Dixon is down — is averaging justified here?", intent: "should_average" },
];

const ALL_QUERY_TYPES: { id: Intent; label: string; emoji: string; phase3?: boolean; routerOnly?: boolean }[] = [
  { id: "stuck_position", emoji: "🤔", label: "Sell or Hold" },
  { id: "should_average", emoji: "📉", label: "Should I Average" },
  { id: "buy_decision", emoji: "🆕", label: "Fresh Entry" },
  { id: "educational", emoji: "📚", label: "Educational", phase3: true },
  { id: "sector_view", emoji: "🏭", label: "Sector View", phase3: true },
  // "Other" is exposed when the free-text router is live (Phase 3A). It is
  // a deliberate escape hatch for questions that don't map to a LIVE chip.
  { id: "other", emoji: "❓", label: "Other", routerOnly: true },
];

const QUERY_TYPES = ALL_QUERY_TYPES.filter((t) => {
  if (t.phase3) return ENABLE_PHASE3_QUERY_TYPES;
  if (t.routerOnly) return ENABLE_FREE_TEXT_ROUTER;
  return true;
});


const HOLD_OPTIONS = ["< 1 week", "1-4 weeks", "1-3 months", "3-12 months", "1+ year"];
const HORIZON_OPTIONS = ["Intraday", "Short-term (<3mo)", "Medium-term (3-12mo)", "Long-term (1+ year)"];
const LANG_OPTIONS = ["English", "Hindi", "Other"];

function classifyIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/\b(average|averaging|buy more|double down)\b/.test(t)) return "should_average";
  if (/\b(should i buy|fresh entry|entry point|invest in)\b/.test(t) && !/\b(stuck|loss|holding)\b/.test(t)) return "buy_decision";
  if (/\b(sell|exit|stuck|loss|hold|book profit)\b/.test(t)) return "stuck_position";
  if (/\b(explain|what is|how does|teach)\b/.test(t)) return "educational";
  if (/\b(sector|industry|best stocks in)\b/.test(t)) return "sector_view";
  return "other";
}

function extractFields(text: string): { stock?: string; buyPrice?: number; holding?: string } {
  const out: { stock?: string; buyPrice?: number; holding?: string } = {};
  const priceMatch = text.match(/(?:at|@|bought|entry)\s*(?:₹|rs\.?|inr)?\s*(\d{2,6}(?:\.\d{1,2})?)/i);
  if (priceMatch) out.buyPrice = parseFloat(priceMatch[1]);
  if (/\byear/i.test(text)) out.holding = "1+ year";
  else if (/\bmonth/i.test(text)) out.holding = "1-3 months";
  else if (/\bweek/i.test(text)) out.holding = "1-4 weeks";
  // Stock name extraction — simple capitalized-words heuristic
  const stockMatch = text.match(/\b(?:bought|in|stuck in|own|holding)\s+([A-Z][A-Za-z&\s]{2,30}?)(?:\s+at|\s+for|,|\.|$)/);
  if (stockMatch) out.stock = stockMatch[1].trim();
  return out;
}

export function QueryForm() {
  const navigate = useNavigate();
  const runGenerateAiReport = useServerFn(generateAiReport);
  const { user, profile, refresh } = useAuth();
  const [step, setStep] = useState(0); // 0=Question, 1=Context, 2=Review
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [queryText, setQueryText] = useState("");
  const [intent, setIntent] = useState<Intent>("other");
  const [autoDetected, setAutoDetected] = useState<{ stock?: string; buyPrice?: number; holding?: string }>({});

  // Step 2
  const [stockName, setStockName] = useState("");
  const [stockSymbol, setStockSymbol] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [holding, setHolding] = useState("");
  const [horizon, setHorizon] = useState("");
  const [language, setLanguage] = useState("English");
  const [analystId, setAnalystId] = useState<string | null>(null);
  // Phase 2 — Existing Position + Averaging
  const [entryPrice, setEntryPrice] = useState("");
  const [qty, setQty] = useState("");
  const [anythingElse, setAnythingElse] = useState("");

  // Step 3
  const [agreeDisclaimer, setAgreeDisclaimer] = useState(false);

  // Live intent + field detection on Step 1
  useEffect(() => {
    if (queryText.length < 10) return;
    const detected = classifyIntent(queryText);
    if (detected !== "other") setIntent(detected);
    const ex = extractFields(queryText);
    setAutoDetected(ex);
    if (ex.stock && !stockName) setStockName(ex.stock);
    if (ex.buyPrice && !buyPrice) setBuyPrice(String(ex.buyPrice));
    if (ex.holding && !holding) setHolding(ex.holding);
  }, [queryText]); // eslint-disable-line

  const { data: analysts = [] } = useQuery({
    queryKey: ["available-analysts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("analyst_profiles")
        .select("id, display_name, sebi_reg_number, avatar_url, rating")
        .eq("is_approved", true).eq("is_available", true).limit(6);
      return data ?? [];
    },
  });

  const balance = profile?.wallet_balance ?? 0;
  const showStockFields = ["stuck_position", "should_average", "buy_decision"].includes(intent);
  const showBuyPrice = ["stuck_position", "should_average"].includes(intent);
  // Phase 2 — existing position / averaging both ask for entry_price; averaging additionally requires qty.
  const isExistingPosition = intent === "stuck_position";
  const isAveraging = intent === "should_average";
  const showPhase2Fields = isExistingPosition || isAveraging;
  // Phase 2 — these intents now route into the v1 tier-shaped engine, same as Fresh Entry.
  const usesV1Engine = intent === "buy_decision" || isExistingPosition || isAveraging;

  // ─ Phase 2 input sanitization ─
  const entryPriceNum = entryPrice ? Number(entryPrice) : NaN;
  const qtyNum = qty ? Number(qty) : NaN;
  const entryPriceValid = !showPhase2Fields || (Number.isFinite(entryPriceNum) && entryPriceNum > 0 && /^\d+(\.\d{0,2})?$/.test(entryPrice));
  const qtyValid = !isAveraging || (Number.isFinite(qtyNum) && qtyNum > 0 && Number.isInteger(qtyNum));
  const anythingElseValid = anythingElse.length <= 500;

  const goNext = () => {
    if (step === 0) {
      if (queryText.trim().length < 15) { toast.error("Add at least 15 characters describing your question"); return; }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (showStockFields && !stockName) { toast.error("Please pick a stock"); return; }
      if (showPhase2Fields) {
        if (!entryPrice) { toast.error("Please enter your entry price"); return; }
        if (!entryPriceValid) { toast.error("Please re-check your entry price"); return; }
        if (isAveraging && !qty) { toast.error("Please enter your quantity"); return; }
        if (isAveraging && !qtyValid) { toast.error("Quantity must be a positive whole number"); return; }
        if (!horizon) { toast.error("Please pick your investment horizon"); return; }
        if (!anythingElseValid) { toast.error("Please keep the extra context under 500 characters"); return; }
      } else {
        if (showBuyPrice && !buyPrice) { toast.error("Please enter your buy price"); return; }
      }
      if (showStockFields && !showPhase2Fields && !currentPrice) { toast.error("Please enter the current stock price"); return; }
      setStep(2);
      return;
    }
  };

  const [genStage, setGenStage] = useState<"idle" | "creating" | "generating" | "redirecting">("idle");

  const handleSubmit = async () => {
    if (!user) { toast.error("You must be signed in"); return; }
    if (!agreeDisclaimer) { toast.error("Please accept the SEBI disclaimer"); return; }
    // Phase 2.1 — defense in depth: refuse to insert a query whose intent is
    // gated behind ENABLE_PHASE3_QUERY_TYPES. UI already hides these chips.
    if (!isLiveIntent(intent)) { toast.error("Unsupported query type"); return; }

    setSubmitting(true);
    setGenStage("creating");
    let createdQueryId: string | null = null;

    try {
      const baseInsert = {
        user_id: user.id,
        stock_name: stockName || "Stock Query",
        stock_symbol: stockSymbol || null,
        buy_price: buyPrice ? Number(buyPrice) : (showPhase2Fields && entryPrice ? Number(entryPrice) : null),
        current_price: currentPrice ? Number(currentPrice) : null,
        query_text: queryText,
        assigned_analyst_id: analystId,
      };

      const v1QueryType = intent === "buy_decision" ? "fresh_entry" : isAveraging ? "averaging" : "existing_position";
      const trimmedExtra = anythingElse.trim();

      const insertPayload = usesV1Engine
        ? {
            ...baseInsert,
            status: "ai_answered" as const,
            query_type: v1QueryType,
            engine_version: "v1_tier_shaped",
            engine_source: "post_query",
            horizon: normalizeHorizon(horizon),
            // Phase 2 — only the "Anything else?" textarea populates custom_question.
            // The main question lives in query_text (existing column).
            custom_question: trimmedExtra || null,
            ...(showPhase2Fields && entryPrice ? { entry_price: Number(entryPrice) } : {}),
            ...(isAveraging && qty ? { qty: Number(qty) } : {}),
            ...(showPhase2Fields ? { position_state: isAveraging ? "averaging" : null } : {}),
          }
        : {
            ...baseInsert,
            status: "pending" as const,
            query_type: intent,
          };

      const { data: inserted, error: qErr } = await supabase
        .from("queries").insert(insertPayload as never).select("id").single();
      if (qErr || !inserted) throw qErr ?? new Error("Failed to create query");

      const queryId = inserted.id as string;
      createdQueryId = queryId;

      supabase.from("audit_events").insert({
        event_type: "query_submitted", actor_id: user.id,
        resource_type: "query", resource_id: queryId,
        payload: {
          intent,
          v1_query_type: usesV1Engine ? v1QueryType : null,
          has_stock: !!stockSymbol,
          has_entry_price: !!entryPrice,
          has_qty: !!qty,
          custom_question_present: !!trimmedExtra,
          engine_version: usesV1Engine ? "v1_tier_shaped" : "v0_legacy",
          engine_source: usesV1Engine ? "post_query" : "legacy_post_query",
          credit_action: "skipped_no_charge_path",
        },
      }).then(({ error }) => { if (error) console.warn("audit insert failed", error); });

      if (usesV1Engine) {
        setGenStage("redirecting");
        await refresh();
        navigate({ to: "/report/$queryId", params: { queryId } });
        return;
      }

      setGenStage("generating");
      try {
        await runGenerateAiReport({ data: { queryId } });
        toast.success("AI context report ready · Analyst video within 24h");
      } catch (genErr) {
        const extractMsg = (e: unknown): string => {
          if (e instanceof Error) return e.message;
          if (e && typeof e === "object") {
            const obj = e as Record<string, unknown>;
            return (
              (typeof obj.message === "string" && obj.message) ||
              (typeof obj.data === "object" && obj.data && typeof (obj.data as Record<string, unknown>).message === "string"
                ? ((obj.data as Record<string, unknown>).message as string)
                : "") ||
              JSON.stringify(e).slice(0, 150)
            );
          }
          return String(e) || "Unknown error";
        };
        const errMsg = extractMsg(genErr);
        console.error("[generateAiReport] raw error object:", genErr);
        toast.error(`Report generation failed: ${errMsg}. Opening report — it will refresh once ready.`);
      }
      await refresh();
      setGenStage("redirecting");
      navigate({ to: "/report/$queryId", params: { queryId } });
    } catch (e) {
      console.error("[handleSubmit] failed", e);
      if (createdQueryId) {
        navigate({ to: "/report/$queryId", params: { queryId: createdQueryId } });
      } else {
        toast.error(`Could not create query: ${e instanceof Error ? e.message : "Unknown"}`);
        setGenStage("idle");
        setSubmitting(false);
      }
    }
  };

  return (
    <TooltipProvider>
    <Card className="border border-border bg-card/80 backdrop-blur p-6 md:p-8">
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Step {step + 1} of 3</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" /> Wallet: <span className="font-semibold text-foreground">₹{balance}</span>
        </div>
      </div>
      <Progress value={((step + 1) / 3) * 100} className="h-1.5 mb-6" />
      <div className="grid grid-cols-3 text-[11px] uppercase tracking-wider mb-6">
        {["Question", "Context", "Review"].map((t, i) => (
          <div key={t} className={`flex items-center gap-2 ${i === step ? "text-primary" : i < step ? "text-foreground" : "text-muted-foreground"}`}>
            <span className={`h-6 w-6 rounded-full border flex items-center justify-center text-[11px] ${i <= step ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{i + 1}</span>
            <span>{t}</span>
            {i < 2 && <ChevronRight className="h-3 w-3 ml-auto text-border" />}
          </div>
        ))}
      </div>

      {/* ===== STEP 0: QUESTION ===== */}
      {step === 0 && (
        <div className="space-y-5">
          <div>
            <Label htmlFor="qtext" className="text-base">What's your question? *</Label>
            <Textarea id="qtext" autoFocus rows={5} value={queryText} onChange={(e) => setQueryText(e.target.value)}
              placeholder="e.g. I bought Siemens at 3668 a year back, should I sell now?"
              className="mt-2 text-base" />
            <p className="text-[11px] text-muted-foreground mt-1 text-right">{queryText.length}/500</p>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quick examples</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUESTION_EXAMPLES.map((q) => (
                <button
                  key={q.text}
                  type="button"
                  onClick={() => {
                    setQueryText(q.text);
                    if (isLiveIntent(q.intent)) setIntent(q.intent);
                  }}
                  className="rounded-full border border-border bg-background hover:border-primary/40 px-3 py-1.5 text-xs"
                >
                  {q.text}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Question type</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUERY_TYPES.map((t) => (
                <button key={t.id} type="button" onClick={() => setIntent(t.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${intent === t.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}>
                  <span className="mr-1.5">{t.emoji}</span>{t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== STEP 1: CONTEXT (dynamic by intent) ===== */}
      {step === 1 && (
        <div className="space-y-5">
          {Object.keys(autoDetected).length > 0 && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Auto-detected from your question — edit if wrong</span>
            </div>
          )}

          {showStockFields && (
            <div>
              <Label>Stock *</Label>
              <StockAutocomplete
                value={stockName ? { symbol: stockSymbol || stockName, name: stockName, sector: "" } as NseStock : null}
                onSelect={(s) => { setStockName(s.name); setStockSymbol(s.symbol); }}
                onClear={() => { setStockName(""); setStockSymbol(""); }}
              />
            </div>
          )}

          {showStockFields && !showPhase2Fields && (
            <div className="grid sm:grid-cols-2 gap-3 items-start">
              {showBuyPrice && (
                <div className="space-y-1.5">
                  <Label htmlFor="buy" className="flex items-center gap-1 h-5 leading-5">
                    <span>Buy Price *</span>
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent className="text-xs max-w-[200px]">Your average entry price for this position.</TooltipContent>
                    </Tooltip>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                    <Input id="buy" className="pl-7 h-10" type="number" inputMode="decimal" placeholder="3668" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} />
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="current" className="flex items-center gap-1 h-5 leading-5">
                  <span>Current Price *</span>
                  <Tooltip>
                    <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
                    <TooltipContent className="text-xs max-w-[220px]">Enter the stock price you see right now so the AI report uses your latest context.</TooltipContent>
                  </Tooltip>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                  <Input id="current" className="pl-7 h-10" type="number" inputMode="decimal" placeholder="3589" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} />
                </div>
              </div>
              {showBuyPrice && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="holding" className="flex items-center h-5 leading-5">Holding duration *</Label>
                  <Select value={holding} onValueChange={setHolding}>
                    <SelectTrigger id="holding" className="h-10"><SelectValue placeholder="Select duration" /></SelectTrigger>
                    <SelectContent>{HOLD_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {showPhase2Fields && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3 items-start">
                <div className="space-y-1.5">
                  <Label htmlFor="entry" className="flex items-center gap-1 h-5 leading-5">
                    <span>Entry Price *</span>
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent className="text-xs max-w-[220px]">Your average buy price for this position. Used to compute unrealized P/L.</TooltipContent>
                    </Tooltip>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                    <Input id="entry" className="pl-7 h-10" type="number" inputMode="decimal" step="0.01" min="0" placeholder="3668.00"
                      value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qty" className="flex items-center gap-1 h-5 leading-5">
                    <span>Quantity {isAveraging ? "*" : "(optional)"}</span>
                  </Label>
                  <Input id="qty" className="h-10" type="number" inputMode="numeric" step="1" min="1" placeholder="e.g. 25"
                    value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Investment horizon *</Label>
                <Select value={horizon} onValueChange={setHorizon}>
                  <SelectTrigger><SelectValue placeholder="How long do you plan to hold?" /></SelectTrigger>
                  <SelectContent>{HORIZON_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="extra" className="flex items-center h-5 leading-5">Anything else? (optional)</Label>
                <Textarea id="extra" rows={3} maxLength={500} placeholder="Any extra context — preserved verbatim, never sent to AI."
                  value={anythingElse} onChange={(e) => setAnythingElse(e.target.value)} className="mt-1.5" />
                <p className="text-[11px] text-muted-foreground mt-1 text-right">{anythingElse.length}/500</p>
              </div>
            </div>
          )}

          {intent === "buy_decision" && (
            <div>
              <Label>Investment horizon *</Label>
              <Select value={horizon} onValueChange={setHorizon}>
                <SelectTrigger><SelectValue placeholder="How long do you plan to hold?" /></SelectTrigger>
                <SelectContent>{HORIZON_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {(intent === "educational" || intent === "sector_view") && (
            <div>
              <Label className="flex items-center gap-1">
                Related stock (optional)
                <Tooltip>
                  <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
                  <TooltipContent className="text-xs max-w-[220px]">Optional — pick a stock to anchor the educational context.</TooltipContent>
                </Tooltip>
              </Label>
              <StockAutocomplete
                value={stockName ? { symbol: stockSymbol || stockName, name: stockName, sector: "" } as NseStock : null}
                onSelect={(s) => { setStockName(s.name); setStockSymbol(s.symbol); }}
                onClear={() => { setStockName(""); setStockSymbol(""); }}
              />
            </div>
          )}

          <div>
            <Label>Choose analyst (optional)</Label>
            <div className="grid sm:grid-cols-2 gap-2 mt-1">
              <button type="button" onClick={() => setAnalystId(null)}
                className={`text-left rounded-xl border p-3 transition ${analystId === null ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                <p className="text-sm font-semibold">Auto-assign best fit</p>
                <p className="text-xs text-muted-foreground">SEBI analyst within 24h</p>
              </button>
              {analysts.map((a) => (
                <button key={a.id} type="button" onClick={() => setAnalystId(a.id)}
                  className={`text-left rounded-xl border p-3 transition ${analystId === a.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                  <p className="text-sm font-semibold">{a.display_name}</p>
                  <p className="text-[11px] text-muted-foreground">SEBI {a.sebi_reg_number} · ⭐ {Number(a.rating ?? 5).toFixed(1)}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Language preference</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{LANG_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* ===== STEP 2: REVIEW ===== */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-background/60 p-5 space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Your question</p>
              <p className="text-sm mt-1 whitespace-pre-wrap">{queryText}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm border-t border-border pt-3">
              <Field label="Type" value={QUERY_TYPES.find((q) => q.id === intent)?.label ?? "—"} />
              {stockName && <Field label="Stock" value={`${stockName}${stockSymbol ? ` (${stockSymbol})` : ""}`} />}
              {buyPrice && <Field label="Buy Price" value={`₹${buyPrice}`} />}
              {currentPrice && <Field label="Current Price" value={`₹${currentPrice}`} />}
              {holding && <Field label="Holding" value={holding} />}
              {horizon && <Field label="Horizon" value={horizon} />}
              <Field label="Language" value={language} />
            </div>
          </div>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span><strong>AI Context Report:</strong> included free</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span><strong>SEBI Analyst Video:</strong> included within 24h of submission</span>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">Both are part of the same deliverable — not separate purchases.</p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox checked={agreeDisclaimer} onCheckedChange={(c) => setAgreeDisclaimer(c === true)} className="mt-1" />
            <span className="text-xs text-muted-foreground leading-relaxed">
              I understand the AI report is educational context only — not SEBI investment advice. Personalized recommendations come from a SEBI-Registered Research Analyst within 24 hours.
            </span>
          </label>
        </div>
      )}

      {submitting && (
        <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {genStage === "creating" && "Submitting your query…"}
                {genStage === "generating" && "Generating your AI context report…"}
                {genStage === "redirecting" && "Opening your report…"}
                {genStage === "idle" && "Working…"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                This usually takes 10–30 seconds. The page will open automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-7 mt-2 border-t border-border">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {step < 2 ? (
          <Button onClick={goNext}>Continue <ArrowRight className="h-4 w-4 ml-1" /></Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting || !agreeDisclaimer}
            className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-95 px-6">
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4 mr-2" /> Generate Report</>}
          </Button>
        )}
      </div>
    </Card>
    </TooltipProvider>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
