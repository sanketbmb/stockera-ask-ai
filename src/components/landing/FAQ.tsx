import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal } from "@/lib/motion";

const ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "Is this SEBI-registered?",
    a: "Yes. Stockera Technology Private Limited is a SEBI-registered Research Analyst (INH000019071). All analyses are educational research, not personalized investment advice.",
  },
  {
    q: "What does ₹100 actually buy me?",
    a: "A personalized video answer to one stock question, recorded by a SEBI-registered Research Analyst, delivered within 24 hours. One-time. No subscription.",
  },
  {
    q: "How is this different from a Telegram tip channel?",
    a: "We don't push trades. We respond to your specific question with a structured report — technical, fundamental, key zones, verdict, and the reasoning behind it. You decide what to do.",
  },
  {
    q: "What if I want to actually speak to an analyst?",
    a: "Book a 1:1 live consultation: 15 min (₹499), 30 min (₹999), or 60 min (₹1,799). All sessions are with SEBI-registered Research Analysts.",
  },
  {
    q: "Do you guarantee returns?",
    a: "No. Nobody can. Registration granted by SEBI and certification from NISM in no way guarantee performance or assured returns. We give you the reasoning; markets do the rest.",
  },
  {
    q: "What stocks can I ask about?",
    a: "Any NSE- or BSE-listed equity. The AI report uses live market data; the analyst video addresses your specific situation.",
  },
  {
    q: "How do I get started?",
    a: "Post your query — first two reports are free. No card needed.",
  },
];

export function FAQ() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal>
          <h2 className="text-center font-display text-3xl text-foreground sm:text-4xl">
            Calm answers to the questions everyone asks.
          </h2>
        </Reveal>

        <Reveal delay={0.08}>
          <Accordion type="single" collapsible className="mt-10">
            {ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="rounded-md px-2 text-left font-display text-base text-foreground transition-colors duration-200 hover:bg-muted/40 focus-visible:bg-muted/40">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
