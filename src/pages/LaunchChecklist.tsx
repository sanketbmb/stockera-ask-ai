import { Logo } from "@/components/common/Logo";

const ITEMS = [
  "Supabase connected and schema deployed",
  "Gemini API key configured in secrets",
  "Stockera Logo integrated across all pages",
  "User auth (email + Google OAuth) working",
  "Admin/Analyst auth with role guard working",
  "Landing page with all 8 sections complete",
  "Post Query → AI Report flow working end-to-end",
  "Expert video upload to Supabase Storage working",
  "User dashboard with queries, wallet, referrals",
  "Admin dashboard with query queue and video upload",
  "Notifications system with real-time updates",
  "All brand colors applied (Teal, Navy, Gold only)",
  "DM Serif Display fonts on all headings",
  "SEBI disclaimers on all financial content pages",
  "Mobile responsive — tested 375px, 768px, 1280px",
  "404 page configured",
  "Meta tags and OG tags set (with Stockera logo)",
  "Print/PDF report styling works",
  "WhatsApp share working",
];

export default function LaunchChecklist() {
  return (
    <div className="min-h-screen bg-mesh px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Logo size="md" />
          <span className="font-mono text-xs text-muted-foreground">dev only</span>
        </div>
        <h1 className="font-display text-3xl">Launch Checklist</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask The Expert by Stockera — production readiness.
        </p>
        <ul className="mt-6 space-y-2">
          {ITEMS.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm"
            >
              <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-success/15 text-success">
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Publish from Lovable's deploy interface when ready.
        </p>
      </div>
    </div>
  );
}
