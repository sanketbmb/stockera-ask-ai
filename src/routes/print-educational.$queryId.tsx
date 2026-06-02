// SSR-loader print route for the Educational concept brief. Browserless
// renders this URL; the loader resolves the frozen payload server-side
// so #print-ready (or #print-error) is in the initial HTML.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { getPrintEducationalPayload } from "@/lib/pdf.functions";
import { EducationalReportBody } from "@/components/report/EducationalReport";
import type { EducationalReportPayload } from "@/lib/educational-context";
import { FIRM } from "@/lib/firm-details";

const searchSchema = z.object({ token: z.string().min(1).max(4000).optional().default("") });

type LoaderData =
  | { ok: true; payload: EducationalReportPayload; rawQuestion: string }
  | { ok: false; message: string };

export const Route = createFileRoute("/print-educational/$queryId")({
  validateSearch: searchSchema,
  loaderDeps: ({ search: { token } }) => ({ token }),
  loader: async ({ params, deps }): Promise<LoaderData> => {
    if (!deps.token) return { ok: false, message: "Missing print token" };
    try {
      const res = await getPrintEducationalPayload({
        data: { queryId: params.queryId, token: deps.token },
      });
      return {
        ok: true,
        payload: res.payload as unknown as EducationalReportPayload,
        rawQuestion: res.rawQuestion,
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message || "Failed to load print payload" };
    }
  },
  head: () => ({ meta: [{ title: "Stockera Concept Brief (Print)" }, { name: "robots", content: "noindex, nofollow" }] }),
  errorComponent: ({ error }) => (
    <div className="p-10">
      <h1 className="font-display text-xl">Print route error</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <div id="print-error" />
    </div>
  ),
  component: PrintEducationalPage,
});

function PrintEducationalPage() {
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
      {/* Marker-first: emit #print-ready immediately in the SSR HTML so
          Browserless can capture as soon as the first paint settles. */}
      <div id="print-ready" data-print-ready="ssr" style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
      <header className="mx-auto max-w-4xl px-4 pt-8 md:px-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-2xl text-foreground">Stockera</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {FIRM.product} · Learning Library
            </p>
          </div>
          <div className="text-right text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <p>SEBI {FIRM.sebiType}</p>
            <p>Reg. {FIRM.sebiRegNumber}</p>
          </div>
        </div>
        <hr className="mt-4 border-border" />
      </header>

      <EducationalReportBody
        payload={data.payload}
        rawQuestion={data.rawQuestion}
        routerMeta={null}
        printMode
      />
    </div>
  );
}
