import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, ArrowRight, ChevronRight, Loader2, Sparkles, Wallet, Lightbulb, X } from "lucide-react";
import { StockAutocomplete } from "@/components/common/StockAutocomplete";
import { useQueryTypeDetection } from "@/hooks/useQueryTypeDetection";
import type { NseStock } from "@/data/nseStocks";

const QUERY_TYPES = [
  { id: "sell_or_hold", emoji: "🤔", label: "Sell or Hold?" },
  { id: "should_average", emoji: "📉", label: "Should I Average?" },
  { id: "stop_loss", emoji: "🛑", label: "Set Stop Loss" },
  { id: "target", emoji: "🎯", label: "Set Target" },
  { id: "long_term", emoji: "📅", label: "Long Term View" },
  { id: "fresh_entry", emoji: "🆕", label: "Fresh Entry" },
  { id: "other", emoji: "❓", label: "Other" },
];

const HOLD_OPTIONS = ["< 1 week", "1-4 weeks", "1-3 months", "3-12 months", "1+ year"];
const LANG_OPTIONS = ["English", "Hindi", "Other"];

const REPORT_COST = 49;

const stepSchema = [
  z.object({
    stock_name: z.string().trim().min(2, "Stock name required").max(80),
    buy_price: z.number().nullable(),
    current_price: z.number().nullable(),
    holding: z.string().min(1),
  }),
  z.object({
    query_type: z.string().min(1, "Pick a category"),
    query_text: z.string().trim().min(20, "Add at least 20 chars").max(500),
    language: z.string().min(1),
  }),
];

export function QueryForm() {
  const navigate = useNavigate();
  const { user, profile, refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [stockName, setStockName] = useState("");
  const [stockSymbol, setStockSymbol] = useState("");
  const [buyPrice, setBuyPrice] = useState<string>("");
  const [currentPrice, setCurrentPrice] = useState<string>("");
  const [holding, setHolding] = useState("");
  const [queryType, setQueryType] = useState("");
  const [queryText, setQueryText] = useState("");
  const [analystId, setAnalystId] = useState<string | null>(null);
  const [language, setLanguage] = useState("English");
  const [agreeDisclaimer, setAgreeDisclaimer] = useState(false);

  const { data: analysts = [] } = useQuery({
    queryKey: ["available-analysts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("analyst_profiles")
        .select("id, display_name, sebi_reg_number, avatar_url, specializations, rating")
        .eq("is_approved", true)
        .eq("is_available", true)
        .limit(6);
      return data ?? [];
    },
  });

  const pnl = useMemo(() => {
    const bp = parseFloat(buyPrice);
    const cp = parseFloat(currentPrice);
    if (!bp || !cp) return null;
    return ((cp - bp) / bp) * 100;
  }, [buyPrice, currentPrice]);

  const balance = profile?.wallet_balance ?? 0;
  const isFirstFree = balance >= 100; // signup bonus intact
  const effectiveCost = isFirstFree ? 0 : REPORT_COST;
  const canAfford = balance >= effectiveCost;

  const goNext = () => {
    const data = step === 0
      ? { stock_name: stockName, buy_price: buyPrice ? Number(buyPrice) : null, current_price: currentPrice ? Number(currentPrice) : null, holding }
      : { query_type: queryType, query_text: queryText, language };
    const result = stepSchema[step].safeParse(data);
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? "Please complete this step");
      return;
    }
    setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    if (!user) { toast.error("You must be signed in"); return; }
    if (!agreeDisclaimer) { toast.error("Please accept the SEBI disclaimer"); return; }
    if (!canAfford) { toast.error(`Add ₹${effectiveCost - balance} to your wallet to continue`); return; }

    setSubmitting(true);
    try {
      const { data: inserted, error: qErr } = await supabase
        .from("queries")
        .insert({
          user_id: user.id,
          stock_name: stockName,
          stock_symbol: stockSymbol || null,
          buy_price: buyPrice ? Number(buyPrice) : null,
          current_price: currentPrice ? Number(currentPrice) : null,
          query_text: queryText,
          query_type: queryType,
          assigned_analyst_id: analystId,
          status: "pending",
        })
        .select("id")
        .single();
      if (qErr || !inserted) throw qErr ?? new Error("Failed to create query");

      const queryId = inserted.id as string;

      const chosenAnalyst = analysts.find((a) => a.id === analystId);
      const { data: ai, error: aiErr } = await supabase.functions.invoke("gemini-analysis", {
        body: {
          stockName, stockSymbol, buyPrice: buyPrice ? Number(buyPrice) : null,
          currentPrice: currentPrice ? Number(currentPrice) : null,
          queryText, queryType,
          analystName: chosenAnalyst?.display_name ?? null,
          analystSebi: chosenAnalyst?.sebi_reg_number ?? null,
        },
      });
      if (aiErr || !ai?.report) throw aiErr ?? new Error("AI analysis failed");

      await supabase.from("queries").update({ ai_report: ai.report, status: "ai_answered" }).eq("id", queryId);

      if (effectiveCost > 0) {
        await supabase.rpc("deduct_wallet_balance", {
          _user_id: user.id,
          _amount: effectiveCost,
          _description: `AI Report — ${stockName}`,
          _query_id: queryId,
        });
        await refresh();
      }

      toast.success("AI report ready. Expert video review queued (≤24h).");
      navigate({ to: "/report/$queryId", params: { queryId } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast.error(`Report generation failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border border-border bg-card/80 backdrop-blur p-6 md:p-8">
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Step {step + 1} of 3</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          Wallet: <span className="font-semibold text-foreground">₹{balance}</span>
        </div>
      </div>
      <Progress value={((step + 1) / 3) * 100} className="h-1.5 mb-6" />
      <div className="grid grid-cols-3 text-[11px] uppercase tracking-wider mb-6">
        {["Stock", "Query", "Review"].map((t, i) => (
          <div key={t} className={`flex items-center gap-2 ${i === step ? "text-primary" : i < step ? "text-foreground" : "text-muted-foreground"}`}>
            <span className={`h-6 w-6 rounded-full border flex items-center justify-center text-[11px] ${i <= step ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{i + 1}</span>
            <span>{t}</span>
            {i < 2 && <ChevronRight className="h-3 w-3 ml-auto text-border" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-5">
          <div>
            <Label>Stock *</Label>
            <StockAutocomplete
              autoFocus
              value={stockName ? { symbol: stockSymbol || stockName, name: stockName, sector: "" } as NseStock : null}
              onSelect={(s) => { setStockName(s.name); setStockSymbol(s.symbol); }}
              onClear={() => { setStockName(""); setStockSymbol(""); }}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="buy">Buy Price</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                <Input id="buy" className="pl-7" type="number" inputMode="decimal" placeholder="85.00" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Leave blank if fresh entry</p>
            </div>
            <div>
              <Label htmlFor="cmp">Current Market Price</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                <Input id="cmp" className="pl-7" type="number" inputMode="decimal" placeholder="67.40" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} />
              </div>
              {pnl !== null && (
                <Badge className={`mt-2 ${pnl >= 0 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300"}`}>
                  {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}% {pnl >= 0 ? "profit" : "loss"}
                </Badge>
              )}
            </div>
          </div>
          <div>
            <Label>Holding duration *</Label>
            <Select value={holding} onValueChange={setHolding}>
              <SelectTrigger><SelectValue placeholder="Select duration" /></SelectTrigger>
              <SelectContent>
                {HOLD_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <Label>What kind of question? *</Label>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              {QUERY_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setQueryType(t.id)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${queryType === t.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/40"}`}
                >
                  <span className="mr-1.5">{t.emoji}</span>{t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="qtext">Describe your situation *</Label>
            <Textarea id="qtext" maxLength={500} rows={6} value={queryText} onChange={(e) => setQueryText(e.target.value)}
              placeholder="e.g. I bought IDFC First Bank at ₹85 in Jan 2024. It's now at ₹67. I have ₹50,000 more to invest. Should I average down, hold as is, or exit with a loss?" />
            <p className="text-[11px] text-muted-foreground mt-1 text-right">{queryText.length}/500</p>
          </div>
          <div>
            <Label>Choose analyst (optional)</Label>
            <div className="grid sm:grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => setAnalystId(null)}
                className={`text-left rounded-xl border p-3 transition ${analystId === null ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <p className="text-sm font-semibold">Let us assign automatically</p>
                <p className="text-xs text-muted-foreground">Best-fit SEBI analyst within 24h</p>
              </button>
              {analysts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAnalystId(a.id)}
                  className={`text-left rounded-xl border p-3 transition ${analystId === a.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
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

      {step === 2 && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-background/60 p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Stock" value={`${stockName}${stockSymbol ? ` (${stockSymbol})` : ""}`} />
              <Field label="Holding" value={holding} />
              <Field label="Buy Price" value={buyPrice ? `₹${buyPrice}` : "—"} />
              <Field label="Current Price" value={currentPrice ? `₹${currentPrice}` : "—"} />
              <Field label="Question type" value={QUERY_TYPES.find((q) => q.id === queryType)?.label ?? "—"} />
              <Field label="Language" value={language} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Your question</p>
              <p className="text-sm mt-1 whitespace-pre-wrap">{queryText}</p>
            </div>
          </div>

          <div className={`rounded-xl p-4 border ${canAfford ? "border-primary/30 bg-primary/5" : "border-red-500/40 bg-red-500/5"}`}>
            {isFirstFree ? (
              <p className="text-sm"><span className="font-semibold text-primary">AI Report: FREE</span> · Using your signup bonus (₹100 wallet)</p>
            ) : canAfford ? (
              <p className="text-sm">AI Report: <span className="font-semibold">₹{REPORT_COST}</span> will be deducted from wallet (balance ₹{balance})</p>
            ) : (
              <p className="text-sm text-red-600 dark:text-red-400">Insufficient credits. Add ₹{REPORT_COST - balance} to continue.</p>
            )}
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox checked={agreeDisclaimer} onCheckedChange={(c) => setAgreeDisclaimer(c === true)} className="mt-1" />
            <span className="text-xs text-muted-foreground leading-relaxed">
              I understand this AI-generated report is educational content only and not SEBI-registered investment advice. I will consult a SEBI-registered Research Analyst before acting on any recommendation.
            </span>
          </label>
        </div>
      )}

      <div className="flex items-center justify-between pt-7 mt-2 border-t border-border">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {step < 2 ? (
          <Button onClick={goNext}>Continue <ArrowRight className="h-4 w-4 ml-1" /></Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting || !agreeDisclaimer || !canAfford}
            className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-95 px-6">
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4 mr-2" /> Get AI Report Now</>}
          </Button>
        )}
      </div>
    </Card>
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
