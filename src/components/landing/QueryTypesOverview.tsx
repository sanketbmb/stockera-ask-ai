import { Link } from "@tanstack/react-router";
import {
  MessageCircle,
  TrendingDown,
  Layers,
  Building2,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Reveal, Stagger, StaggerItem, HoverLift } from "@/lib/motion";
import { visibleIntents } from "@/lib/feature-flags";

type Slot = {
  intent: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
  href: "/post-query";
};

const SLOTS: Slot[] = [
  { intent: "buy_decision",   label: "Buy decision",     blurb: "Should I buy this now or wait?", icon: MessageCircle, href: "/post-query" },
  { intent: "stuck_position", label: "Stuck position",   blurb: "Down on a stock. What now?",     icon: TrendingDown,  href: "/post-query" },
  { intent: "should_average", label: "Should I average", blurb: "Average down or hold?",          icon: Layers,        href: "/post-query" },
  { intent: "sector_view",    label: "Sector view",      blurb: "Read on a whole sector.",        icon: Building2,     href: "/post-query" },
  { intent: "educational",    label: "Educational",      blurb: "Learn a concept, simply.",       icon: BookOpen,      href: "/post-query" },
];

const FALLBACK = new Set(["buy_decision", "stuck_position", "should_average"]);

export function QueryTypesOverview() {
  let visible: Set<string>;
  try {
    const v = visibleIntents();
    if (!v) throw new Error("no visibleIntents");
    visible = new Set<string>(v as readonly string[]);
  } catch {
    visible = FALLBACK;
  }

  const cards = SLOTS.filter((s) => s.intent !== "other" && visible.has(s.intent));

  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl text-foreground sm:text-4xl">
            <span className="text-foreground">Five ways to</span>{" "}
            <span
              className="text-gradient animate-gradient-text"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #2BA8A0, #1F3C73, #F5B731, #2BA8A0)",
              }}
            >
              ask
            </span>
            <span className="text-foreground">.</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Every report follows the same structure — verdict, key levels, reasoning, risks.
          </p>
        </Reveal>

        <Stagger
          staggerChildren={0.1}
          delayChildren={0.05}
          className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5"
        >
          {cards.map((s) => {
            const Icon = s.icon;
            return (
              <StaggerItem key={s.intent}>
                <HoverLift liftPx={3}>
                  <Link to={s.href} className="group block h-full">
                    <Card className="flex h-full flex-col gap-2 p-4 transition-all duration-200 hover:border-primary/40 hover:-translate-y-1 hover:shadow-card-hover">
                      <Icon
                        className="h-5 w-5 text-accent transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3 motion-reduce:scale-100 motion-reduce:rotate-0"
                        aria-hidden
                      />
                      <h3 className="font-display text-base text-foreground">{s.label}</h3>
                      <p className="text-xs leading-relaxed text-muted-foreground">{s.blurb}</p>
                    </Card>
                  </Link>
                </HoverLift>
              </StaggerItem>
            );
          })}
        </Stagger>

      </div>
    </section>
  );
}
