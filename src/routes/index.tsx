import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, Sparkles, Video } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ask The Expert by Stockera — AI Stock Analysis from SEBI Experts" },
      { name: "description", content: "Get AI-generated stock reports and video answers from SEBI-registered Research Analysts. Built for Indian retail investors." },
    ],
  }),
  component: Index,
});

function Index() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.from("analyst_profiles").select("id", { count: "exact", head: true })
      .then(({ error }) => setConnected(!error));
  }, []);

  return (
    <div className="min-h-screen bg-mesh">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex justify-between items-center">
          <Logo size="md" />
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/login">Sign in</Link></Button>
            <Button asChild size="sm" className="bg-gradient-brand text-white shadow-glow-teal">
              <Link to="/signup">Get ₹100 Free <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-card shadow-card mb-6 border border-border">
          <span className={`w-2 h-2 rounded-full ${connected === null ? "bg-muted-foreground animate-pulse" : connected ? "bg-success" : "bg-destructive"}`} />
          <span className="text-xs font-medium font-mono">
            {connected === null ? "Connecting…" : connected ? "Supabase Connected" : "Connection failed"}
          </span>
        </div>

        <h1 className="text-5xl md:text-6xl font-normal mb-4 leading-tight font-display">
          <span className="text-gradient">Ask the experts.</span>
          <br />
          <span className="text-foreground">Decide with conviction.</span>
        </h1>

        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          Instant AI stock analysis backed by SEBI-registered Research Analysts &amp; Investment Advisers — built for Indian retail investors.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
          <Button asChild size="lg" className="bg-gradient-brand text-white shadow-glow-teal">
            <Link to="/signup">Create free account</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/admin/apply">Apply as SEBI Expert</Link>
          </Button>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          <Feature icon={<Sparkles className="h-5 w-5" />} label="AI Reports" value="Instant" />
          <Feature icon={<Video className="h-5 w-5" />} label="Expert Videos" value="< 24 hours" />
          <Feature icon={<ShieldCheck className="h-5 w-5" />} label="SEBI-Verified" value="RA &amp; RIA" />
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl p-5 shadow-card hover:shadow-card-hover transition-shadow border border-border text-left">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-accent font-mono">{icon} {label}</div>
      <div className="text-xl font-display mt-1 text-primary" dangerouslySetInnerHTML={{ __html: value }} />
    </div>
  );
}
