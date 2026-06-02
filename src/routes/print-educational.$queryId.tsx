// Public, token-gated print route for the Educational concept brief.
// Consumed by Browserless to render the PDF — do NOT add chrome here.

import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { z } from "zod";
import { getPrintEducationalPayload } from "@/lib/pdf.functions";
import { EducationalReportBody } from "@/components/report/EducationalReport";
import type { EducationalReportPayload } from "@/lib/educational-context";
import { FIRM } from "@/lib/firm-details";

const searchSchema = z.object({ token: z.string().min(10).max(4000) });

export const Route = createFileRoute("/print-educational/$queryId")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Stockera Concept Brief (Print)" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PrintEducationalPage,
});

function PrintEducationalPage() {
  const { queryId } = useParams({ from: "/print-educational/$queryId" });
  const { token } = useSearch({ from: "/print-educational/$queryId" });
  const fetchPayload = useServerFn(getPrintEducationalPayload);

  const { data, error, isLoading } = useQuery({
    queryKey: ["print-educational", queryId, token],
    queryFn: () => fetchPayload({ data: { queryId, token } }),
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = prev; };
  }, []);

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">Preparing concept brief…</div>;
  if (error || !data) {
    return (
      <div className="p-10">
        <h1 className="font-display text-xl">Could not load print payload</h1>
        <p className="mt-2 text-sm text-muted-foreground">{(error as Error | null)?.message ?? "Unknown error"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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
        payload={data.payload as unknown as EducationalReportPayload}
        rawQuestion={data.rawQuestion}
        routerMeta={null}
        printMode
      />
    </div>
  );
}
