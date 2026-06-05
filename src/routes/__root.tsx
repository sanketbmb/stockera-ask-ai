import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import { Logo } from "@/components/common/Logo";
import { CustomCursor } from "@/components/common/CustomCursor";

function NotFoundComponent() {
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
              <linearGradient id="chart404" x1="0" x2="0" y1="0" y2="1">
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
              fill="url(#chart404)"
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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ask The Expert by Stockera" },
      { name: "description", content: "AI-powered stock analysis and video answers from SEBI-registered experts." },
      { property: "og:title", content: "Ask The Expert by Stockera" },
      { property: "og:description", content: "AI-powered stock analysis and video answers from SEBI-registered experts." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/eryFVTpnbyUAD07bQk2YgBPPUs13/social-images/social-1780395980513-Stock_queries_AI_answered.webp" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/eryFVTpnbyUAD07bQk2YgBPPUs13/social-images/social-1780395980513-Stock_queries_AI_answered.webp" },
      { name: "twitter:title", content: "Ask The Expert by Stockera" },
      { name: "twitter:description", content: "AI-powered stock analysis and video answers from SEBI-registered experts." },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/stockera-logo.png" },
      { rel: "apple-touch-icon", href: "/stockera-logo.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CustomCursor />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
