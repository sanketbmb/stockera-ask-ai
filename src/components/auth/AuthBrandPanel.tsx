import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { StockTicker } from "./StockTicker";

export function AuthBrandPanel() {
  return (
    <div className="relative hidden lg:flex flex-col justify-between p-12 bg-gradient-brand text-white overflow-hidden">
      <div className="absolute inset-0 opacity-30 bg-mesh pointer-events-none" />
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-[hsl(var(--gold))] opacity-10 blur-3xl" />

      <div className="relative z-10">
        <Logo variant="white" size="lg" />
      </div>

      <div className="relative z-10 space-y-8">
        <StockTicker />
        <div>
          <h2 className="font-display text-4xl leading-tight max-w-md">
            Your stock queries, <span className="text-[hsl(var(--gold))]">answered by experts.</span>
          </h2>
          <p className="mt-4 text-white/80 max-w-md">
            AI-powered reports backed by SEBI-registered Research Analysts and Investment Advisers — built for Indian retail investors.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm">
          <ShieldCheck className="h-4 w-4 text-[hsl(var(--gold))]" />
          <span className="text-xs font-mono uppercase tracking-wider">SEBI-Compliant Platform</span>
        </div>
      </div>

      <div className="relative z-10 text-xs text-white/50 font-mono">
        © {new Date().getFullYear()} Stockera · Educational use only
      </div>
    </div>
  );
}
