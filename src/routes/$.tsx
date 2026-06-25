import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/common/Logo";

export const Route = createFileRoute("/$")({
  head: () => ({
    meta: [
      { title: "Page not found — Stockera" },
      { name: "description", content: "The page you are looking for does not exist on Stockera." },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:title", content: "Page not found — Stockera" },
      { property: "og:description", content: "The page you are looking for does not exist." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Page not found — Stockera" },
      { name: "twitter:description", content: "The page you are looking for does not exist." },
    ],
  }),
  component: NotFoundCatchAll,
});

function NotFoundCatchAll() {
  return (
    <div className="flex min-h-screen flex-col bg-mesh">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-3 sm:px-6">
          <Logo size="md" />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="max-w-lg text-center">
          <svg
            viewBox="0 0 360 140"
            className="mx-auto h-32 w-full max-w-md text-destructive"
            fill="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="chart404splat" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,30 L40,40 L80,20 L120,55 L160,45 L200,90 L240,75 L280,110 L320,100 L360,135"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M0,30 L40,40 L80,20 L120,55 L160,45 L200,90 L240,75 L280,110 L320,100 L360,135 L360,140 L0,140 Z"
              fill="url(#chart404splat)"
            />
            <text
              x="180"
              y="80"
              textAnchor="middle"
              className="font-display"
              fontSize="72"
              fill="hsl(var(--primary))"
              fontFamily="DM Serif Display, serif"
            >
              404
            </text>
          </svg>
          <h1 className="mt-4 font-display text-3xl text-foreground">
            Oops! This page took a loss
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Let's get your portfolio back on track →
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white shadow-glow-teal active:scale-[0.97]"
            >
              Back to Home
            </Link>
            <Link
              to="/post-query"
              className="inline-flex items-center justify-center rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.97]"
            >
              Post a Query
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
