import { Mail, MessageCircle, Twitter, Instagram, Linkedin } from "lucide-react";
import { Logo } from "@/components/common/Logo";

const cols = [
  {
    title: "Platform",
    links: [
      { label: "How it Works", href: "/#how-it-works" },
      { label: "Experts", href: "/#experts" },
      { label: "Pricing", href: "/#pricing" },
      { label: "FAQ", href: "/#faq" },
      { label: "Blog", href: "/#blog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/legal/privacy" },
      { label: "Terms of Service", href: "/legal/terms" },
      { label: "SEBI Compliance", href: "/legal/sebi" },
      { label: "Grievance Redressal", href: "/legal/grievance" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo variant="white" size="md" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
              India's first AI + Expert stock query platform. Built for retail investors who want clarity, not noise.
            </p>
            <p className="mt-4 text-xs leading-relaxed text-white/50">
              SEBI Disclaimer: This platform connects investors with SEBI-registered Research Analysts. All content is educational and not to be construed as investment advice.
            </p>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="font-display text-lg">{col.title}</h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.href} className="text-sm text-white/70 transition-colors hover:text-gold">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="font-display text-lg">Contact</h4>
            <ul className="mt-4 space-y-3 text-sm text-white/70">
              <li className="flex items-center gap-2"><Mail className="h-4 w-4" /> support@stockera.in</li>
              <li className="flex items-center gap-2"><MessageCircle className="h-4 w-4" /> WhatsApp: +91 90000 00000</li>
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
          © 2025 Stockera. Ask The Expert is a product of Stockera. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
