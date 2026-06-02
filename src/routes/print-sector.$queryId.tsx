// Public, token-gated print route for the Sector View report. Consumed by
// Browserless to render the PDF — do NOT add Navbar, footer, or any chrome
// outside the SectorReportBody.

import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { z } from "zod";
import { getPrintSectorPayload } from "@/lib/pdf.functions";
import { SectorReportBody } from "@/components/report/SectorViewReport";
import type { SectorReportPayload } from "@/lib/sector-context";
import { FIRM } from "@/lib/firm-details";

const searchSchema = z.object({ token: z.string().min(10).max(4000) });

export const Route = createFileRoute("/print-sector/$queryId")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Stockera Sector View (Print)" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PrintSectorPage,
});

function PrintSectorPage() {
  const { queryId } = useParams({ from: "/print-sector/$queryId" });
  const { token } = useSearch({ from: "/print-sector/$queryId" });
  const fetchPayload = useServerFn(getPrintSectorPayload);

  const { data, error, isLoading } = useQuery({
    queryKey: ["print-sector", queryId, token],
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

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">Preparing report…</div>;
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
        payload={data.payload as unknown as SectorReportPayload}
        rawQuestion={data.rawQuestion}
        routerMeta={null}
        printMode
      />
    </div>
  );
}
