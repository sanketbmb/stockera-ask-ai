export interface SessionTier {
  id: "15min" | "30min" | "60min";
  label: string;
  minutes: number;
  amountPaise: number;
  blurb: string;
  highlight?: boolean;
}

export const SESSION_TIERS: SessionTier[] = [
  { id: "15min", label: "Quick Consult", minutes: 15, amountPaise: 49900, blurb: "One stock · entry/exit clarity · chart walkthrough" },
  { id: "30min", label: "Deep Dive", minutes: 30, amountPaise: 99900, blurb: "Up to 3 stocks · portfolio sanity check · risk plan", highlight: true },
  { id: "60min", label: "Portfolio Audit", minutes: 60, amountPaise: 179900, blurb: "Full portfolio review · sector allocation · 7-day WhatsApp follow-up" },
];

export function formatINR(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN");
}
