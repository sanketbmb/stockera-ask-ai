// SSR-loader print route for unified stock reports (queries.ai_report).
// Browserless renders this URL; the loader resolves the frozen payload
// server-side so #print-ready (or #print-error) is in the initial HTML.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { StockAnalysisReport } from "@/components/analysis/StockAnalysisReport";
import { getPrintUnifiedStockPayload } from "@/lib/pdf.functions";
import { FIRM } from "@/lib/firm-details";
import type { StockAnalysisPayload, QueryType } from "@/types/stock-analysis";

const searchSchema = z.object({ token: z.string().min(10).max(4000) });

type LoaderData =
  | { ok: true; payload: StockAnalysisPayload; symbol: string; horizon: QueryType }
  | { ok: false; message: string };

export const Route = createFileRoute("/print-stock/$queryId")({
  validateSearch: searchSchema,
  loaderDeps: ({ search: { token } }) => ({ token }),
  loader: async ({ params, deps }): Promise<LoaderData> => {
    try {
      const res = await getPrintUnifiedStockPayload({
        data: { queryId: params.queryId, token: deps.token },
      });
      return {
        ok: true,
        payload: res.payload as unknown as StockAnalysisPayload,
        symbol: res.symbol,
        horizon: res.horizon as QueryType,
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message || "Failed to load print payload" };
    }
  },
  head: ({ params }) => ({
    meta: [
      { title: `Stockera Analysis — ${params.queryId.slice(0, 8)} (Print)` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PrintUnifiedStockPage,
});

function PrintUnifiedStockPage() {
  const data = Route.useLoaderData() as LoaderData;

  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = prev; };
  }, []);

  if (!data.ok) {
    return (
      <div className="p-10">
        <h1 className="font-display text-xl">Could not load print payload</h1>
        <p className="mt-2 text-sm text-muted-foreground">{data.message}</p>
        <div id="print-error" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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

      <StockAnalysisReport data={data.payload} printMode />

      <section className="mx-auto max-w-5xl px-4 pb-10 md:px-6">
        <div className="mt-6 rounded-lg border border-border bg-muted/30 px-5 py-4 text-[10.5px] leading-relaxed text-muted-foreground">
          <p className="font-mono text-[10px] uppercase tracking-wider text-foreground">SEBI Disclosure</p>
          <p className="mt-2">
            Prepared and distributed by{" "}
            <strong className="text-foreground">{FIRM.legalName}</strong>{" "}
            (operating as <em>{FIRM.brand}</em>), SEBI-registered {FIRM.sebiType}
            {" "}(Reg. <strong>{FIRM.sebiRegNumber}</strong>; validity {FIRM.validity}).
            This is an AI-generated educational analysis and is not personalised SEBI investment advice.
          </p>
        </div>
      </section>
    </div>
  );
}
