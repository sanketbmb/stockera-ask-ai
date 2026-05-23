import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Star, ShieldCheck, MessageSquare, Video, Sparkles, Globe, Clock, TrendingUp,
  Award, CheckCircle2, ArrowRight, Quote,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { BookSessionModal } from "@/components/analyst/BookSessionModal";
import { VERDICT_MAP } from "@/lib/verdict";
import { SESSION_TIERS, formatINR } from "@/lib/session-tiers";

const flagMap: Record<string, string> = {
  English: "🇬🇧", Hindi: "🇮🇳", Gujarati: "🇮🇳", Marathi: "🇮🇳", Tamil: "🇮🇳",
  Telugu: "🇮🇳", Kannada: "🇮🇳", Bengali: "🇮🇳",
};

export default function AnalystPublicProfile() {
  const { analystId } = useParams({ from: "/analyst/$analystId" });
  const [bookOpen, setBookOpen] = useState(false);

  const { data: analyst, isLoading } = useQuery({
    queryKey: ["analyst-public", analystId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analyst_profiles")
        .select("*")
        .eq("id", analystId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const unapproved = !!analyst && analyst.is_approved === false;

  const { data: recentAnswers } = useQuery({
    queryKey: ["analyst-recent-answers", analystId],
    enabled: !!analyst,
    queryFn: async () => {
      const { data } = await supabase
        .from("answers")
        .select("id, verdict, body, created_at, query_id, queries(stock_name, stock_symbol)")
        .eq("expert_id", analystId)
        .eq("is_published", true)
        .eq("answer_type", "text")
        .order("created_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-mesh">
        <Navbar />
        <div className="mx-auto max-w-5xl p-8 space-y-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!analyst || unapproved) {
    return (
      <div className="min-h-screen bg-mesh flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center text-center p-6">
          <div className="max-w-md">
            {unapproved ? (
              <>
                <ShieldCheck className="h-10 w-10 mx-auto text-amber-500 mb-3" />
                <p className="font-display text-2xl">Awaiting SEBI verification</p>
                <p className="text-muted-foreground mt-2 text-sm">
                  This analyst's profile is still being verified by our compliance team. It will go live as soon as approval is complete — usually within 24–48 hours.
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-2xl">Analyst not found</p>
                <p className="text-muted-foreground mt-2 text-sm">This profile doesn't exist or has been removed.</p>
              </>
            )}
            <Button asChild className="mt-4"><Link to="/">Back home</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  const initials = analyst.display_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2);
  const available = analyst.is_available !== false;

  return (
    <div className="min-h-screen bg-mesh pb-32 sm:pb-12">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-10">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-accent/5 to-gold/10 p-6 sm:p-10"
        >
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />

          <div className="relative grid gap-6 sm:grid-cols-[auto,1fr] items-start">
            <div className="relative">
              <Avatar className="h-28 w-28 sm:h-36 sm:w-36 ring-4 ring-card shadow-card-hover">
                <AvatarImage src={analyst.avatar_url ?? undefined} />
                <AvatarFallback className="bg-gradient-brand text-white text-3xl">{initials}</AvatarFallback>
              </Avatar>
              <span className={`absolute bottom-2 right-2 h-5 w-5 rounded-full ring-4 ring-card ${available ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
            </div>

            <div className="space-y-3">
              <div>
                <h1 className="font-display text-3xl sm:text-4xl text-foreground">{analyst.display_name}</h1>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary/15 px-2.5 py-1 font-mono text-xs font-medium text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" /> SEBI {analyst.sebi_type} · {analyst.sebi_reg_number}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {(analyst.specializations ?? []).slice(0, 4).map((s: string) => (
                  <Badge key={s} variant="secondary" className="bg-accent/10 text-accent text-[11px]">{s}</Badge>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm pt-1">
                <Stat icon={<Star className="h-4 w-4 fill-gold text-gold" />} label={`${Number(analyst.rating).toFixed(1)} rating`} />
                <Stat icon={<TrendingUp className="h-4 w-4 text-accent" />} label={`${analyst.total_sessions?.toLocaleString() ?? 0} sessions`} />
                <Stat icon={<Award className="h-4 w-4 text-primary" />} label={`${analyst.years_experience}+ yrs experience`} />
                <Stat icon={<Globe className="h-4 w-4 text-muted-foreground" />} label={(analyst.languages ?? []).map((l: string) => `${flagMap[l] ?? "🌐"} ${l}`).join(" · ")} />
              </div>

              {analyst.bio && <p className="text-sm text-foreground/80 max-w-2xl pt-2 leading-relaxed">{analyst.bio}</p>}

              <div className="flex flex-wrap gap-3 pt-3">
                <Button asChild size="lg" variant="outline" className="border-accent/40 text-accent hover:bg-accent/10">
                  <Link to="/post-query" search={{ analyst: analystId } as never}>
                    <MessageSquare className="h-4 w-4 mr-2" /> Ask a follow-up
                  </Link>
                </Button>
                <Button size="lg" onClick={() => setBookOpen(true)} className="bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-card-hover">
                  <Video className="h-4 w-4 mr-2" /> Book 1:1 private session
                </Button>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Why book 1:1 */}
        <section className="space-y-4">
          <h2 className="font-display text-2xl flex items-center gap-2"><Sparkles className="h-5 w-5 text-accent" /> Why a private 1:1 changes everything</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: TrendingUp, title: "Live chart walkthrough", body: "Screen-share your terminal. Get exact entry, stop-loss and exit levels — not vague 'maybe buy' tips." },
              { icon: ShieldCheck, title: "Personalised portfolio review", body: "Position-sizing, sector concentration, hidden correlation risks. Done in front of you, defended live." },
              { icon: MessageSquare, title: "7-day WhatsApp follow-up", body: "Stuck after the call? Message your analyst directly for 7 days. No bots. No call centre." },
            ].map((c, i) => (
              <motion.div key={c.title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                <Card className="p-5 h-full border-l-4 border-l-accent hover:shadow-card-hover transition-shadow">
                  <c.icon className="h-6 w-6 text-accent mb-3" />
                  <p className="font-display text-base">{c.title}</p>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{c.body}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Pricing tiers preview */}
        <section className="space-y-4">
          <h2 className="font-display text-2xl">Session plans</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {SESSION_TIERS.map((t) => (
              <Card key={t.id} className={`p-5 relative ${t.highlight ? "border-accent shadow-card-hover" : ""}`}>
                {t.highlight && <Badge className="absolute -top-2 right-4 bg-gradient-to-r from-primary to-accent text-primary-foreground border-0 text-[10px]">Best value</Badge>}
                <p className="font-display text-lg">{t.label}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> {t.minutes} minutes</p>
                <p className="mt-3 font-mono text-2xl font-bold text-accent">{formatINR(t.amountPaise)}</p>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{t.blurb}</p>
              </Card>
            ))}
          </div>
          <div className="text-center">
            <Button size="lg" onClick={() => setBookOpen(true)} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
              Book your slot <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </section>

        {/* Recent answers */}
        {recentAnswers && recentAnswers.length > 0 && (
          <section className="space-y-4">
            <h2 className="font-display text-2xl flex items-center gap-2"><Quote className="h-5 w-5 text-accent" /> Recent public verdicts</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {recentAnswers.map((a) => {
                const v = a.verdict ? VERDICT_MAP[a.verdict] : null;
                const stock = (a as unknown as { queries: { stock_name: string; stock_symbol: string | null } }).queries;
                return (
                  <Link key={a.id} to="/r/$queryId" params={{ queryId: a.query_id }}>
                    <Card className="p-4 h-full hover:shadow-card-hover transition-all hover:-translate-y-0.5">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-[11px] text-muted-foreground">{stock?.stock_name}</span>
                        {v && <span className={`text-[10px] px-2 py-0.5 rounded border ${v.color}`}>{v.label}</span>}
                      </div>
                      <p className="text-xs text-foreground/80 line-clamp-4 leading-relaxed">{a.body}</p>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Trust strip */}
        <section className="rounded-2xl border border-border bg-card p-5 grid sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" /> SEBI-registered analyst · grievance & escalation via <Link to="/grievance-redressal" className="underline">SCORES</Link></div>
          <div className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" /> Full refund if analyst no-shows or you cancel 6h+ before</div>
          <div className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" /> Sessions are educational. Not investment advice — read our <Link to="/sebi-compliance" className="underline">disclaimer</Link>.</div>
        </section>
      </main>

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 inset-x-0 z-40 sm:hidden border-t border-border bg-card/95 backdrop-blur p-3 flex gap-2">
        <Button asChild variant="outline" className="flex-1">
          <Link to="/post-query" search={{ analyst: analystId } as never}>Follow-up</Link>
        </Button>
        <Button onClick={() => setBookOpen(true)} className="flex-1 bg-gradient-to-r from-primary to-accent text-primary-foreground">
          Book 1:1
        </Button>
      </div>

      <BookSessionModal open={bookOpen} onOpenChange={setBookOpen} analystId={analystId} analystName={analyst.display_name} />
    </div>
  );
}

function Stat({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1.5 text-foreground/80">{icon}{label}</span>;
}
