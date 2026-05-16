import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface LegalSection {
  id: string;
  title: string;
  body: string[];
}

interface LegalPageProps {
  lastUpdated: string;
  intro?: string;
  sections: LegalSection[];
}

export default function LegalPage({ lastUpdated, intro, sections }: LegalPageProps) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1 text-sm">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              On this page
            </p>
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={cn(
                  "block rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active === s.id && "bg-accent/10 font-medium text-accent",
                )}
              >
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        <article className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Last updated: {lastUpdated}
          </p>
          {intro && <p className="mt-4 text-base leading-relaxed text-muted-foreground">{intro}</p>}
          <div className="mt-10 space-y-12">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="font-display text-2xl text-foreground">{s.title}</h2>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {s.body.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
