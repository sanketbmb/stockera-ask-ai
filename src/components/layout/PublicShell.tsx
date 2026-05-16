import type { ReactNode } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";

interface PublicShellProps {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}

export function PublicShell({ children, eyebrow, title, subtitle }: PublicShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        {(title || eyebrow) && (
          <section className="border-b border-border bg-mesh">
            <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
              {eyebrow && (
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
                  {eyebrow}
                </p>
              )}
              {title && (
                <h1 className="mt-2 font-display text-4xl text-foreground sm:text-5xl">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="mt-4 max-w-2xl text-base text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
          </section>
        )}
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export default PublicShell;
