// Public, token-gated print route consumed by Browserless to render the
// motion-free PDF version of the Stock Analysis Report. Do NOT add nav,
// footer, or any chrome here — the page must be visually identical to a
// printed copy of the report.

import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { StockAnalysisReport } from "@/components/analysis/StockAnalysisReport";
import { getPrintAnalysisPayload } from "@/lib/pdf.functions";
import { FIRM } from "@/lib/firm-details";
import type { StockAnalysisPayload, QueryType } from "@/types/stock-analysis";

const searchSchema = z.object({
  horizon: z.enum(["intraday", "medium-term", "long-term"]),
  news: z.coerce.number().min(0).max(1),
  token: z.string().min(10).max(4000),
});

export const Route = createFileRoute("/print/$symbol")({
  validateSearch: searchSchema,
  head: ({ params }) => ({
    meta: [
      { title: `Stockera Analysis — ${params.symbol} (Print)` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PrintPage,
});

function PrintPage() {
  const { symbol } = useParams({ from: "/print/$symbol" });
  const { horizon, news, token } = useSearch({ from: "/print/$symbol" });
  const includeNews = news === 1;

  const { data, error, isLoading } = useQuery<StockAnalysisPayload>({
    queryKey: ["print-analysis", symbol, horizon, includeNews, token],
    queryFn: () =>
      getPrintAnalysisPayload({ data: { symbol, horizon: horizon as QueryType, include_news: includeNews, token } }),
    retry: false,
    staleTime: Infinity,
  });

  // Hide scrollbars during PDF capture; restore on unmount.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = prev; };
  }, []);

  if (isLoading) {
    return <div className="p-10 text-sm text-muted-foreground">Preparing report…</div>;
  }
  if (error || !data) {
    return (
      <div className="p-10">
        <h1 className="font-display text-xl">Could not load print payload</h1>
        <p className="mt-2 text-sm text-muted-foreground">{(error as Error | null)?.message ?? "Unknown error"}</p>
        <div id="print-error" className="hidden" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Branded print header */}
      <header className="mx-auto max-w-5xl px-4 pt-8 md:px-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-2xl text-foreground">Stockera</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {FIRM.product}
            </p>
          </div>
          <div className="text-right text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <p>SEBI {FIRM.sebiType}</p>
            <p>Reg. {FIRM.sebiRegNumber}</p>
          </div>
        </div>
        <hr className="mt-4 border-border" />
      </header>

      <StockAnalysisReport data={data} printMode />

      {/* SEBI compliance footer — NAMED variant, pulls from firm-details */}
      <section className="mx-auto max-w-5xl px-4 pb-10 md:px-6">
        <div className="mt-6 rounded-lg border border-border bg-muted/30 px-5 py-4 text-[10.5px] leading-relaxed text-muted-foreground">
          <p className="font-mono text-[10px] uppercase tracking-wider text-foreground">SEBI Disclosure</p>
          <p className="mt-2">
            This report is prepared and distributed by{" "}
            <strong className="text-foreground">{FIRM.legalName}</strong>{" "}
            (operating as <em>{FIRM.brand}</em>), a SEBI-registered{" "}
            {FIRM.sebiType} (Reg. No. <strong>{FIRM.sebiRegNumber}</strong>;
            validity {FIRM.validity}). Registered office: {FIRM.address}.
            Compliance contact: {FIRM.complianceOfficer.email} ·{" "}
            {FIRM.complianceOfficer.phone}. Grievances:{" "}
            <a href={FIRM.scoresUrl} className="underline">SCORES</a> ·{" "}
            <a href={FIRM.smartOdrUrl} className="underline">SMART ODR</a>.
          </p>
          <p className="mt-2">
            This is an AI-generated educational analysis and is not personalised
            SEBI investment advice. Securities investments are subject to market
            risks; past performance does not indicate future results. Registration
            granted by SEBI, BASL membership, and NISM certification do not
            guarantee performance or assure returns. Read all related documents
            carefully. You are solely responsible for your investment decisions.
          </p>
        </div>
      </section>
    </div>
  );
}
