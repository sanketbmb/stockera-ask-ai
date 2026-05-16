import LegalPage from "@/components/common/LegalPage";

const sections = [
  {
    id: "data-collected",
    title: "1. Data we collect",
    body: [
      "Account data: name, email, phone, profile photo, and authentication identifiers (including Google OAuth when used).",
      "Usage data: queries you post, AI reports generated for you, expert answers delivered to you, ratings and disputes, wallet transactions, and basic device/browser metadata for security.",
      "We never ask for Demat credentials, broker logins, or holdings access. Any portfolio context you share in a query is provided voluntarily.",
    ],
  },
  {
    id: "storage",
    title: "2. Where your data is stored",
    body: [
      "Data is stored in Supabase (Postgres + Storage) hosted on AWS infrastructure in the Asia-Pacific region. All tables enforce Row-Level Security so that only you can read your personal records.",
      "Backups are encrypted at rest. Network traffic between your device and our servers is encrypted in transit via TLS 1.2+.",
    ],
  },
  {
    id: "no-selling",
    title: "3. No third-party selling",
    body: [
      "We do not sell, rent, or trade your personal data to third parties. We do not share your queries, holdings, or video answers with advertisers.",
      "We use a small number of operational sub-processors (payment gateway, email/WhatsApp delivery, analytics) strictly to run the service. The current list is available on request.",
    ],
  },
  {
    id: "rights",
    title: "4. Your rights",
    body: [
      "You can access, correct, export, or delete your personal data at any time from Settings or by emailing support@stockera.in.",
      "Some records may be retained for regulatory, tax, or audit purposes as required by SEBI and applicable Indian law.",
    ],
  },
  {
    id: "cookies",
    title: "5. Cookies & analytics",
    body: [
      "We use essential cookies for authentication and session management. We use first-party analytics (page views, feature usage) to improve the product. We do not use third-party advertising cookies.",
    ],
  },
  {
    id: "contact",
    title: "6. Contact",
    body: [
      "For privacy or data protection enquiries, email privacy@stockera.in. For grievances, email grievance@stockera.in.",
    ],
  },
];

export default function Privacy() {
  return (
    <LegalPage
      lastUpdated="May 16, 2026"
      intro="This Privacy Policy explains what we collect, how we use it, and the choices you have. It applies to all users of Ask The Expert by Stockera."
      sections={sections}
    />
  );
}
