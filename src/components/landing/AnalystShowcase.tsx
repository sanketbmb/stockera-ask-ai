import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useInView, useReducedMotion } from "framer-motion";
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success animate-pulse-sebi motion-reduce:animate-none">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verified · SEBI Research Analyst
            </span>
            <h2
              id="experts-heading"
              className="mt-4 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              Meet the{" "}
              <span
                className="text-gradient animate-gradient-text"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #2BA8A0, #1F3C73, #F5B731, #2BA8A0)",
                }}
              >
                analysts
              </span>{" "}
              behind every verdict.
            </h2>
            <p className="text-base text-muted-foreground mt-2">
              SEBI-registered analysts. Independent research. No tips.
            </p>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              Every report on Ask the Expert is reviewed or recorded by a SEBI-registered Research
              Analyst. Real names. Real registrations. Verifiable on the SEBI portal.
            </p>
          </div>
        </Reveal>

        <Stagger staggerChildren={0.08} className="mt-10 space-y-5">
          {ANALYSTS.map((entry) => (
            <StaggerItem key={entry.id}>
              <div className="group transition-all duration-200 hover:scale-[1.02] [&>article]:hover:border-primary/40 [&>article]:hover:shadow-card-hover">
                <AnalystShowcaseRow entry={entry} />
              </div>
            </StaggerItem>
          ))}
        </Stagger>


        <Reveal delay={0.25}>
          <div
            className="relative mt-6 overflow-hidden rounded-2xl p-[1.5px] animate-glow-aurora motion-reduce:animate-none"
            style={{
              backgroundImage:
                "linear-gradient(135deg, #F5B731 0%, #FFA94D 35%, #2BA8A0 70%, #1F3C73 100%)",
            }}
          >
            <div
              className="relative overflow-hidden rounded-[14px] px-5 py-6 text-center text-sm animate-shimmer-warm motion-reduce:animate-none"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, #FFF7E0 0%, #FDE68A 25%, #FEF3C7 50%, #E0F7F5 75%, #FFF7E0 100%)",
              }}
            >
              {/* Floating orbs for depth */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-10 -left-8 h-32 w-32 rounded-full blur-3xl opacity-60 animate-orb-drift motion-reduce:animate-none"
                style={{ background: "radial-gradient(circle, rgba(245,183,49,0.55), transparent 70%)" }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-12 -right-10 h-36 w-36 rounded-full blur-3xl opacity-55 animate-orb-drift-rev motion-reduce:animate-none"
                style={{ background: "radial-gradient(circle, rgba(43,168,160,0.55), transparent 70%)" }}
              />

              <p className="relative z-10 text-foreground/80">
                More SEBI-registered analysts are joining the platform.{" "}
                <Link to="/post-query" className="font-semibold text-accent underline-offset-4 hover:underline">
                  Post your query
                </Link>{" "}
                and we will route it to the right desk.
              </p>

              <div className="relative z-10 mt-4 flex justify-center">
                <Link
                  to="/admin/apply"
                  className="relative overflow-hidden group inline-flex items-center gap-2 rounded-md px-6 py-3 text-white font-semibold transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_12px_36px_rgba(245,183,49,0.55)] animate-pulse-glow motion-reduce:animate-none"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, #F5B731 0%, #FFA94D 50%, #2BA8A0 100%)",
                  }}
                >
                  <span className="relative z-10">Register as a SEBI Analyst →</span>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden"
                  />
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
