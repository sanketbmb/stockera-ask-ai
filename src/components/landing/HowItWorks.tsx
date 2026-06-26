import { Link } from "@tanstack/react-router";
import { MessageSquare, Zap, Video, ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/lib/motion";

const steps = [
  {
    n: 1,
    icon: MessageSquare,
    color: "text-accent",
    bg: "bg-accent/10",
    barFrom: "from-accent/0",
    barTo: "to-accent",
    title: "Post Your Query",
    body: "Tell us your stock, your buy price, and what you're confused about. Takes 60 seconds.",
  },
  {
    n: 2,
    icon: Zap,
    color: "text-gold",
    bg: "bg-gold/10",
    barFrom: "from-gold/0",
    barTo: "to-gold",
    title: "Get AI Report Instantly",
    body: "Our Gemini-powered AI analyzes your stock using real NSE/BSE data and gives you a detailed verdict in 30 seconds.",
  },
  {
    n: 3,
    icon: Video,
    color: "text-primary",
    bg: "bg-primary/10",
    barFrom: "from-primary/0",
    barTo: "to-primary",
    title: "Expert Video Answer",
    body: "A SEBI-registered RA or RIA records a personalized video answer — in Hindi or English — within 24 hours.",
  },
];

function StepBar({ delay }: { delay: number }) {
  const reduce = useReducedMotion();
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mt-5 h-[3px] w-full overflow-hidden rounded-full bg-border/60"
    >
      <motion.div
        className="h-full w-full origin-left rounded-full bg-gradient-to-r from-primary via-accent to-gold"
        initial={{ scaleX: reduce ? 1 : 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl text-foreground sm:text-4xl">
            How Ask The Expert Works <span className="text-gold">in 3 Simple Steps</span>
          </h2>
          <p className="mt-3 text-muted-foreground">From confusion to clarity — in minutes, not days.</p>
        </Reveal>

        <div className="relative mt-14 grid gap-8 md:grid-cols-3 md:gap-6">
          <div className="absolute left-0 right-0 top-12 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
          {steps.map((s, i) => {
            const card = (
              <div className="relative flex flex-col items-center text-center md:items-start md:text-left">
                <div className={`relative z-10 flex h-24 w-24 items-center justify-center rounded-2xl ${s.bg} shadow-card`}>
                  <s.icon className={`h-9 w-9 ${s.color}`} />
                  <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-foreground font-mono text-xs font-bold text-background">
                    {s.n}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-xl text-foreground">{s.title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                <StepBar delay={i * 0.12} />
              </div>
            );
            return (
              <Reveal key={s.n} delay={i * 0.1}>
                {s.n === 1 ? (
                  <Link
                    to="/post-query"
                    className="block group cursor-pointer transition-transform duration-300 ease-out hover:-translate-y-1"
                    aria-label="Post your query"
                  >
                    {card}
                  </Link>
                ) : (
                  card
                )}
              </Reveal>
            );
          })}
        </div>

        <Reveal className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            And if you're still unsure —{" "}
            <a href="/#analyst-cta" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
              book a 1:1 live session with a SEBI-registered analyst <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
