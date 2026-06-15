import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Navbar } from "@/components/layout/Navbar";
import { MarketTicker } from "@/components/common/MarketTicker";
import { SEBIDisclaimerBanner } from "@/components/common/SEBIDisclaimer";
import { StockPickerFlow } from "@/components/stock-picker/StockPickerFlow";

export const Route = createFileRoute("/stock-picker")({
  head: () => ({
    meta: [
      { title: "Which Stock Should I Buy? — Stockera" },
      {
        name: "description",
        content:
          "AI-picked stocks from Stockera's SP-1 verified universe. Pick horizon, risk and filters to see today's survivors.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <div className="min-h-screen bg-mesh flex flex-col">
        <MarketTicker />
        <Navbar />
        <SEBIDisclaimerBanner
          customHeading="Educational use only — AI stock picks on this page are published by Stockera Technology Private Limited (INH000019071), a SEBI-registered Research Analyst. Ask The Expert is an intermediary marketplace platform and is not itself a SEBI-registered entity."
          customBodyFirstParagraph="Ask The Expert by Stockera is an intermediary marketplace platform and is NOT itself a SEBI-registered Research Analyst or Investment Adviser. The AI-generated stock picks displayed on this screen are researched and published under the registration of Stockera Technology Private Limited (INH000019071), a SEBI-registered Research Analyst."
        />
        <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
          <header className="mb-6">
            <p className="font-mono text-xs uppercase tracking-widest text-accent">
              Stock Picker · SP-1
            </p>
            <h1 className="font-display text-3xl md:text-4xl mt-1">
              Which Stock Should I Buy?
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Tell us your horizon and risk appetite. We'll surface today's
              SP-1 verified survivors. Risk, technicals, zones and news layers
              ship in later phases.
            </p>
          </header>
          <StockPickerFlow />
        </main>
      </div>
    </RequireAuth>
  ),
});
