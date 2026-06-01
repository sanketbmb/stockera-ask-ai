import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateArchitecturePdf, generateAccuracyRoadmapPdf } from "@/lib/pdf.functions";
import {
  DOC_VERSION,
  FORMULA_VERSION,
  MODEL_VERSION,
  ACCURACY_ROADMAP_VERSION,
} from "@/lib/doc-version";
import { AdminShell } from "@/components/admin/AdminShell";

type ExportState = {
  status: "idle" | "working" | "done" | "error";
  url?: string;
  filename?: string;
  cache_hit?: boolean;
  error?: string;
};

function ExportCard({
  title,
  subtitle,
  meta,
  onGenerate,
}: {
  title: string;
  subtitle: string;
  meta: string[];
  onGenerate: () => Promise<{ url: string; filename: string; cache_hit: boolean }>;
}) {
  const [state, setState] = useState<ExportState>({ status: "idle" });

  async function handle() {
    setState({ status: "working" });
    try {
      const res = await onGenerate();
      setState({ status: "done", url: res.url, filename: res.filename, cache_hit: res.cache_hit });
    } catch (err) {
      setState({ status: "error", error: (err as Error).message });
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-display text-lg text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-2 space-y-0.5">
            {meta.map((m) => (
              <p key={m} className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {m}
              </p>
            ))}
          </div>
        </div>
        <button
          onClick={handle}
          disabled={state.status === "working"}
          className="shrink-0 rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {state.status === "working" ? "Generating…" : "Generate PDF"}
        </button>
      </div>

      {state.status === "done" && state.url && (
        <div className="mt-5 rounded-md border border-border bg-muted/30 p-4 text-sm">
          <p className="text-foreground">Ready{state.cache_hit ? " (served from cache)" : ""}.</p>
          <a
            href={state.url}
            download={state.filename}
            className="mt-2 inline-block font-mono text-[12px] underline"
            target="_blank"
            rel="noreferrer"
          >
            Download {state.filename}
          </a>
        </div>
      )}

      {state.status === "error" && (
        <p className="mt-5 text-sm text-red-600">Error: {state.error}</p>
      )}
    </div>
  );
}

export default function AdminExports() {
  const generateArch = useServerFn(generateArchitecturePdf);
  const generateAcc = useServerFn(generateAccuracyRoadmapPdf);

  return (
    <AdminShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Admin · Exports
        </p>
        <h1 className="mt-2 font-display text-3xl text-foreground">Curated PDFs</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Regenerate the investor-grade Stockera documents. Internal only.
        </p>

        <ExportCard
          title="Volume I · Architecture & Brain"
          subtitle="End-to-end Stockera AI Brain encyclopedia — modules, formulas, audit surface."
          meta={[
            `Doc v${DOC_VERSION} · Formula ${FORMULA_VERSION}`,
            MODEL_VERSION,
          ]}
          onGenerate={async () => generateArch({ data: {} as never })}
        />

        <ExportCard
          title="Volume II · Accuracy Roadmap"
          subtitle="Honest accuracy posture, ladder, backtest harness blueprint, retail language patterns, SEBI posture."
          meta={[
            `Doc v${ACCURACY_ROADMAP_VERSION} · Formula ${FORMULA_VERSION}`,
            MODEL_VERSION,
          ]}
          onGenerate={async () => generateAcc({ data: {} as never })}
        />

        <p className="mt-6 text-xs text-muted-foreground">
          Cached per (doc-version, day). Re-running on the same day returns the
          cached object instantly. Bump version constants in{" "}
          <code className="font-mono">src/lib/doc-version.ts</code> when content changes.
        </p>
      </div>
    </AdminShell>
  );
}
