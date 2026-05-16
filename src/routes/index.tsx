import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";

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
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <img src={logo} alt="Ask The Expert by Stockera" className="w-32 h-32 mx-auto mb-8 drop-shadow-xl" />

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-card shadow-card mb-6 border border-border">
          <span className={`w-2 h-2 rounded-full ${connected === null ? "bg-muted-foreground animate-pulse" : connected ? "bg-success" : "bg-destructive"}`} />
          <span className="text-xs font-medium font-mono">
            {connected === null ? "Connecting…" : connected ? "Supabase Connected" : "Connection failed"}
          </span>
        </div>

        <h1 className="text-5xl md:text-6xl font-normal mb-4 leading-tight">
          <span className="text-gradient">Ask The Expert</span>
          <span className="text-foreground"> by Stockera</span>
        </h1>

        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          AI-powered stock analysis and video answers from SEBI-registered Research Analysts &amp; Investment Advisers — built for Indian retail investors.
        </p>

        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-gradient-brand text-primary-foreground shadow-glow-teal">
          <span className="font-medium">Building…</span>
          <span className="font-mono text-sm opacity-80">v0.1</span>
        </div>

        <div className="mt-16 grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[
            { label: "AI Reports", value: "Instant" },
            { label: "Expert Videos", value: "SEBI-Verified" },
            { label: "Welcome Bonus", value: "₹100" },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-xl p-5 shadow-card hover:shadow-card-hover transition-shadow border border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{s.label}</div>
              <div className="text-xl font-display mt-1 text-primary">{s.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
