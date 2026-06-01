import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateArchitecturePdf } from "@/lib/pdf.functions";
import { DOC_VERSION, FORMULA_VERSION, MODEL_VERSION } from "@/lib/doc-version";
import { AdminShell } from "@/components/admin/AdminShell";

export default function AdminExports() {
  const generate = useServerFn(generateArchitecturePdf);
  const [state, setState] = useState<{ status: "idle" | "working" | "done" | "error"; url?: string; filename?: string; cache_hit?: boolean; error?: string }>({ status: "idle" });

  async function onDownload() {
    setState({ status: "working" });
    try {
      const res = await generate({ data: {} as never });
      setState({ status: "done", url: res.url, filename: res.filename, cache_hit: res.cache_hit });
    } catch (err) {
      setState({ status: "error", error: (err as Error).message });
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Admin · Exports
        </p>
        <h1 className="mt-2 font-display text-3xl text-foreground">Architecture Encyclopedia</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Regenerate the investor-grade Stockera Architecture &amp; Brain PDF. Internal only.
        </p>

        <div className="mt-8 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-lg text-foreground">Stockera Architecture &amp; Brain — Volume I</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Doc v{DOC_VERSION} · Formula {FORMULA_VERSION}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">{MODEL_VERSION}</p>
            </div>
            <button
              onClick={onDownload}
              disabled={state.status === "working"}
              className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {state.status === "working" ? "Generating…" : "Generate PDF"}
            </button>
          </div>

          {state.status === "done" && state.url && (
            <div className="mt-5 rounded-md border border-border bg-muted/30 p-4 text-sm">
              <p className="text-foreground">
                Ready{state.cache_hit ? " (served from cache)" : ""}.
              </p>
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

        <p className="mt-6 text-xs text-muted-foreground">
          Cached per (doc-version, day). Re-running on the same day returns the
          cached object instantly. Bump <code className="font-mono">DOC_VERSION</code> in{" "}
          <code className="font-mono">src/lib/doc-version.ts</code> when content changes.
        </p>
      </div>
    </AdminShell>
  );
}
