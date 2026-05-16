import { Mail, MessageCircle, Twitter, Instagram, Linkedin } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { FIRM } from "@/lib/firm-details";

const cols = [
  {
    title: "Platform",
    links: [
      { label: "How it Works", href: "/#how-it-works" },
      { label: "Experts", href: "/#experts" },
      { label: "Pricing", href: "/pricing" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    title: "SEBI Compliance",
    links: [
      { label: "Investor Charter", href: "/investor-charter" },
      { label: "Risk Disclosure", href: "/risk-disclosure" },
      { label: "Fee Schedule", href: "/fee-schedule" },
      { label: "Grievance Redressal", href: "/grievance-redressal" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "SEBI Overview", href: "/sebi-compliance" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo variant="white" size="md" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
              India's first AI + Expert stock query platform. Built for retail investors who want clarity, not noise.
            </p>
            <p className="mt-4 text-xs leading-relaxed text-white/60">
              <strong className="text-white/90">{FIRM.legalName}</strong><br />
              SEBI {FIRM.sebiType} — Reg. No. <span className="font-mono">{FIRM.sebiRegNumber}</span>
            </p>
            <p className="mt-3 text-xs leading-relaxed text-white/50">
              Investment in securities market is subject to market risks. Read all related documents carefully before investing. Registration granted by SEBI and certification from NISM in no way guarantee performance or assured returns.
            </p>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="font-display text-lg">{col.title}</h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-sm text-white/70 transition-colors hover:text-gold">{l.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="font-display text-lg">Contact</h4>
            <ul className="mt-4 space-y-3 text-sm text-white/70">
              <li className="flex items-start gap-2"><Mail className="h-4 w-4 mt-0.5 shrink-0" /><a href={`mailto:${FIRM.email}`} className="break-all hover:text-gold">{FIRM.email}</a></li>
              <li className="flex items-start gap-2"><MessageCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{FIRM.phone}</span></li>
            </ul>
            <div className="mt-5 flex items-center gap-3">
              {[Twitter, Instagram, Linkedin].map((Icon, i) => (
                <a key={i} href="#" className="rounded-full border border-white/20 p-2 transition-colors hover:bg-white/10" aria-label="social">
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-white/50">
          © {new Date().getFullYear()} {FIRM.legalName}. All rights reserved. • Ask The Expert is a product of Stockera.
        </div>
      </div>
    </footer>
  );
}
