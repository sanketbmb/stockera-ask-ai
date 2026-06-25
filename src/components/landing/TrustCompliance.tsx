import { Link } from "@tanstack/react-router";
import { Reveal } from "@/components/landing/motion-helpers";
import { FIRM } from "@/lib/firm-details";

const NOT_LIST = [
  "Not a tip channel.",
  "Not a Telegram group.",
  "Not a guaranteed-return product.",
  "Not personalized advice unless you book a 1:1 session.",
];

const INTERNAL_LINKS: Array<{ label: string; to: "/investor-charter" | "/risk-disclosure" | "/fee-schedule" | "/grievance-redressal" }> = [
  { label: "Investor Charter", to: "/investor-charter" },
  { label: "Risk Disclosure", to: "/risk-disclosure" },
  { label: "Fee Schedule", to: "/fee-schedule" },
  { label: "Grievance Redressal", to: "/grievance-redressal" },
];

export function TrustCompliance() {
  return (
    <section style={{ backgroundColor: "hsl(var(--brand-ink))", color: "white" }} className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-8 md:grid-cols-3">
          <Reveal>
            <div>
              <h3 className="font-display text-xl text-white">Registered. Disclosed. On the record.</h3>
              <p className="mt-3 text-sm text-white/70">
                {`${FIRM.legalName} is a SEBI-registered Research Analyst. Reg. No. ${FIRM.sebiRegNumber}.`}
              </p>
              <p className="mt-3 font-mono text-[11px] text-white/60">{FIRM.address}</p>
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <div>
              <h3 className="font-display text-xl text-white">What we are not.</h3>
              <ul className="mt-3 space-y-1.5 text-sm text-white/70">
                {NOT_LIST.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div>
              <h3 className="font-display text-xl text-white">Compliance & redressal.</h3>
              <ul className="mt-3 space-y-1.5 text-sm">
                {INTERNAL_LINKS.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-white/70 hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <a
                    href={FIRM.scoresUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 hover:text-white"
                  >
                    SCORES (SEBI)
                  </a>
                </li>
                <li>
                  <a
                    href={FIRM.smartOdrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 hover:text-white"
                  >
                    SmartODR
                  </a>
                </li>
              </ul>
            </div>
          </Reveal>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6">
          <p className="font-mono text-[11px] text-white/50">
            Investment in securities market is subject to market risks. Read all related documents carefully before investing. Registration granted by SEBI and certification from NISM in no way guarantee performance or assured returns.
          </p>
        </div>
      </div>
    </section>
  );
}
