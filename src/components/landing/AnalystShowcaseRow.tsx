import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Star,
  ShieldCheck,
  ExternalLink,
  Video,
  MessageSquare,
  ChevronDown,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AnalystShowcaseEntry = {
  id: string;
  name: string;
  title: string;
  avatarUrl: string | null;
  sebiType: "RA" | "RIA";
  sebiRegNumber: string;
  yearsExperience: number;
  rating: number;
  totalSessions: number;
  specializations: string[];
  languages: string[];
  bio: string;
  isAvailable: boolean;
  verifyUrl: string;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

interface Props {
  entry: AnalystShowcaseEntry;
}

export function AnalystShowcaseRow({ entry }: Props) {
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card",
        "shadow-card-hover transition-all duration-300",
        !prefersReducedMotion && "hover:-translate-y-0.5 hover:shadow-glow-teal",
      )}
    >
      {/* premium top accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-brand opacity-70" />

      <div className="flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-center md:gap-6">
        {/* Avatar */}
        <div className="relative shrink-0 self-start md:self-center">
          <Avatar className="h-16 w-16 ring-2 ring-border md:h-20 md:w-20">
            {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} alt={entry.name} /> : null}
            <AvatarFallback className="bg-gradient-brand text-base font-semibold text-white">
              {getInitials(entry.name)}
            </AvatarFallback>
          </Avatar>
          {entry.isAvailable && (
            <span
              className={cn(
                "absolute bottom-0.5 right-0.5 block h-3.5 w-3.5 rounded-full border-2 border-card bg-success",
                !prefersReducedMotion && "animate-pulse",
              )}
              aria-label="Available"
            />
          )}
        </div>

        {/* Main info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-display text-lg font-semibold text-foreground sm:text-xl">
              {entry.name}
            </h3>
            {entry.totalSessions === 0 && (
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                <Sparkles className="mr-1 h-3 w-3" /> New on platform
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{entry.title}</p>

          {/* meta row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              <ShieldCheck className="h-3.5 w-3.5" />
              SEBI {entry.sebiType} · {entry.sebiRegNumber}
            </span>
            <a
              href={entry.verifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              Verify <ExternalLink className="h-3 w-3" />
            </a>
            <span className="hidden text-xs text-muted-foreground sm:inline">·</span>
            <span className="text-xs text-muted-foreground">
              {entry.yearsExperience}+ yrs experience
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
              <Star
                className={cn(
                  "h-3.5 w-3.5 fill-gold text-gold",
                  !prefersReducedMotion && "drop-shadow-[0_0_4px_rgba(212,175,55,0.55)]",
                )}
              />
              {entry.rating.toFixed(1)}
            </span>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col md:items-end lg:flex-row">
          <Button
            asChild
            size="sm"
            className="rounded-full bg-gradient-brand text-white shadow-glow-teal"
          >
            <a href="/#analyst-cta">
              <Video className="mr-1.5 h-4 w-4" />
              Book 1:1 Session
            </a>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link to="/post-query">
              <MessageSquare className="mr-1.5 h-4 w-4" />
              Ask Query
            </Link>
          </Button>
        </div>
      </div>

      {/* Show more toggle */}
      <div className="border-t border-border/60 px-5 sm:px-6">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={`analyst-drawer-${entry.id}`}
          className="flex w-full items-center justify-between py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <span>{open ? "Show less" : "Show more"}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-300",
              open && "rotate-180",
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={`analyst-drawer-${entry.id}`}
              key="drawer"
              initial={prefersReducedMotion ? { height: "auto" } : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={prefersReducedMotion ? { height: "auto" } : { height: 0, opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-5 pb-6 pt-1">
                <div>
                  <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    About
                  </h4>
                  <p className="text-sm leading-relaxed text-foreground/90">{entry.bio}</p>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Specializations
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.specializations.map((s) => (
                      <Badge key={s} variant="secondary" className="font-normal">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Languages
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.languages.map((l) => (
                      <span
                        key={l}
                        className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-foreground"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Compliance
                  </h4>
                  <ul className="space-y-1.5 text-sm text-foreground/90">
                    {[
                      "SEBI-registered Research Analyst",
                      "Public verdicts on record",
                      "SCORES + SmartODR redressal available",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </article>
  );
}
