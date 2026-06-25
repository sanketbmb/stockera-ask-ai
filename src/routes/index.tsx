import { useEffect } from "react";
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
import { FIRM } from "@/lib/firm-details";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ask The Expert by Stockera — SEBI-Registered Stock Research, On Demand" },
      { name: "description", content: "Post your stock question. Get an AI-grounded report from a SEBI-registered Research Analyst. ₹100 video answers in 24 hours. Educational research, not investment advice. Stockera Technology Private Limited · INH000019071." },
      { name: "keywords", content: "SEBI registered research analyst, stock query India, AI stock report, NSE BSE stock analysis, SEBI RA video answer, stock second opinion, Indian retail investor research, stock recommender India, buy hold sell analysis, fresh entry stock research" },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { name: "author", content: "Stockera Technology Private Limited" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Ask The Expert by Stockera — SEBI-Registered Stock Research, On Demand" },
      { property: "og:description", content: "AI-grounded reports + ₹100 SEBI-registered analyst video answers in 24 hours. Calm. Educational. On the record." },
      { property: "og:site_name", content: "Ask The Expert by Stockera" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Ask The Expert by Stockera — SEBI-Registered Stock Research" },
      { name: "twitter:description", content: "AI-grounded reports + ₹100 SEBI-registered analyst video answers in 24 hours." },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "name": FIRM.legalName,
                "alternateName": FIRM.brand,
                "url": "https://asktheexpert.lovable.app/",
                "email": FIRM.email,
                "telephone": FIRM.phone,
                "address": {
                  "@type": "PostalAddress",
                  "streetAddress": FIRM.address,
                  "addressLocality": "Mumbai",
                  "addressRegion": "Maharashtra",
                  "postalCode": "400064",
                  "addressCountry": "IN",
                },
              },
              {
                "@type": "FinancialService",
                "name": FIRM.product,
                "description": "SEBI-registered Research Analyst. AI-grounded stock research reports and personalized video answers from SEBI-registered analysts. Educational research; not investment advice.",
                "provider": {
                  "@type": "Organization",
                  "name": FIRM.legalName,
                  "identifier": {
                    "@type": "PropertyValue",
                    "propertyID": "SEBI Research Analyst Registration",
                    "value": FIRM.sebiRegNumber,
                  },
                },
                "areaServed": "IN",
                "termsOfService": "https://asktheexpert.lovable.app/terms",
                "offers": [
                  { "@type": "Offer", "name": "Personalized analyst video answer", "price": "100", "priceCurrency": "INR" },
                  { "@type": "Offer", "name": "15-minute live consultation", "price": "499", "priceCurrency": "INR" },
                  { "@type": "Offer", "name": "30-minute live consultation", "price": "999", "priceCurrency": "INR" },
                  { "@type": "Offer", "name": "60-minute live consultation", "price": "1799", "priceCurrency": "INR" },
                ],
              },
            ],
          }),
        }}
      />
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
