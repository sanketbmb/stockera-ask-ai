import { Link } from "@tanstack/react-router";
import { Reveal, Stagger, StaggerItem } from "@/lib/motion";
import { AnalystShowcaseRow, type AnalystShowcaseEntry } from "./AnalystShowcaseRow";
import { ShieldCheck } from "lucide-react";

export type { AnalystShowcaseEntry };

const STOCKERA_ANALYST: AnalystShowcaseEntry = {
  id: "stockera-research-desk",
  name: "Stockera Research Desk",
  title: "SEBI-Registered Research Analyst",
  avatarUrl: null,
  sebiType: "RA",
  sebiRegNumber: "INH000019071",
  yearsExperience: 5,
  rating: 4.8,
  totalSessions: 0,
  specializations: [
    "Technical Analysis",
    "Fundamental Analysis",
    "F&O Strategy",
    "Sector Outlook",
  ],
  languages: ["English", "Hindi"],
  bio: "The in-house research desk of Stockera Technology Private Limited. Every report follows the same structure — verdict, key levels, reasoning, and risks — grounded in real NSE/BSE data. We answer investor queries calmly, transparently, and on the record under SEBI disclosure.",
  isAvailable: true,
  verifyUrl: "https://www.sebi.gov.in/intermediary",
};

const ANALYSTS: AnalystShowcaseEntry[] = [STOCKERA_ANALYST];

export function AnalystShowcase() {
  return (
    <section id="experts" aria-labelledby="experts-heading" className="py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verified · SEBI Research Analyst
            </span>
            <h2
              id="experts-heading"
              className="mt-4 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              Meet the analysts behind every verdict.
            </h2>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              Every report on Stockera is reviewed or recorded by a SEBI-registered Research
              Analyst. Real names. Real registrations. Verifiable on the SEBI portal.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 space-y-5">
          {ANALYSTS.map((entry, idx) => (
            <Reveal key={entry.id} delay={0.1 + idx * 0.08}>
              <div className="transition-colors duration-200 [&>article]:hover:border-primary/40">
                <AnalystShowcaseRow entry={entry} />
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.25}>
          <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/30 px-5 py-4 text-center text-sm text-muted-foreground">
            More SEBI-registered analysts are joining the platform.{" "}
            <Link to="/post-query" className="font-medium text-accent hover:underline">
              Post your query
            </Link>{" "}
            and we will route it to the right desk.
          </div>
        </Reveal>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          SEBI registration does not guarantee performance. Educational research only — not
          investment advice.
        </p>
      </div>
    </section>
  );
}
