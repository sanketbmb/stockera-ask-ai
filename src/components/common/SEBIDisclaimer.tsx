import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const FULL_TEXT = [
  "Ask The Expert by Stockera is an intermediary marketplace and is NOT itself a SEBI-registered Research Analyst or Investment Adviser.",
  "All research, recommendations and personalised advice on the platform are provided by independent SEBI-registered Research Analysts (RA) or Investment Advisers (RIA), whose registration details are shown on their profile. Content from the AI report and from the platform itself is educational and informational — not investment advice.",
  "Investments in securities markets are subject to market risks. Past performance is not indicative of future results. Read all related offer documents carefully before investing. Registration granted by SEBI, BASL membership, and NISM certifications in no way guarantee performance of the intermediary or assure returns.",
  "You are solely responsible for your investment decisions. Always assess your risk profile, time horizon and consult a qualified adviser where appropriate.",
];

// =============================================================
// Variant 1 — Inline (one-liner amber chip)
// =============================================================
interface InlineProps {
  className?: string;
  text?: string;
}
export function SEBIDisclaimerInline({ className, text }: InlineProps) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 rounded-md bg-gold/10 px-2.5 py-1.5 text-[11px] leading-tight text-gold-foreground",
        className,
      )}
    >
      <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
      <span>{text ?? "Educational only — not SEBI investment advice."}</span>
    </p>
  );
}

// =============================================================
// Variant 2 — Banner (full-width amber, expandable)
// =============================================================
interface BannerProps {
  defaultOpen?: boolean;
  className?: string;
  customHeading?: string;
  customBodyFirstParagraph?: string;
}
export function SEBIDisclaimerBanner({
  defaultOpen = false,
  className,
  customHeading,
  customBodyFirstParagraph,
}: BannerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const paragraphs = customBodyFirstParagraph
    ? [customBodyFirstParagraph, ...FULL_TEXT.slice(1)]
    : FULL_TEXT;
  return (
    <section
      className={cn(
        "border-y border-gold/30 bg-gold/10",
        className,
      )}
      aria-label="SEBI disclaimer"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gold-foreground">
            {customHeading ?? (
              <>
                Educational use only — Ask The Expert by Stockera is not a SEBI-registered
                entity. Experts on the platform are SEBI registered.
              </>
            )}
          </p>

          {open && (
            <div className="mt-3 space-y-2 text-xs leading-relaxed text-gold-foreground/90">
              {FULL_TEXT.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-gold-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-sm"
            aria-expanded={open}
          >
            {open ? "Hide full disclaimer" : "Read full disclaimer"}
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </section>
  );
}

// =============================================================
// Variant 3 — Modal (one-time per session)
// =============================================================
const ACK_KEY = "sebi_disclaimer_ack";

export function SEBIDisclaimerModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.sessionStorage.getItem(ACK_KEY)) {
      setOpen(true);
    }
  }, []);

  function handleAck() {
    window.sessionStorage.setItem(ACK_KEY, "1");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleAck()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <ShieldCheck className="h-5 w-5 text-accent" />
            Before you read this report
          </DialogTitle>
          <DialogDescription className="text-left">
            A quick note on what this AI report is — and isn't.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          {FULL_TEXT.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <DialogFooter>
          <Button
            onClick={handleAck}
            className="w-full rounded-full bg-gradient-brand text-white shadow-glow-teal sm:w-auto"
          >
            I understand &amp; agree to proceed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Backwards-compat default export (the older one was used as a chip on cards).
export function SebiDisclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <SEBIDisclaimerInline
      className={compact ? "py-1" : "py-1.5"}
      text="Educational only — not SEBI investment advice. Past performance does not guarantee future results."
    />
  );
}

export default SEBIDisclaimerInline;
