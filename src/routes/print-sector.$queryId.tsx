// SSR-loader print route for sector reports. Browserless renders this
// URL; the loader resolves the frozen payload server-side so
// #print-ready (or #print-error) is in the initial HTML.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { getPrintSectorPayload } from "@/lib/pdf.functions";
import { SectorReportBody } from "@/components/report/SectorViewReport";
import type { SectorReportPayload } from "@/lib/sector-context";
import { FIRM } from "@/lib/firm-details";

const searchSchema = z.object({ token: z.string().min(10).max(4000) });

type LoaderData =
  | { ok: true; payload: SectorReportPayload; rawQuestion: string }
  | { ok: false; message: string };

export const Route = createFileRoute("/print-sector/$queryId")({
  validateSearch: searchSchema,
  loaderDeps: ({ search: { token } }) => ({ token }),
  loader: async ({ params, deps }): Promise<LoaderData> => {
    try {
      const res = await getPrintSectorPayload({
        data: { queryId: params.queryId, token: deps.token },
      });
      return {
        ok: true,
        payload: res.payload as unknown as SectorReportPayload,
        rawQuestion: res.rawQuestion,
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message || "Failed to load print payload" };
    }
  },
  head: () => ({ meta: [{ title: "Stockera Sector View (Print)" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PrintSectorPage,
});

function PrintSectorPage() {
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

      <SectorReportBody
        payload={data.payload}
        rawQuestion={data.rawQuestion}
        routerMeta={null}
        printMode
      />
    </div>
  );
}
