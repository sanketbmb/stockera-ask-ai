import { Link } from "@tanstack/react-router";
import { Check, Sparkles, ArrowRight, TrendingUp, ShieldAlert, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "./motion-helpers";

const features = [
  "Verdict: BUY / HOLD / EXIT / AVERAGE",
  "Support & Resistance zones (NSE/BSE data)",
  "Recommended Stop Loss + Target",
  "Risk Score (1–10) with reasoning",
  "Behavioral warning (FOMO, anchoring, panic)",
  "Plain-English summary you can act on",
];

export function AIReportPreview() {
  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,hsl(var(--accent)/0.05),transparent_60%)] py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent">
              <Sparkles className="h-3.5 w-3.5" /> Powered by Helix + Real Market Data
            </div>
            <h2 className="mt-4 font-display text-3xl text-foreground sm:text-4xl">
              Your Personal Research Report — <span className="text-gradient">In 30 Seconds</span>
            </h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              Not another generic tip. A structured, data-backed report tailored to YOUR buy price and YOUR question.
            </p>
            <ul className="mt-6 space-y-2.5">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> {f}
                </li>
              ))}
            </ul>
            <Button asChild size="lg" className="mt-7 rounded-full bg-gradient-brand text-white shadow-glow-teal hover:opacity-95">
              <Link to="/post-query">Try Free — No Credit Card Needed <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <MockReportCard />
        </Reveal>
      </div>
    </section>
  );
}

function MockReportCard() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-brand-soft opacity-10 blur-3xl" />
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card-lg">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">AI Research Report</div>
            <div className="mt-0.5 font-display text-xl text-foreground">IDFC First Bank</div>
            <div className="text-xs text-muted-foreground">NSE: IDFCFIRSTB · CMP ₹67.20</div>
          </div>
          <span className="rounded-full bg-gold/20 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[hsl(var(--gold-foreground))]">
            HOLD
          </span>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">Confidence</span>
            <span className="font-mono font-semibold text-foreground">74%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-brand" style={{ width: "74%" }} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            { i: ShieldAlert, l: "Risk", v: "6/10", c: "text-warning" },
            { i: TrendingUp, l: "Reward", v: "7.5/10", c: "text-success" },
            { i: Target, l: "Horizon", v: "12m", c: "text-accent" },
          ].map((m) => (
            <div key={m.l} className="rounded-lg border border-border bg-secondary/40 px-2 py-2.5">
              <m.i className={`mx-auto h-4 w-4 ${m.c}`} />
              <div className="mt-1 text-[10px] uppercase text-muted-foreground">{m.l}</div>
              <div className="font-mono text-sm font-semibold text-foreground">{m.v}</div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Key Levels</div>
          <table className="mt-2 w-full text-sm">
            <tbody className="font-mono">
              <tr className="border-b border-border"><td className="py-1.5 text-muted-foreground">Support</td><td className="text-right text-success">₹60.00 / ₹56.50</td></tr>
              <tr className="border-b border-border"><td className="py-1.5 text-muted-foreground">Resistance</td><td className="text-right text-destructive">₹74.00 / ₹82.00</td></tr>
              <tr className="border-b border-border"><td className="py-1.5 text-muted-foreground">Stop Loss</td><td className="text-right text-foreground">₹54.00</td></tr>
              <tr><td className="py-1.5 text-muted-foreground">Target</td><td className="text-right text-foreground">₹82–₹90</td></tr>
            </tbody>
          </table>
        </div>

        <div className="mt-5 rounded-lg border border-accent/20 bg-accent/5 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-accent">Fundamentals</div>
          <ul className="mt-1.5 space-y-1 text-xs text-foreground">
            <li>• NIM improving QoQ · GNPA at 1.86%</li>
            <li>• Loan book growth 25% YoY</li>
            <li>• Valuation reasonable: P/B 1.6x</li>
          </ul>
        </div>

        <div className="mt-4 rounded-lg border-l-2 border-accent bg-secondary/40 p-3 text-xs italic text-muted-foreground">
          "Don't average aggressively. Add only on a confirmed close above ₹70." — Mayank S., SEBI RA
        </div>
      </div>
    </div>
  );
}
