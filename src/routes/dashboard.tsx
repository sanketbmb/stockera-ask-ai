import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Logo } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, Wallet, FileText, Share2, PenSquare } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Stockera" }] }),
  component: () => <RequireAuth><Dashboard /></RequireAuth>,
});

function Dashboard() {
  const { profile, user, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-mesh">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex justify-between items-center">
          <Logo size="sm" />
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1.5" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="font-display text-3xl text-foreground">
            Welcome, {profile?.full_name || user?.email}
          </h1>
          <p className="text-muted-foreground mt-1">Your dashboard is coming together — wallet, queries, and reports.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<Wallet className="h-5 w-5" />} label="Wallet" value={`₹${profile?.wallet_balance ?? 0}`} to="/wallet" />
          <StatCard icon={<FileText className="h-5 w-5" />} label="My Queries" value="View" to="/my-queries" />
          <StatCard icon={<PenSquare className="h-5 w-5" />} label="Ask a question" value="New" to="/post-query" highlight />
          <StatCard icon={<Share2 className="h-5 w-5" />} label="Referral" value={profile?.referral_code ?? "—"} to="/referral" mono />
        </div>

        <div className="mt-10 bg-card border border-border rounded-2xl p-8 shadow-card text-center text-muted-foreground">
          <p className="font-mono text-xs uppercase tracking-widest">Coming next</p>
          <p className="mt-2 text-foreground">Query submission, AI report viewer, and expert directory.</p>
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, to, highlight, mono }: { icon: React.ReactNode; label: string; value: string; to: string; highlight?: boolean; mono?: boolean }) {
  return (
    <Link to={to} className={`group block bg-card border border-border rounded-xl p-5 shadow-card hover:shadow-card-hover transition-all ${highlight ? "bg-gradient-brand text-white border-transparent" : ""}`}>
      <div className={`flex items-center gap-2 text-xs uppercase tracking-wider font-mono ${highlight ? "text-white/80" : "text-muted-foreground"}`}>
        {icon} {label}
      </div>
      <div className={`mt-2 text-xl font-display ${mono ? "font-mono" : ""} ${highlight ? "text-white" : "text-primary"}`}>{value}</div>
    </Link>
  );
}
