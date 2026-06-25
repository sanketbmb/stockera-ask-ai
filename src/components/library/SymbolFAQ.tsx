import { Link } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

interface Props {
  symbol: string;
  questions: string[];
}

export function SymbolFAQ({ symbol, questions }: Props) {
  if (!questions || questions.length === 0) return null;
  const sym = symbol.toUpperCase();
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10">
      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
        Frequently asked about {sym}
      </h2>
      <Accordion type="single" collapsible className="mt-4">
        {questions.map((q, i) => (
          <AccordionItem key={i} value={`q-${i}`}>
            <AccordionTrigger className="text-left">{q}</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              Get a SEBI-registered analyst's verdict on this question in 24 hours. Post your question on Stockera.
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <div className="mt-6">
        <Button asChild>
          <Link to="/post-query" search={{ prefill_symbol: sym } as never}>
            Ask your own question about {sym} →
          </Link>
        </Button>
      </div>
    </section>
  );
}

export default SymbolFAQ;
