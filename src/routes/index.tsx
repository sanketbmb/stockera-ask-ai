import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MarketTicker } from "@/components/common/MarketTicker";
import { HeroSection } from "@/components/landing/HeroSection";
import { LiveStatsBar } from "@/components/landing/LiveStatsBar";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LiveDemandBlock } from "@/components/landing/LiveDemandBlock";
import { HomeAnalystCta } from "@/components/landing/HomeAnalystCta";
import { ProblemsWeSolve } from "@/components/landing/ProblemsWeSolve";
import { StockRecommenderTeaser } from "@/components/landing/StockRecommenderTeaser";
import { QueryTypesOverview } from "@/components/landing/QueryTypesOverview";
import { TrustCompliance } from "@/components/landing/TrustCompliance";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCtaStrip } from "@/components/landing/FinalCtaStrip";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ask The Expert by Stockera — AI Stock Analysis from SEBI Experts" },
      { name: "description", content: "Post your stock query and get an instant AI report + video answer from SEBI-registered Research Analysts. In Hindi or English. First 2 queries free." },
      { property: "og:title", content: "Ask The Expert by Stockera" },
      { property: "og:description", content: "AI stock reports + SEBI-verified expert video answers, in plain Hindi or English." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketTicker />
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <LiveStatsBar />
        <ProblemsWeSolve />
        <StockRecommenderTeaser />
        <QueryTypesOverview />
        <HomeAnalystCta />
        <LiveDemandBlock />
        <HowItWorks />
        <TrustCompliance />
        <FAQ />
        <FinalCtaStrip />
      </main>
      <SiteFooter />
    </div>
  );
}
