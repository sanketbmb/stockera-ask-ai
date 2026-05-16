import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const sections = [
  {
    title: "Getting Started",
    items: [
      {
        q: "What is Ask The Expert by Stockera?",
        a: "Ask The Expert is a platform that pairs an instant AI stock report with a video answer from a SEBI-registered Research Analyst, so retail investors get clarity in plain Hindi or English.",
      },
      {
        q: "How do I post my first query?",
        a: "Sign up for a free account, click 'Post a Query', enter the stock and your question, and choose whether you want only the AI report or also an expert video answer. Your first 2 AI reports are free.",
      },
      {
        q: "Is it really free to start?",
        a: "Yes. New users receive ₹100 wallet credit on signup which covers up to 2 AI reports. No credit card is required.",
      },
      {
        q: "Do I need to share my Demat account details?",
        a: "No, never. We do not ask for your Demat credentials, broker login, or holdings access. You only share the stock and your question.",
      },
      {
        q: "Can I use this on mobile?",
        a: "Yes. The full experience — posting queries, watching video answers, and managing your wallet — works on any modern mobile browser.",
      },
    ],
  },
  {
    title: "Experts & Answers",
    items: [
      {
        q: "Are all experts SEBI registered?",
        a: "Yes. Every analyst on the platform is a SEBI-registered Research Analyst (RA) or Investment Adviser (RIA). Their registration number is shown on their profile.",
      },
      {
        q: "How long does it take to get a video answer?",
        a: "Pro users typically get a video answer within 24 hours. Expert tier users get a same-day SLA on business days.",
      },
      {
        q: "What if I'm not satisfied with the answer?",
        a: "Open a dispute from the query page within 48 hours of receiving the answer. If our team finds the answer below standard, your credit is refunded to your wallet.",
      },
      {
        q: "Can I choose my expert?",
        a: "Pro and Expert tier users can request a specific analyst on the query form. If they are unavailable, the query is assigned to the next analyst with matching specialization.",
      },
      {
        q: "What languages are supported?",
        a: "Hindi and English. You can request the video answer in either language, and the AI report is generated in your preferred language.",
      },
    ],
  },
  {
    title: "Pricing & Wallet",
    items: [
      {
        q: "How does the wallet system work?",
        a: "Your wallet stores credits that are debited when you spend on AI reports or expert video answers. You can top up anytime via UPI, cards, or netbanking. Subscription users get monthly auto-credits.",
      },
      {
        q: "Can I get a refund?",
        a: "Unused expert video credits are refundable within 7 days of purchase. AI reports already generated are non-refundable. Subscription cancellations stop future billing immediately.",
      },
      {
        q: "What payment methods are accepted?",
        a: "UPI, all major debit and credit cards, netbanking, and select wallets. All payments are processed via PCI-DSS compliant gateways.",
      },
      {
        q: "How do referral credits work?",
        a: "Share your unique referral link. When a friend signs up and makes their first paid query, both of you receive ₹100 in wallet credit.",
      },
    ],
  },
  {
    title: "Security & SEBI Compliance",
    items: [
      {
        q: "Is this platform SEBI registered?",
        a: "Stockera connects users with SEBI-registered Research Analysts and Investment Advisers. The platform itself is not a SEBI-registered entity — it is an intermediary marketplace. All advice on the platform is delivered by SEBI-registered experts under their own registration.",
      },
      {
        q: "Are my portfolio details safe?",
        a: "We never ask for Demat credentials. Any holdings you choose to share are stored encrypted on Supabase with Row-Level Security so only you can read them.",
      },
      {
        q: "What is the difference between RA and RIA?",
        a: "A Research Analyst (RA) publishes research and recommendations on securities. A Registered Investment Adviser (RIA) provides personalised investment advice and may charge a fee for advice. Both are regulated by SEBI but operate under different rule sets.",
      },
      {
        q: "How do I report a grievance?",
        a: "Email grievance@stockera.in or use the in-app dispute flow. Unresolved complaints can be escalated to the SEBI SCORES portal at scores.gov.in within the SEBI-defined timelines.",
      },
    ],
  },
];

export default function FAQ() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      {sections.map((s) => (
        <div key={s.title} className="mb-10">
          <h2 className="font-display text-2xl text-foreground">{s.title}</h2>
          <Accordion type="single" collapsible className="mt-4">
            {s.items.map((it, i) => (
              <AccordionItem key={i} value={`${s.title}-${i}`} className="border-border">
                <AccordionTrigger className="text-left text-base font-medium text-foreground">
                  {it.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {it.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ))}
    </section>
  );
}
