// SEBI compliance — firm registration & contact details
// Single source of truth for legal pages.

export const FIRM = {
  legalName: "Stockera Technology Private Limited",
  brand: "Stockera",
  product: "Ask The Expert by Stockera",
  sebiType: "Research Analyst",
  sebiRegNumber: "INH000019071",
  bseEnlistment: "N/A",
  // SEBI/legal disclosure pages may render this. Do NOT render on monetization
  // surfaces (Wallet, PaywallPopup, Topup) — those must use MONETIZATION_DISCLAIMER.
  validity: "Valid until suspended or cancelled per SEBI (Research Analysts) Regulations, 2014",
  validityInternalNote: "Perpetual (subject to annual fee compliance)",
  email: "Contact@stockera.com",
  phone: "+91 90220 44633",
  address:
    "310, Gemstar Commercial Complex, Ramchandra Lane Ext, Kachpada, Malad West, Mumbai Suburban, Maharashtra — 400064",
  principalOfficer: {
    name: "Principal Officer, Stockera",
    email: "Contact@stockera.com",
    phone: "+91 90220 44633",
  },
  complianceOfficer: {
    name: "Compliance Officer, Stockera",
    email: "Contact@stockera.com",
    phone: "+91 90220 44633",
  },
  grievanceOfficer: {
    name: "Grievance Officer, Stockera",
    email: "Contact@stockera.com",
    phone: "+91 90220 44633",
  },
  scoresUrl: "https://scores.sebi.gov.in",
  smartOdrUrl: "https://smartodr.in",
  sebiOfficeAddress:
    "SEBI Bhavan, Plot No. C4-A, 'G' Block, Bandra Kurla Complex, Bandra (East), Mumbai — 400051",
} as const;

export const GRIEVANCE_CATEGORIES = [
  "Service quality",
  "Billing / wallet / refund",
  "AI report accuracy",
  "Expert / analyst answer",
  "Account access",
  "Data privacy",
  "Misleading communication",
  "Other",
] as const;

// Single source of truth for monetization / wallet / paywall surfaces.
export const MONETIZATION_DISCLAIMER =
  "Stockera Technology Private Limited is a SEBI-registered Research Analyst (Registration No. INH000019071). Research reports and AI-generated analyses are for informational purposes only and do not constitute personalized investment advice. Investments in securities are subject to market risks; please read all related documents carefully before investing. Past performance is not indicative of future returns. Investors may verify our registration status at www.sebi.gov.in.";

