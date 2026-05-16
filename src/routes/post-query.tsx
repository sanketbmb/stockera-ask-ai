import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Logo } from "@/components/common/Logo";

function makePlaceholder(title: string, blurb: string) {
  return function Placeholder() {
    return (
      <div className="min-h-screen bg-mesh flex flex-col">
        <header className="border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-6 py-3 flex justify-between items-center">
            <Logo size="sm" />
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-primary">← Dashboard</Link>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center bg-card border border-border rounded-2xl p-10 shadow-card">
            <p className="font-mono text-xs uppercase tracking-widest text-accent">Coming soon</p>
            <h1 className="font-display text-3xl mt-2 text-foreground">{title}</h1>
            <p className="text-muted-foreground mt-3">{blurb}</p>
          </div>
        </main>
      </div>
    );
  };
}

export { makePlaceholder };

export const Route = createFileRoute("/post-query")({
  head: () => ({ meta: [{ title: "Ask a Question — Stockera" }] }),
  component: () => {
    const View = makePlaceholder("Post a Query", "Submit your stock question — AI report instantly, expert video within 24h.");
    return <RequireAuth><View /></RequireAuth>;
  },
});
