import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FIRM } from "@/lib/firm-details";

export function FinalCtaStrip() {
  return (
    <section
      className="relative overflow-hidden py-20"
      style={{ backgroundColor: "hsl(var(--brand-ink))", color: "white" }}
    >
      <div
        aria-hidden
        className="fcs-drift pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 60% at 20% 30%, hsl(var(--accent) / 0.18) 0%, transparent 70%), radial-gradient(50% 50% at 80% 70%, hsl(var(--gold) / 0.14) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="font-display text-3xl text-white sm:text-4xl">
          One question can change how you trade.
        </h2>
        <p className="mt-3 text-white/70">
          Two free reports. No card. SEBI-registered analyst on standby.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/post-query">
              Post my query — free <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10"
          >
            <Link to="/stock-picker">Or see stock picks</Link>
          </Button>
        </div>

        <p className="mx-auto mt-6 max-w-xl text-[11px] text-white/40">
          {`${FIRM.legalName} · SEBI Research Analyst ${FIRM.sebiRegNumber} · Educational analysis only.`}
        </p>
      </div>

      <style>{`
        @keyframes fcs-drift-shift {
          0%, 100% { transform: translate3d(0,0,0); }
          50%      { transform: translate3d(3%, -2%, 0); }
        }
        .fcs-drift { animation: fcs-drift-shift 18s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .fcs-drift { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
