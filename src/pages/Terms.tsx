import LegalPage from "@/components/common/LegalPage";

const sections = [
  {
    id: "acceptable-use",
    title: "1. Acceptable use",
    body: [
      "By using Ask The Expert by Stockera (the 'Platform') you agree to use it only for lawful purposes and in a manner that does not infringe the rights of, restrict, or inhibit the use and enjoyment of the Platform by any third party.",
      "You may not use the Platform to solicit unregistered investment advice, to manipulate securities markets, or to publish content that is misleading, defamatory, or unlawful.",
    ],
  },
  {
    id: "disclaimers",
    title: "2. Disclaimers",
    body: [
      "The Platform is an intermediary marketplace. Stockera itself is not a SEBI-registered Research Analyst or Investment Adviser. All research, recommendations and personalised advice are provided by independent SEBI-registered professionals listed on the Platform.",
      "Investments in securities markets are subject to market risks. Past performance is not indicative of future results. You are solely responsible for your investment decisions.",
    ],
  },
  {
    id: "payments",
    title: "3. Payment terms",
    body: [
      "Subscriptions are billed in advance on a monthly or annual basis. Top-up wallet credits are charged at the time of purchase.",
      "All fees are inclusive of GST. Unused expert video credits are refundable within 7 days of purchase. AI reports already generated are non-refundable. Subscription cancellations stop future billing immediately but do not entitle a refund for the current billing period.",
    ],
  },
  {
    id: "termination",
    title: "4. Account termination",
    body: [
      "We may suspend or terminate your account if we reasonably believe you have breached these Terms, violated applicable law, or harmed other users or the platform.",
      "You may delete your account at any time by emailing support@stockera.in. Some records may be retained for regulatory and audit purposes as required by SEBI and applicable law.",
    ],
  },
  {
    id: "ip",
    title: "5. Intellectual property",
    body: [
      "All Platform content — including the AI report format, brand, and software — is owned by Stockera or its licensors. Expert video answers and research reports remain the intellectual property of the respective analyst, licensed to you for personal, non-redistribution use.",
      "You may not copy, reproduce, or commercially redistribute Platform content without prior written permission.",
    ],
  },
  {
    id: "governing-law",
    title: "6. Governing law",
    body: [
      "These Terms are governed by the laws of India. Any dispute arising out of or in connection with these Terms is subject to the exclusive jurisdiction of the courts at Mumbai, Maharashtra.",
    ],
  },
];

export default function Terms() {
  return (
    <LegalPage
      lastUpdated="May 16, 2026"
      intro="These Terms of Service govern your use of Ask The Expert by Stockera. Please read them carefully."
      sections={sections}
    />
  );
}
