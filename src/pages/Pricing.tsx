import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Sparkles, Crown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

type Tier = {
  name: string;
  icon: typeof Sparkles;
  monthly: number;
  blurb: string;
  features: string[];
  cta: string;
  href: string;
  featured?: boolean;
  ctaClass?: string;
};

const tiers: Tier[] = [
  {
    name: "Free",
    icon: Sparkles,
    monthly: 0,
    blurb: "Try the platform with no commitment.",
    features: [
      "2 AI Reports / month",
      "Text query only",
      "No expert video answers",
      "Community support",
    ],
    cta: "Start Free →",
    href: "/signup",
  },
  {
    name: "Pro",
    icon: Zap,
    monthly: 199,
    blurb: "For active retail investors.",
    features: [
      "10 AI Reports / month",
      "3 Expert Video Answers",
      "Priority assignment",
      "Download PDF reports",
      "WhatsApp notifications",
    ],
    cta: "Get Pro →",
    href: "/signup?plan=pro",
    featured: true,
    ctaClass: "bg-gradient-brand text-white shadow-glow-teal",
  },
  {
    name: "Expert",
    icon: Crown,
    monthly: 499,
    blurb: "For serious portfolios that need an analyst on call.",
    features: [
      "Unlimited AI Reports",
      "10 Expert Video Answers",
      "Same-day response SLA",
      "1 Live 30-min session / month",
      "Dedicated analyst",
    ],
    cta: "Go Expert →",
    href: "/signup?plan=expert",
  },
];

const faqs = [
  {
    q: "Can I switch plans anytime?",
    a: "Yes. Upgrades take effect immediately and we pro-rate the difference. Downgrades apply at the start of your next billing cycle.",
  },
  {
    q: "What if I run out of AI reports mid-month?",
    a: "You can buy top-up credits from your wallet (₹49 per 2 AI reports) without changing your plan.",
  },
  {
    q: "Do I get a refund if I'm not satisfied?",
    a: "Unused expert video credits are refundable within 7 days of purchase. AI reports already generated are non-refundable.",
  },
  {
    q: "How is annual billing discounted?",
    a: "Annual plans are billed once a year and save you 20% compared to month-to-month — equivalent to 2.4 months free.",
  },
  {
    q: "Are SEBI fees included in the price?",
    a: "Yes. Subscription pricing is inclusive of GST and SEBI-mandated charges. There are no hidden fees.",
  },
];

export default function Pricing() {
  const [annual, setAnnual] = useState(false);

  const price = (m: number) => (annual ? Math.round(m * 12 * 0.8) : m);
  const cadence = annual ? "/year" : "/month";

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Pricing
          </p>
          <h1 className="mt-2 font-display text-4xl text-foreground sm:text-5xl">
            Plans that grow with your portfolio
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
            Start free. Upgrade when you want video answers from SEBI-registered experts.
          </p>

          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-card">
            <span className={cn("text-sm", !annual && "font-semibold text-foreground", annual && "text-muted-foreground")}>
              Monthly
            </span>
            <Switch checked={annual} onCheckedChange={setAnnual} aria-label="Toggle annual billing" />
            <span className={cn("text-sm", annual && "font-semibold text-foreground", !annual && "text-muted-foreground")}>
              Annual
            </span>
            <span className="rounded-full bg-gold/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-gold-foreground">
              Save 20%
            </span>
          </div>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {tiers.map((t) => {
            const Icon = t.icon;
            const isFeatured = !!t.featured;
            return (
              <div
                key={t.name}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-card p-8 transition-all hover:-translate-y-0.5",
                  isFeatured
                    ? "border-gold/60 shadow-card-lg ring-1 ring-gold/40"
                    : "border-border shadow-card hover:shadow-card-hover",
                )}
              >
                {isFeatured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-gold px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-gold-foreground shadow-glow-gold">
                    Most Popular
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-full",
                    isFeatured ? "bg-gold/20 text-gold-foreground" : "bg-accent/10 text-accent")}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <h2 className="font-display text-2xl text-foreground">{t.name}</h2>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{t.blurb}</p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-mono text-4xl font-semibold text-foreground">
                    ₹{price(t.monthly).toLocaleString("en-IN")}
                  </span>
                  <span className="text-sm text-muted-foreground">{t.monthly === 0 ? "" : cadence}</span>
                </div>

                <ul className="mt-6 space-y-3">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  className={cn(
                    "mt-8 rounded-full active:scale-[0.97]",
                    t.ctaClass ?? "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  <Link to={t.href as never}>{t.cta}</Link>
                </Button>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          All prices in INR, inclusive of GST. SEBI-mandated charges included.
        </p>
      </section>

      <section className="border-t border-border bg-mesh">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-center font-display text-3xl text-foreground">
            Pricing & refund questions
          </h2>
          <Accordion type="single" collapsible className="mt-8">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-border">
                <AccordionTrigger className="text-left text-base font-medium text-foreground">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </>
  );
}
