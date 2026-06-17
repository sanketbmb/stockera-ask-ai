import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ENABLE_SECTOR_VIEW,
  ENABLE_EDUCATIONAL,
  
  isRoutableIntent,
  type AnyIntent,
} from "@/lib/feature-flags";
import {
  type RouterOutput,
  toFormIntent,
  routerHorizonToFormHorizon,
  confidenceBand,
} from "@/lib/intent-router-schema";
import { resolveSector, sectorDisplay } from "@/lib/sector-alias-map";
import { detectSectorFromText, allGroupedSectors } from "@/lib/sector-keyword-detector";
import { inferSectorFromText, type InferredSector } from "@/lib/sector-infer.functions";
import { inferConceptFromText, type InferredConcept } from "@/lib/concept-infer.functions";
import { resolveConcept } from "@/lib/concept-alias-map";
import { getLtpForSymbol } from "@/lib/market.functions";
import { useWalletBalance, useWalletRealtime } from "@/lib/points";
import { checkPaywallGate, type PaywallGateResult } from "@/lib/paywall";
import { PaywallDialog } from "@/components/paywall/PaywallDialog";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Info,
  Loader2,
  Sparkles,
  Wallet,
  CheckCircle2,
  Wand2,
} from "lucide-react";

import { StockAutocomplete } from "@/components/common/StockAutocomplete";
import type { NseStock } from "@/data/nseStocks";
import { detectAmbiguousStem } from "@/lib/symbol-ambiguity-gate";


type Intent = AnyIntent;

// Phase 2.1 — 2 examples per live chip. Each entry pre-selects the matching
// visible intent so a hidden type can never be silently chosen.
const QUESTION_EXAMPLES: { text: string; intent: Intent }[] = [
  // Stock — Fresh Entry
  { text: "Should I buy ICICIBANK for the next 6 months?", intent: "buy_decision" },
  // Stock — Sell or Hold
  { text: "I bought HDFC Bank at 1850 last year, should I sell now?", intent: "stuck_position" },
  // Stock — Should I Average
  { text: "I'm at a loss in Suzlon, should I average down?", intent: "should_average" },
  // General — Sector View
  { text: "How will the banking sector perform in the next 12 months?", intent: "sector_view" },
  // General — Educational
  { text: "What is RSI and how should I use it?", intent: "educational" },
  // General — Ask Anything (Other)
  { text: "What is the overall market mood right now?", intent: "other" },
];

const ALL_QUERY_TYPES: {
  id: Intent;
  label: string;
  emoji: string;
  group: "stock" | "general";
  description: string;
  phase3?: boolean;
  sectorOnly?: boolean;
  educationalOnly?: boolean;
  routerOnly?: boolean;
}[] = [
  { id: "buy_decision", emoji: "🆕", label: "Fresh Entry", group: "stock", description: "Thinking of buying a stock" },
  { id: "stuck_position", emoji: "🤔", label: "Sell or Hold", group: "stock", description: "Already own it — exit or hold?" },
  { id: "should_average", emoji: "📉", label: "Should I Average", group: "stock", description: "At a loss — average down?" },
  // Phase 3B — Sector View ships independently of the broader phase 3 unlock.
  { id: "sector_view", emoji: "🏭", label: "Sector View", group: "general", description: "How will a whole sector perform?", sectorOnly: true },
  // Phase 3C — Educational ships independently of the broader phase 3 unlock.
  { id: "educational", emoji: "📚", label: "Educational", group: "general", description: "Concept / indicator explainer", educationalOnly: true },
  // Phase 3D — "Ask Anything" now generates a real AI report.
  { id: "other", emoji: "❓", label: "Ask Anything", group: "general", description: "Any other market question", routerOnly: true },
];

const QUERY_TYPES = ALL_QUERY_TYPES.filter((t) => {
  if (t.phase3) return ENABLE_PHASE3_QUERY_TYPES;
  if (t.sectorOnly) return ENABLE_SECTOR_VIEW || ENABLE_PHASE3_QUERY_TYPES;
  if (t.educationalOnly) return ENABLE_EDUCATIONAL || ENABLE_PHASE3_QUERY_TYPES;
  if (t.routerOnly) return ENABLE_FREE_TEXT_ROUTER;
  return true;
});

const HOLD_OPTIONS = ["< 1 week", "1-4 weeks", "1-3 months", "3-12 months", "1+ year"];
const HORIZON_OPTIONS = [
  "Intraday",
  "Short-term (<3mo)",
  "Medium-term (3-12mo)",
  "Long-term (1+ year)",
];
const LANG_OPTIONS = ["English", "Hindi", "Other"];

// Phase 3A — the heuristic classifier is retained only as an offline
// fallback when the router is disabled. When ENABLE_FREE_TEXT_ROUTER is
// true, classification happens server-side via classifyIntentRouter.
function heuristicClassify(text: string): Intent {
  const t = text.toLowerCase();
  if (/\b(average|averaging|buy more|double down)\b/.test(t)) return "should_average";
  if (
    /\b(should i buy|fresh entry|entry point|invest in)\b/.test(t) &&
    !/\b(stuck|loss|holding)\b/.test(t)
  )
    return "buy_decision";
  if (/\b(sell|exit|stuck|loss|hold|book profit)\b/.test(t)) return "stuck_position";
  return "other";
}

export function QueryForm() {
  const navigate = useNavigate();
  const runGenerateAiReport = useServerFn(generateAiReport);
  const runIntentRouter = useServerFn(classifyIntentRouter);
  const runInferSector = useServerFn(inferSectorFromText);
  const runInferConcept = useServerFn(inferConceptFromText);
  const { user, profile, refresh } = useAuth();
  const [step, setStep] = useState(0); // 0=Question, 1=Context, 2=Review
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [queryText, setQueryText] = useState("");
  const [intent, setIntent] = useState<Intent>("other");
  const [chipManuallyPicked, setChipManuallyPicked] = useState(false);
  const [routerMeta, setRouterMeta] = useState<RouterOutput | null>(null);
  const [routerLoading, setRouterLoading] = useState(false);
  const [routerNotice, setRouterNotice] = useState<string | null>(null);
  const [autoDetected, setAutoDetected] = useState<{
    stock?: string;
    buyPrice?: number;
    qty?: number;
    horizon?: string;
    holding?: string;
  }>({});

  // Step 2
  const [stockName, setStockName] = useState("");
  const [stockSymbol, setStockSymbol] = useState("");
  // Track exchange of the selected stock so we can block BSE-only submissions
  // before the user reaches a downstream pipeline that is NSE-only.
  const [stockExchange, setStockExchange] = useState<"NSE" | "BSE" | "">("");
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
  // Wave 1 Fix #3 — LTP autofill state
  const [ltpAutofillState, setLtpAutofillState] = useState<"idle" | "loading" | "filled" | "stale">("idle");
  const fetchLtp = useServerFn(getLtpForSymbol);
  useEffect(() => {
    let cancelled = false;
    const sym = (stockSymbol || "").trim();
    if (!sym || !showStockFields || showPhase2Fields) {
      setLtpAutofillState("idle");
      return;
    }
    setLtpAutofillState("loading");
    fetchLtp({ data: { symbol: sym } })
      .then((res) => {
        if (cancelled) return;
        if (res.ltp != null && !res.stale) {
          // Autofill only if user hasn't already typed a value.
          setCurrentPrice((prev) => (prev && prev.trim() !== "" ? prev : String(res.ltp)));
          setLtpAutofillState("filled");
        } else {
          setLtpAutofillState("stale");
        }
      })
      .catch(() => {
        if (!cancelled) setLtpAutofillState("stale");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockSymbol]);

  // Step 3
  const [agreeDisclaimer, setAgreeDisclaimer] = useState(false);
  const [manualSector, setManualSector] = useState<string | null>(null);
  // Mission 1.6 Phase 2 — LLM-inferred sector when regex misses.
  const [inferredSector, setInferredSector] = useState<InferredSector | null>(null);
  const [inferringSector, setInferringSector] = useState(false);
  const sectorInferCache = useRef<Map<string, InferredSector>>(new Map());
  // Phase 2B — LLM-inferred concept for Educational when alias map misses.
  const [inferredConcept, setInferredConcept] = useState<InferredConcept | null>(null);
  const [inferringConcept, setInferringConcept] = useState(false);
  const conceptInferCache = useRef<Map<string, InferredConcept>>(new Map());

  // Phase 3A — apply a router classification to the form state.
  function applyRouterResult(r: RouterOutput) {
    setRouterMeta(r);
    const formIntent = toFormIntent(r.interpreted_type);
    const band = confidenceBand(r.confidence_score);

    // Manual-chip-wins logic: if the user picked a chip BEFORE we
    // classified, only override on a clear high-confidence mismatch.
    const userChip = chipManuallyPicked ? intent : null;
    let nextIntent: Intent = intent;
    if (userChip == null) {
      nextIntent = formIntent;
    } else if (userChip !== formIntent && band === "high") {
      nextIntent = formIntent;
      const newLabel = QUERY_TYPES.find((q) => q.id === formIntent)?.label ?? formIntent;
      toast.message(`Updated question type to “${newLabel}” based on your wording.`);
    }
    setIntent(nextIntent);

    // Phase 3D — for non-stock intents (sector / educational / other) the
    // downstream pipeline is cheap and deterministic, so we always honor the
    // router even on low confidence — the alternative is a useless "couldn't
    // classify" toast on a question that should have generated a report.
    if (band === "low") {
      const isGeneralIntent =
        formIntent === "sector_view" ||
        formIntent === "educational" ||
        formIntent === "other";
      if (isGeneralIntent && userChip == null) {
        setIntent(formIntent);
        setRouterNotice(null);
        return;
      }
      setRouterNotice(
        "We couldn’t classify your question confidently — submitting as “Ask Anything”. You'll still get an AI overview.",
      );
      if (userChip == null) setIntent("other");
      return; // No prefill on low confidence — never fabricate.
    }

    if (band === "medium") {
      const label = QUERY_TYPES.find((q) => q.id === nextIntent)?.label ?? nextIntent;
      setRouterNotice(`Looks like “${label}”. Confirm or adjust the chip below before continuing.`);
    } else {
      setRouterNotice(null);
    }

    // Prefill — never invent values. Only set fields the router actually returned.
    const detected: {
      stock?: string;
      buyPrice?: number;
      qty?: number;
      horizon?: string;
      holding?: string;
    } = {};
    if (r.symbol && !stockName) {
      setStockName(r.symbol);
      setStockSymbol(r.symbol);
      detected.stock = r.symbol;
    }
    if (r.entry_price != null && r.entry_price > 0) {
      if (!entryPrice) setEntryPrice(String(r.entry_price));
      if (!buyPrice) setBuyPrice(String(r.entry_price));
      detected.buyPrice = r.entry_price;
    }
    if (r.qty != null && r.qty > 0 && !qty) {
      setQty(String(r.qty));
      detected.qty = r.qty;
    }
    const mappedHorizon = routerHorizonToFormHorizon(r.horizon);
    if (mappedHorizon && !horizon) {
      setHorizon(mappedHorizon);
      detected.horizon = mappedHorizon;
    }
    if (Object.keys(detected).length) setAutoDetected(detected);
  }

  const { data: analysts = [] } = useQuery({
    queryKey: ["available-analysts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("analyst_profiles")
        .select("id, display_name, sebi_reg_number, avatar_url, rating")
        .eq("is_approved", true)
        .eq("is_available", true)
        .limit(6);
      return data ?? [];
    },
  });

  const { data: walletBalance } = useWalletBalance(user?.id);
  useWalletRealtime(user?.id);
  const balance = walletBalance?.balance ?? 0;
  const showStockFields = ["stuck_position", "should_average", "buy_decision"].includes(intent);
  const showBuyPrice = ["stuck_position", "should_average"].includes(intent);
  // Phase 2 — existing position / averaging both ask for entry_price; averaging additionally requires qty.
  const isExistingPosition = intent === "stuck_position";
  const isAveraging = intent === "should_average";
  const showPhase2Fields = isExistingPosition || isAveraging;
  // Phase 2 — these intents now route into the v1 tier-shaped engine, same as Fresh Entry.
  const usesV1Engine = intent === "buy_decision" || isExistingPosition || isAveraging;
  // Phase 3A — "other" intent skips the v1 engine and lands in the routed-pending placeholder.
  const isOther = intent === "other";
  // Phase 3B — "sector_view" has its own freeze fn + report variant.
  const isSector = intent === "sector_view";
  // Phase 3C — "educational" has its own freeze fn + report variant.
  const isEducational = intent === "educational";

  const resetRouterState = () => {
    if (
      autoDetected.stock &&
      (stockName === autoDetected.stock || stockSymbol === autoDetected.stock)
    ) {
      setStockName("");
      setStockSymbol("");
    }
    if (autoDetected.buyPrice != null) {
      const detectedPrice = String(autoDetected.buyPrice);
      if (buyPrice === detectedPrice) setBuyPrice("");
      if (entryPrice === detectedPrice) setEntryPrice("");
    }
    if (autoDetected.qty != null && qty === String(autoDetected.qty)) setQty("");
    if (autoDetected.horizon && horizon === autoDetected.horizon) setHorizon("");
    if (autoDetected.holding && holding === autoDetected.holding) setHolding("");
    setRouterMeta(null);
    setRouterNotice(null);
    setAutoDetected({});
    setInferredConcept(null);
  };

  // Phase 3B + Mission 1.6 — sector auto-detection.
  // Priority: manual chip (sticky) > regex keyword > router hint > LLM inference.
  const detectedSector = useMemo(
    () => (isSector ? detectSectorFromText(queryText) : null),
    [isSector, queryText],
  );

  // Mission 1.6 Phase 2 — LLM fallback runs only when regex misses on long-enough text.
  // Debounced 600ms after textarea pause. Cached by question text to avoid re-calls.
  useEffect(() => {
    if (!isSector) return;
    // Sticky override: skip LLM entirely if user has manually picked a chip.
    if (manualSector) return;
    if (detectedSector) {
      setInferredSector(null);
      return;
    }
    const trimmed = queryText.trim();
    // Only attempt LLM inference for substantive text (> 8 words).
    if (trimmed.split(/\s+/).filter(Boolean).length < 8) {
      setInferredSector(null);
      return;
    }
    const cached = sectorInferCache.current.get(trimmed);
    if (cached) {
      setInferredSector(cached.canonical ? cached : null);
      return;
    }
    let cancelled = false;
    setInferringSector(true);
    const handle = setTimeout(async () => {
      try {
        const result = await runInferSector({ data: { text: trimmed } });
        if (cancelled) return;
        sectorInferCache.current.set(trimmed, result);
        setInferredSector(result.canonical ? result : null);
      } catch (err) {
        if (!cancelled) {
          console.warn("[sector-infer] client error", (err as Error).message);
          setInferredSector(null);
        }
      } finally {
        if (!cancelled) setInferringSector(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(handle);
      setInferringSector(false);
    };
  }, [isSector, manualSector, detectedSector, queryText, runInferSector]);

  const resolvedSector = isSector
    ? manualSector
      ? { canonical: manualSector, display: sectorDisplay(manualSector) }
      : detectedSector
        ? { canonical: detectedSector.canonical, display: detectedSector.display }
        : inferredSector?.canonical
          ? { canonical: inferredSector.canonical, display: sectorDisplay(inferredSector.canonical) }
          : routerMeta?.sector
            ? resolveSector(routerMeta.sector)
            : null
    : null;
  // Phase 3C — resolve concept from question text. Phase 2B adds LLM fallback.
  const aliasConcept = isEducational ? resolveConcept(queryText) : null;
  const resolvedConcept = aliasConcept
    ? aliasConcept
    : isEducational && inferredConcept?.canonical
      ? { canonical: inferredConcept.canonical, confidence: "alias" as const }
      : null;

  // ─ Phase 2 input sanitization ─
  const entryPriceNum = entryPrice ? Number(entryPrice) : NaN;
  const qtyNum = qty ? Number(qty) : NaN;
  const entryPriceValid =
    !showPhase2Fields ||
    (Number.isFinite(entryPriceNum) && entryPriceNum > 0 && /^\d+(\.\d{0,2})?$/.test(entryPrice));
  const qtyValid =
    !isAveraging || (Number.isFinite(qtyNum) && qtyNum > 0 && Number.isInteger(qtyNum));
  const anythingElseValid = anythingElse.length <= 500;

  const goNext = async () => {
    if (step === 0) {
      // Phase 3B/3C — sector + educational chips allow shorter input ("IT", "RSI").
      const minChars = isSector || isEducational ? 2 : 15;
      if (queryText.trim().length < minChars) {
        toast.error(
          isSector
            ? "Enter a sector name (e.g. Private Banks, IT, Energy)"
            : isEducational
              ? "Enter a concept like RSI, MACD, DCF, Beta, or Piotroski F-Score"
              : "Add at least 15 characters describing your question",
        );
        return;
      }
      // Phase 3A — call the free-text router before leaving Step 0 (unless
      // already called, or feature is off, or user explicitly picked the
      // sector / educational chip — in which case we resolve via alias map only).
      if (ENABLE_FREE_TEXT_ROUTER && !routerMeta && !routerLoading && !isSector && !isEducational) {
        setRouterLoading(true);
        try {
          const result = await runIntentRouter({ data: { text: queryText.trim() } });
          applyRouterResult(result);
          // On medium confidence we keep the user on Step 0 to confirm.
          if (confidenceBand(result.confidence_score) === "medium" && !chipManuallyPicked) {
            setRouterLoading(false);
            return;
          }
        } catch (err) {
          console.warn("[QueryForm] router failed:", (err as Error).message);
          if (!chipManuallyPicked) setIntent(heuristicClassify(queryText));
        } finally {
          setRouterLoading(false);
        }
      } else if (!ENABLE_FREE_TEXT_ROUTER && !chipManuallyPicked) {
        // Router disabled — use the legacy heuristic only.
        const detected = heuristicClassify(queryText);
        if (detected !== "other") setIntent(detected);
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      // Phase 3A — "other" skips stock/entry fields entirely.
      if (isOther) {
        setStep(2);
        return;
      }
      // Phase 3B — sector view requires a resolvable sector but no stock/entry fields.
      if (isSector) {
        if (!resolvedSector) {
          toast.error("Pick a sector from the list below to continue.");
          return;
        }
        setStep(2);
        return;
      }
      // Phase 3C + Phase 2B — educational requires a resolvable concept. If the
      // alias map misses, try LLM inference once before proceeding. We never
      // block with a red toast; on a true miss the report renderer falls back
      // to ConceptNotFoundPanel with suggestions.
      if (isEducational) {
        if (!aliasConcept && !inferredConcept?.canonical) {
          const key = queryText.trim().toLowerCase();
          const cached = conceptInferCache.current.get(key);
          let result: InferredConcept | null = cached ?? null;
          if (!result) {
            setInferringConcept(true);
            try {
              result = await runInferConcept({ data: { text: queryText.trim() } });
              conceptInferCache.current.set(key, result);
            } catch (err) {
              console.warn("[concept-infer] client error:", (err as Error).message);
              result = null;
            } finally {
              setInferringConcept(false);
            }
          }
          if (result?.canonical) {
            setInferredConcept(result);
            toast.success(`Concept inferred by AI · ${result.canonical}`);
          } else {
            // Silent advance — server renders ConceptNotFoundPanel with suggestions.
            toast.message("We'll show the closest matches on the next screen.");
          }
        }
        setStep(2);
        return;
      }
      if (showStockFields && !stockName) {
        toast.error("Please pick a stock");
        return;
      }
      if (showPhase2Fields) {
        if (!entryPrice) {
          toast.error("Please enter your entry price");
          return;
        }
        if (!entryPriceValid) {
          toast.error("Please re-check your entry price");
          return;
        }
        if (isAveraging && !qty) {
          toast.error("Please enter your quantity");
          return;
        }
        if (isAveraging && !qtyValid) {
          toast.error("Quantity must be a positive whole number");
          return;
        }
        if (!horizon) {
          toast.error("Please pick your investment horizon");
          return;
        }
        if (!anythingElseValid) {
          toast.error("Please keep the extra context under 500 characters");
          return;
        }
      } else {
        if (showBuyPrice && !buyPrice) {
          toast.error("Please enter your buy price");
          return;
        }
      }
      if (showStockFields && !showPhase2Fields && !currentPrice) {
        toast.error("Please enter the current stock price");
        return;
      }
      setStep(2);
      return;
    }
  };

  const [genStage, setGenStage] = useState<"idle" | "creating" | "generating" | "redirecting">(
    "idle",
  );

  const [paywallGate, setPaywallGate] = useState<PaywallGateResult | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const handleSubmit = async () => {
    if (!agreeDisclaimer) {
      toast.error("Please accept the SEBI disclaimer");
      return;
    }
    // Phase 3A — accept LIVE intents + "other" (when the router is live).
    if (!isRoutableIntent(intent)) {
      toast.error("Unsupported query type");
      return;
    }

    // W6.8 — Paywall gate (dark by default; fail-OPEN on any error).
    // W6.11 — corrected mapping: educational no longer masquerades as ai_report.
    const paywallActionKey =
      intent === "sector_view" ? "sector_view" :
      intent === "educational" ? "educational" :
      "ai_report";
    const gate = await checkPaywallGate(paywallActionKey, user?.id);
    console.log("[W6.11-DEBUG] gate result:", JSON.stringify(gate, null, 2), "actionKey:", paywallActionKey);
    if (!gate.allow) {
      setPaywallGate(gate);
      setPaywallOpen(true);
      return;
    }



    setSubmitting(true);
    setGenStage("creating");
    let createdQueryId: string | null = null;

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const freshUser = authData.user;
      if (authErr || !freshUser) {
        console.warn("[QueryForm] auth freshness check failed", {
          message: authErr?.message,
          status: authErr?.status,
          cachedUserId: user?.id ?? null,
        });
        toast.error(
          authErr?.message
            ? `Authentication check failed: ${authErr.message}`
            : "Authentication expired. Please sign in again.",
        );
        setGenStage("idle");
        setSubmitting(false);
        return;
      }

      // Phase: post-query universe hardening — block BSE-only stock submissions.
      // The downstream pipeline (finedge/compute-* modules) is NSE-coded; a BSE
      // selection would silently degrade. Stock-bearing intents only.
      const isStockIntent = usesV1Engine || (!isSector && !isEducational && !isOther);
      if (isStockIntent && stockExchange === "BSE") {
        toast.error(
          "This stock is currently supported on BSE only. Full analysis coverage is being added — please try another symbol.",
        );
        setGenStage("idle");
        setSubmitting(false);
        return;
      }

      const trimmedQueryText = queryText.trim();
      const routerMetaForInsert = routerMeta
        ? ({ ...routerMeta } as unknown as Record<string, unknown>)
        : null;
      const commonInsert = {
        user_id: freshUser.id,
        query_text: trimmedQueryText,
        assigned_analyst_id: analystId || null,
        ...(routerMetaForInsert ? { router_meta: routerMetaForInsert } : {}),
      };

      const v1QueryType =
        intent === "buy_decision" ? "fresh_entry" : isAveraging ? "averaging" : "existing_position";
      const trimmedExtra = anythingElse.trim();

      // Wave 5h Sub-track B — ambiguity gate. If the raw text contains a
      // family stem (ICICI, Tata Motors, Reliance, Adani) AND the user did
      // not explicitly pick a ticker via StockAutocomplete (which sets
      // stockExchange), override the symbol with the bare stem so the
      // freeze fn renders the picker instead of silently auto-resolving.
      const ambiguity = usesV1Engine
        ? detectAmbiguousStem(`${trimmedQueryText} ${trimmedExtra}`)
        : null;
      const userPickedTicker = !!stockExchange;
      const useStemOverride = !!ambiguity && !userPickedTicker;
      const effectiveStockSymbol = useStemOverride ? ambiguity!.stem : (stockSymbol || null);
      const effectiveStockName = useStemOverride
        ? ambiguity!.stem
        : stockName.trim();

      const insertPayload = usesV1Engine
        ? {
            ...commonInsert,
            stock_name: effectiveStockName,
            stock_symbol: effectiveStockSymbol,
            buy_price: buyPrice
              ? Number(buyPrice)
              : showPhase2Fields && entryPrice
                ? Number(entryPrice)
                : null,
            current_price: currentPrice ? Number(currentPrice) : null,
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

        : isSector
          ? {
              // Phase 3B — sector view. SectorViewReport's server fn freezes
              // the composed payload on first read; no Brain call here.
              ...commonInsert,
              stock_name: resolvedSector ? `Sector: ${resolvedSector.display}` : "Sector Query",
              stock_symbol: null,
              buy_price: null,
              current_price: null,
              status: "ai_answered" as const,
              query_type: "sector_view" as const,
              engine_version: "v1_sector_view",
              engine_source: "sector_aggregates",
              horizon: normalizeHorizon(horizon || "Medium-term (3-12mo)"),
              sector_canonical: resolvedSector?.canonical ?? null,
            }
          : isEducational
            ? {
                // Phase 3C — educational. EducationalReport's server fn freezes
                // the composed glossary payload on first read; no LLM call here.
                ...commonInsert,
                stock_name: resolvedConcept
                  ? `Concept: ${resolvedConcept.canonical}`
                  : "Educational Query",
                stock_symbol: null,
                buy_price: null,
                current_price: null,
                status: "ai_answered" as const,
                query_type: "educational" as const,
                engine_version: "v1_educational",
                engine_source: "glossary_library",
                concept_canonical: resolvedConcept?.canonical ?? null,
              }
              : isOther
                ? {
                    // Phase 3D — "other" now generates a Gemini-backed
                    // analyst-style AI report. GeneralReport's freeze fn runs
                    // on first read.
                    ...commonInsert,
                    stock_name: "General Query",
                    stock_symbol: null,
                    buy_price: null,
                    current_price: null,
                    status: "ai_answered" as const,
                    query_type: "other" as const,
                    engine_version: "v1_general",
                    engine_source: "lovable_ai_gateway",
                  }
              : {
                  ...commonInsert,
                  stock_name: stockName.trim() || "Stock Query",
                  stock_symbol: stockSymbol || null,
                  buy_price: buyPrice ? Number(buyPrice) : null,
                  current_price: currentPrice ? Number(currentPrice) : null,
                  status: "pending" as const,
                  query_type: intent,
                };

      // Pre-flight payload validation — fail fast with precise message.
      const requiredByIntent: string[] = ["user_id", "stock_name", "query_text"];
      const missing = requiredByIntent.filter((k) => {
        const v = (insertPayload as Record<string, unknown>)[k];
        return v === undefined || v === null || v === "";
      });
      if (missing.length) {
        throw new Error(`Missing field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
      }
      // Strip undefined values (PostgREST rejects undefined leaks as 400s).
      for (const k of Object.keys(insertPayload as Record<string, unknown>)) {
        if ((insertPayload as Record<string, unknown>)[k] === undefined) {
          delete (insertPayload as Record<string, unknown>)[k];
        }
      }

      const payloadShape = Object.keys(insertPayload as Record<string, unknown>).sort();
      const { data: inserted, error: qErr } = await supabase
        .from("queries")
        .insert(insertPayload as never)
        .select("id")
        .single();
      if (qErr || !inserted) {
        const pgErr = qErr as null | {
          code?: string;
          message?: string;
          details?: string;
          hint?: string;
        };
        console.error("[queries.insert] failed", {
          code: pgErr?.code,
          message: pgErr?.message,
          details: pgErr?.details,
          hint: pgErr?.hint,
          payloadShape,
          intent,
          query_type: (insertPayload as { query_type?: string }).query_type,
          engine_version: (insertPayload as { engine_version?: string }).engine_version,
        });
        const composed = pgErr
          ? `[${pgErr.code ?? "no-code"}] ${pgErr.message ?? "no message"}${pgErr.hint ? ` — hint: ${pgErr.hint}` : ""}${pgErr.details ? ` — details: ${pgErr.details}` : ""}`
          : "Insert returned no row";
        const e = new Error(composed) as Error & { code?: string; details?: string; hint?: string };
        e.code = pgErr?.code;
        e.details = pgErr?.details;
        e.hint = pgErr?.hint;
        throw e;
      }

      const queryId = inserted.id as string;
      createdQueryId = queryId;

      // W6.11 — wallet debit (dark-by-default).
      // Only debit when paywall is actively enforced AND the action has a real cost.
      if (gate.paywall_active && gate.required_points > 0) {
        const debitActionKey = paywallActionKey;
        const debitPoints = gate.required_points;
        const { data: debitData, error: debitErr } = await supabase.rpc("wallet_apply_debit", {
          p_user_id: freshUser.id,
          p_action_key: debitActionKey,
          p_points: debitPoints,
          p_query_id: queryId,
          p_idempotency_key: `debit:${debitActionKey}:${queryId}`,
        });
        const debitStatus =
          (debitData && typeof debitData === "object" && "status" in debitData)
            ? (debitData as { status?: string }).status
            : undefined;
        if (debitErr) {
          console.error("[wallet_apply_debit] rpc error", debitErr);
          toast.error("Could not debit your wallet. Please try again.");
          setGenStage("idle");
          setSubmitting(false);
          return;
        }
        if (debitStatus === "insufficient_funds") {
          toast.error("Insufficient credits. Please top up to continue.");
          setGenStage("idle");
          setSubmitting(false);
          return;
        }
        // "ok" and "idempotent_replay" → continue normally.
      }


      supabase
        .from("audit_events")
        .insert({
          event_type: "query_submitted",
          actor_id: freshUser.id,
          resource_type: "query",
          resource_id: queryId,
          payload: {
            intent,
            v1_query_type: usesV1Engine ? v1QueryType : null,
            has_stock: !!stockSymbol,
            has_entry_price: !!entryPrice,
            has_qty: !!qty,
            custom_question_present: !!trimmedExtra,
            engine_version: usesV1Engine
              ? "v1_tier_shaped"
              : isSector
                ? "v1_sector_view"
                : isEducational
                  ? "v1_educational"
                    : isOther
                      ? "v1_general"
                      : "v0_legacy",
            engine_source: usesV1Engine
              ? "post_query"
              : isSector
                ? "sector_aggregates"
                : isEducational
                  ? "glossary_library"
                  : isOther
                    ? "lovable_ai_gateway"
                    : "legacy_post_query",
            credit_action: "skipped_no_charge_path",
            sector_canonical: isSector ? (resolvedSector?.canonical ?? null) : null,
            concept_canonical: isEducational ? (resolvedConcept?.canonical ?? null) : null,
            router_version: routerMeta?.router_version ?? null,
            router_interpreted_type: routerMeta?.interpreted_type ?? null,
            router_confidence: routerMeta?.confidence_score ?? null,
            router_clarification_needed: routerMeta?.clarification_needed ?? null,
            router_language_hint: routerMeta?.language_hint ?? null,
          },
        })
        .then(({ error }) => {
          if (error) console.warn("audit insert failed", error);
        });

      if (usesV1Engine || isOther || isSector || isEducational) {
        // v1 engine, sector view, educational, and "other" all navigate
        // immediately — none need the legacy generator.
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
              (typeof obj.data === "object" &&
              obj.data &&
              typeof (obj.data as Record<string, unknown>).message === "string"
                ? ((obj.data as Record<string, unknown>).message as string)
                : "") ||
              JSON.stringify(e).slice(0, 150)
            );
          }
          return String(e) || "Unknown error";
        };
        const errMsg = extractMsg(genErr);
        console.error("[generateAiReport] raw error object:", genErr);
        toast.error(
          `Report generation failed: ${errMsg}. Opening report — it will refresh once ready.`,
        );
      }
      await refresh();
      setGenStage("redirecting");
      navigate({ to: "/report/$queryId", params: { queryId } });
    } catch (e) {
      console.error("[handleSubmit] failed", e);
      if (createdQueryId) {
        navigate({ to: "/report/$queryId", params: { queryId: createdQueryId } });
      } else {
        const pgLike = e as {
          code?: string;
          message?: string;
          details?: string;
          hint?: string;
        } | null;
        const code = pgLike?.code;
        const msg =
          (e instanceof Error ? e.message : pgLike?.message) ||
          "Insert failed (no details from server)";
        console.error("[handleSubmit] pg error envelope", JSON.stringify({
          code, message: msg, details: pgLike?.details, hint: pgLike?.hint,
        }));
        let userMsg: string;
        if (code === "23514") {
          userMsg = "Value not allowed by a database check — please contact support (CODE: 23514)";
        } else if (code === "23502") {
          userMsg = `Missing required field: ${pgLike?.details || msg} (CODE: 23502)`;
        } else if (code === "23505") {
          userMsg = `This entry already exists: ${pgLike?.details || msg} (CODE: 23505)`;
        } else if (code === "42501") {
          userMsg = `Permission denied: ${msg} (CODE: 42501)`;
        } else if (code === "PGRST116") {
          userMsg = `Record not found: ${msg} (CODE: PGRST116)`;
        } else if (code) {
          userMsg = `Could not create query [${code}]: ${msg}`;
        } else {
          userMsg = `Could not create query: ${msg}`;
        }
        toast.error(userMsg, {
          description: pgLike?.hint || pgLike?.details || undefined,
          duration: 10000,
        });
        setGenStage("idle");
        setSubmitting(false);
      }
    }
  };

  return (
    <TooltipProvider>
      <Card className="border border-border bg-card/80 backdrop-blur p-6 md:p-8">
        <div className="flex items-center justify-between mb-2">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Step {step + 1} of 3
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Wallet:{" "}
            <span className="font-semibold text-foreground">₹{balance}</span>
          </div>
        </div>
        <Progress value={((step + 1) / 3) * 100} className="h-1.5 mb-6" />
        <div className="grid grid-cols-3 text-[11px] uppercase tracking-wider mb-6">
          {["Question", "Context", "Review"].map((t, i) => (
            <div
              key={t}
              className={`flex items-center gap-2 ${i === step ? "text-primary" : i < step ? "text-foreground" : "text-muted-foreground"}`}
            >
              <span
                className={`h-6 w-6 rounded-full border flex items-center justify-center text-[11px] ${i <= step ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
              >
                {i + 1}
              </span>
              <span>{t}</span>
              {i < 2 && <ChevronRight className="h-3 w-3 ml-auto text-border" />}
            </div>
          ))}
        </div>

        {/* ===== STEP 0: QUESTION ===== */}
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <Label htmlFor="qtext" className="text-base">
                {isSector
                  ? "Which sector? *"
                  : isEducational
                    ? "Which concept? *"
                    : "What's your question? *"}
              </Label>
              <Textarea
                id="qtext"
                autoFocus
                rows={isSector || isEducational ? 2 : 5}
                value={queryText}
                onChange={(e) => {
                  setQueryText(e.target.value);
                  resetRouterState();
                }}
                placeholder={
                  isSector
                    ? "Enter a sector like Private Banks, IT, Energy, Pharma"
                    : isEducational
                      ? "Ask about a concept like RSI, MACD, DCF, Beta, or Relative Strength"
                      : "e.g. I bought Siemens at 3668 a year back, should I sell now?"
                }
                className="mt-2 text-base"
              />
              <p className="text-[11px] text-muted-foreground mt-1 text-right">
                {queryText.length}/500
              </p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Quick examples
              </Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {QUESTION_EXAMPLES.map((q) => (
                  <button
                    key={q.text}
                    type="button"
                    onClick={() => {
                      setQueryText(q.text);
                      resetRouterState();
                      // Pre-select the chip for ANY routable intent (stock,
                      // sector, educational, ask-anything) so the example
                      // lands on the correct flow immediately.
                      if (isRoutableIntent(q.intent)) {
                        setIntent(q.intent);
                        setChipManuallyPicked(true);
                      }
                    }}
                    className="rounded-full border border-border bg-background hover:border-primary/40 px-3 py-1.5 text-xs"
                  >
                    {q.text}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Question type
              </Label>
              {(["stock", "general"] as const).map((group) => {
                const chips = QUERY_TYPES.filter((t) => t.group === group);
                if (chips.length === 0) return null;
                const heading =
                  group === "stock" ? "Stock questions" : "General questions";
                return (
                  <div key={group}>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                      {heading}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {chips.map((t) => {
                        const active = intent === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            title={t.description}
                            onClick={() => {
                              setIntent(t.id);
                              setChipManuallyPicked(true);
                              resetRouterState();
                            }}
                            className={`group rounded-xl border px-3 py-2 text-left transition min-w-[160px] ${
                              active
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border hover:border-primary/40"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 text-sm font-medium">
                              <span>{t.emoji}</span>
                              <span>{t.label}</span>
                            </div>
                            <p
                              className={`text-[11px] mt-0.5 leading-snug ${
                                active ? "text-primary/80" : "text-muted-foreground"
                              }`}
                            >
                              {t.description}
                            </p>
                          </button>
                        );
                      })}
                      {group === "stock" && (
                        <button
                          key="stock_picker_nav"
                          type="button"
                          aria-label="Which Stock Should I Buy? — AI-picked stocks (SP-1 verified)"
                          title="AI-picked stocks (SP-1 verified)"
                          onClick={() => navigate({ to: "/stock-picker" })}
                          className="group rounded-xl border px-3 py-2 text-left transition min-w-[160px] border-border hover:border-primary/40"
                        >
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <Wand2 className="h-3.5 w-3.5" />
                            <span>Which Stock Should I Buy?</span>
                          </div>
                          <p className="text-[11px] mt-0.5 leading-snug text-muted-foreground">
                            AI-picked stocks (SP-1 verified)
                          </p>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

            </div>

            {routerLoading && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Understanding your question…</span>
              </div>
            )}
            {inferringConcept && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Looking up that concept…</span>
              </div>
            )}
            {!inferringConcept && isEducational && inferredConcept?.canonical && !aliasConcept && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  Concept inferred by AI · <span className="font-mono">{inferredConcept.canonical}</span>
                </span>
              </div>
            )}
            {!routerLoading && routerNotice && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                {routerNotice}
              </div>
            )}
            {!routerLoading &&
              routerMeta &&
              !routerNotice &&
              confidenceBand(routerMeta.confidence_score) === "high" && (
                <p className="text-[11px] text-muted-foreground italic">
                  Auto-routed via free-text router · confidence: high
                  {routerMeta.symbol ? (
                    <>
                      {" "}
                      · <span className="font-mono not-italic">{routerMeta.symbol}</span>
                    </>
                  ) : null}
                </p>
              )}
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
                  value={
                    stockName
                      ? ({
                          symbol: stockSymbol || stockName,
                          name: stockName,
                          sector: "",
                        } as NseStock)
                      : null
                  }
                  onSelect={(s) => {
                    setStockName(s.name);
                    setStockSymbol(s.symbol);
                    setStockExchange(s.sector === "BSE" ? "BSE" : s.sector === "NSE" ? "NSE" : "");
                  }}
                  onClear={() => {
                    setStockName("");
                    setStockSymbol("");
                    setStockExchange("");
                  }}
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
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-[200px]">
                          Your average entry price for this position.
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        ₹
                      </span>
                      <Input
                        id="buy"
                        className="pl-7 h-10"
                        type="number"
                        inputMode="decimal"
                        placeholder="3668"
                        value={buyPrice}
                        onChange={(e) => setBuyPrice(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="current" className="flex items-center gap-1 h-5 leading-5">
                    <span>Current Price *</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="text-xs max-w-[220px]">
                        Enter the stock price you see right now so the AI report uses your latest
                        context.
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      ₹
                    </span>
                    <Input
                      id="current"
                      className="pl-7 h-10"
                      type="number"
                      inputMode="decimal"
                      placeholder="3589"
                      value={currentPrice}
                      onChange={(e) => setCurrentPrice(e.target.value)}
                    />
                  </div>
                  {ltpAutofillState === "loading" && (
                    <p className="text-xs text-muted-foreground">Fetching live price…</p>
                  )}
                  {ltpAutofillState === "filled" && (
                    <p className="text-xs text-muted-foreground">Autofilled from latest cached price — edit if needed.</p>
                  )}
                  {ltpAutofillState === "stale" && (
                    <p className="text-xs text-muted-foreground">Could not fetch live price — please enter manually.</p>
                  )}
                </div>
                {showBuyPrice && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="holding" className="flex items-center h-5 leading-5">
                      Holding duration *
                    </Label>
                    <Select value={holding} onValueChange={setHolding}>
                      <SelectTrigger id="holding" className="h-10">
                        <SelectValue placeholder="Select duration" />
                      </SelectTrigger>
                      <SelectContent>
                        {HOLD_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
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
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-[220px]">
                          Your average buy price for this position. Used to compute unrealized P/L.
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        ₹
                      </span>
                      <Input
                        id="entry"
                        className="pl-7 h-10"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="3668.00"
                        value={entryPrice}
                        onChange={(e) => setEntryPrice(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="qty" className="flex items-center gap-1 h-5 leading-5">
                      <span>Quantity {isAveraging ? "*" : "(optional)"}</span>
                    </Label>
                    <Input
                      id="qty"
                      className="h-10"
                      type="number"
                      inputMode="numeric"
                      step="1"
                      min="1"
                      placeholder="e.g. 25"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label>Investment horizon *</Label>
                  <Select value={horizon} onValueChange={setHorizon}>
                    <SelectTrigger>
                      <SelectValue placeholder="How long do you plan to hold?" />
                    </SelectTrigger>
                    <SelectContent>
                      {HORIZON_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="extra" className="flex items-center h-5 leading-5">
                    Anything else? (optional)
                  </Label>
                  <Textarea
                    id="extra"
                    rows={3}
                    maxLength={500}
                    placeholder="Any extra context — preserved verbatim, never sent to AI."
                    value={anythingElse}
                    onChange={(e) => setAnythingElse(e.target.value)}
                    className="mt-1.5"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1 text-right">
                    {anythingElse.length}/500
                  </p>
                </div>
              </div>
            )}

            {intent === "buy_decision" && (
              <div>
                <Label>Investment horizon *</Label>
                <Select value={horizon} onValueChange={setHorizon}>
                  <SelectTrigger>
                    <SelectValue placeholder="How long do you plan to hold?" />
                  </SelectTrigger>
                  <SelectContent>
                    {HORIZON_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isSector && (
              <div className="space-y-4">
                <div
                  className={`rounded-xl border px-4 py-3 ${resolvedSector ? "border-emerald-500/30 bg-emerald-500/5" : "border-muted bg-muted/30"}`}
                >
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    {resolvedSector
                      ? manualSector
                        ? "Sector selected"
                        : detectedSector
                          ? "Sector auto-detected"
                          : "Sector inferred by AI"
                      : inferringSector
                        ? "Inferring sector…"
                        : "Pick a sector below"}
                    {inferringSector && !resolvedSector && (
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    )}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {resolvedSector
                      ? resolvedSector.display
                      : inferringSector
                        ? "Reading your question…"
                        : "We couldn't infer a sector from your question — pick one to continue."}
                  </p>
                  {detectedSector && !manualSector && (
                    <p
                      className="mt-1 text-[11px] text-muted-foreground"
                      title={`Matched: "${detectedSector.matched_keyword}"`}
                    >
                      Matched "{detectedSector.matched_keyword}" · confidence:{" "}
                      {detectedSector.confidence}
                    </p>
                  )}
                  {!detectedSector && !manualSector && inferredSector?.canonical && (
                    <p className="mt-1 text-[11px] text-muted-foreground italic">
                      AI inference · {Math.round(inferredSector.confidence * 100)}% confident
                      {inferredSector.reasoning ? ` · ${inferredSector.reasoning}` : ""}
                    </p>
                  )}
                  {manualSector && (
                    <button
                      type="button"
                      className="mt-2 text-[11px] underline text-muted-foreground hover:text-foreground"
                      onClick={() => setManualSector(null)}
                    >
                      Clear selection & use auto-detect
                    </button>
                  )}
                </div>


                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {resolvedSector ? "Or pick a different sector" : "Choose a sector"}
                  </Label>
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {allGroupedSectors().map((g) => (
                      <div key={g.group}>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                          {g.group}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {g.sectors.map((s) => {
                            const active = resolvedSector?.canonical === s.canonical;
                            return (
                              <button
                                key={s.canonical}
                                type="button"
                                onClick={() => setManualSector(s.canonical)}
                                className={`rounded-full px-3 py-1 text-xs border transition ${
                                  active
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "border-border bg-background hover:border-primary/40"
                                }`}
                              >
                                {s.display}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Horizon (optional)</Label>
                  <Select value={horizon} onValueChange={setHorizon}>
                    <SelectTrigger>
                      <SelectValue placeholder="Framing only — sector view doesn't change by horizon yet" />
                    </SelectTrigger>
                    <SelectContent>
                      {HORIZON_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1 italic">
                    Sector View uses one composed snapshot; horizon affects framing copy only.
                  </p>
                </div>
              </div>
            )}

            {isEducational && (
              <div
                className={`rounded-xl border px-4 py-3 ${
                  resolvedConcept
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-amber-500/40 bg-amber-500/5"
                }`}
              >
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Concept recognized
                </p>
                <p className="mt-0.5 text-sm font-semibold">
                  {resolvedConcept
                    ? resolvedConcept.canonical
                    : "Not recognized — try RSI, MACD, DCF, Beta, or Piotroski F-Score"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground italic">
                  Educational reports are explanatory, glossary-backed, and contain no buy/sell
                  verdicts.
                </p>
              </div>
            )}

            <div>
              <Label>Choose analyst (optional)</Label>
              <div className="grid sm:grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setAnalystId(null)}
                  className={`text-left rounded-xl border p-3 transition ${analystId === null ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <p className="text-sm font-semibold">Auto-assign best fit</p>
                  <p className="text-xs text-muted-foreground">SEBI analyst within 24h</p>
                </button>
                {analysts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAnalystId(a.id)}
                    className={`text-left rounded-xl border p-3 transition ${analystId === a.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    <p className="text-sm font-semibold">{a.display_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      SEBI {a.sebi_reg_number} · ⭐ {Number(a.rating ?? 5).toFixed(1)}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Language preference</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANG_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* ===== STEP 2: REVIEW ===== */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-background/60 p-5 space-y-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Your question
                </p>
                <p className="text-sm mt-1 whitespace-pre-wrap">{queryText}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm border-t border-border pt-3">
                <Field
                  label="Type"
                  value={QUERY_TYPES.find((q) => q.id === intent)?.label ?? "—"}
                />
                {stockName && (
                  <Field
                    label="Stock"
                    value={`${stockName}${stockSymbol ? ` (${stockSymbol})` : ""}`}
                  />
                )}
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
                <span>
                  <strong>AI Context Report:</strong> included free
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>
                  <strong>SEBI Analyst Video:</strong> included within 24h of submission
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1">
                Both are part of the same deliverable — not separate purchases.
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={agreeDisclaimer}
                onCheckedChange={(c) => setAgreeDisclaimer(c === true)}
                className="mt-1"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                I understand the AI report is educational context only — not SEBI investment advice.
                Personalized recommendations come from a SEBI-Registered Research Analyst within 24
                hours.
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
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < 2 ? (
            <Button onClick={goNext}>
              Continue <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !agreeDisclaimer}
              className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-95 px-6"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" /> Generate Report
                </>
              )}
            </Button>
          )}
        </div>
      </Card>
      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} gate={paywallGate} />
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
