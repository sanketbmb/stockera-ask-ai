import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Star, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion-helpers";

interface Expert {
  id?: string;
  display_name: string;
  sebi_reg_number: string;
  sebi_type: string;
  years_experience: number;
  specializations: string[];
  rating: number;
  total_sessions: number;
  languages: string[];
  is_available: boolean | null;
  avatar_url?: string | null;
}

const flagMap: Record<string, string> = {
  English: "🇬🇧", Hindi: "🇮🇳", Gujarati: "🇮🇳", Marathi: "🇮🇳", Tamil: "🇮🇳", Telugu: "🇮🇳", Kannada: "🇮🇳", Bengali: "🇮🇳",
};

const tabs = ["All", "Technical", "Fundamental", "F&O & Swing", "Long Term"] as const;

export function ExpertListing() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("All");

  const { data: experts = [] } = useQuery({
    queryKey: ["landing-experts"],
    queryFn: async (): Promise<Expert[]> => {
      const { data, error } = await supabase
        .from("analyst_profiles")
        .select("id, display_name, sebi_reg_number, sebi_type, years_experience, specializations, rating, total_sessions, languages, is_available, avatar_url")
        .eq("is_approved", true)
        .limit(8);
      if (error || !data || data.length === 0) return [];
      return data as Expert[];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (tab === "All") return experts;
    const key = tab.toLowerCase();
    return experts.filter((e) => e.specializations.some((s) => s.toLowerCase().includes(key.split(" ")[0])));
  }, [experts, tab]);

  return (
    <section id="experts" className="bg-secondary/40 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl text-foreground sm:text-4xl">Meet Our SEBI-Verified Experts</h2>
          <p className="mt-3 text-muted-foreground">Real analysts. Real registrations. Real answers — not anonymous tips.</p>
        </Reveal>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                tab === t ? "bg-primary text-primary-foreground shadow" : "bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {(filtered.length > 0 ? filtered : experts).slice(0, 8).map((e, i) => (
            <Reveal key={(e.id ?? e.sebi_reg_number) + i} delay={i * 0.05}>
              <ExpertCard expert={e} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ExpertCard({ expert }: { expert: Expert }) {
  const available = expert.is_available !== false;
  const initials = expert.display_name.split(" ").map((n) => n[0]).join("").slice(0, 2);

  return (
    <div className={cn(
      "group relative flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover",
      !available && "opacity-70",
    )}>
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar className="h-14 w-14 ring-2 ring-secondary">
            <AvatarImage src={expert.avatar_url ?? undefined} />
            <AvatarFallback className="bg-gradient-brand text-white">{initials}</AvatarFallback>
          </Avatar>
          <span className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-card",
            available ? "bg-success" : "bg-muted-foreground",
          )} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base leading-tight text-foreground">{expert.display_name}</h3>
          <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary">
            SEBI {expert.sebi_type} · {expert.sebi_reg_number}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {expert.specializations.slice(0, 3).map((s, idx) => (
          <Badge key={s} variant="secondary" className={cn(
            "text-[10px] font-medium",
            idx % 2 === 0 ? "bg-accent/10 text-accent" : "bg-gold/15 text-[hsl(var(--gold-foreground))]",
          )}>
            {s}
          </Badge>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        {expert.languages.slice(0, 3).map((l) => (
          <span key={l} className="rounded bg-muted px-1.5 py-0.5">{flagMap[l] ?? "🌐"} {l}</span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1 text-sm">
        <Star className="h-4 w-4 fill-gold text-gold" />
        <span className="font-semibold text-foreground">{Number(expert.rating).toFixed(1)}</span>
        <span className="text-muted-foreground">({expert.total_sessions.toLocaleString()} sessions)</span>
      </div>

      <div className="mt-auto pt-4">
        {available ? (
          <Button asChild className="w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/post-query">Ask This Expert <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        ) : (
          <Button disabled className="w-full rounded-full" variant="secondary">Currently Busy</Button>
        )}
      </div>
    </div>
  );
}
