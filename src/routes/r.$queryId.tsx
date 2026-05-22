import { useEffect } from "react";
import { createFileRoute, Link, useParams, useSearch, useServerFn } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ShieldCheck, Lock, ArrowRight, Sparkles, Gift, Star, TrendingUp } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicReport } from "@/lib/public-report.functions";
import { VERDICT_MAP } from "@/lib/verdict";
import { formatDistanceToNow } from "date-fns";

const REFERRAL_KEY = "stockera_pending_referral";
const REFERRAL_TTL_MS = 7 * 24 * 3600 * 1000;

function PublicReportPage() {
  const { queryId } = useParams({ from: "/r/$queryId" });
  const search = useSearch({ strict: false }) as { ref?: string };
  const fetchReport = useServerFn(getPublicReport);

  // Persist referral code from URL
  useEffect(() => {
    if (search.ref && typeof window !== "undefined") {
      try {
        localStorage.setItem(REFERRAL_KEY, JSON.stringify({ code: search.ref, ts: Date.now() }));
      } catch {/* ignore */}
    }
  }, [search.ref]);

  const { data, isLoading } = useQuery({
    queryKey: ["public-report", queryId],
    queryFn: () => fetchReport({ data: { queryId } }),
  });

  return (
    <div className="min-h-screen bg-mesh">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/login">Login</Link></Button>
            <Button asChild size="sm" className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
              <Link to="/signup" search={search.ref ? { ref: search.ref } as never : undefined}>Sign up free</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 space-y-6">
        {search.ref && (
          <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm flex items-center gap-2">
            <Gift className="h-4 w-4 text-[hsl(var(--gold-foreground))]" />
            <span><strong>Your friend invited you</strong> — sign up and you both get ₹50 instantly + 2 free AI reports.</span>
          </div>
        )}

        {isLoading && <Skeleton className="h-72 w-full rounded-2xl" />}

        {!isLoading && data && !data.found && (
          <Card className="p-8 text-center">
            <p className="font-display text-xl">This report doesn't exist or is private.</p>
            <Button asChild className="mt-4"><Link to="/">Go to Stockera</Link></Button>
          </Card>
        )}

        {!isLoading && data?.found && (
          <>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-6 border-l-4 border-l-accent">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">SEBI analyst verdict on</p>
                    <h1 className="font-display text-3xl mt-1">{data.query.stock_name}{data.query.stock_symbol ? <span className="text-muted-foreground text-lg"> · {data.query.stock_symbol}</span> : null}</h1>
                  </div>
                  {data.answer?.verdict && (
                    <span className={`px-3 py-1.5 rounded-md text-sm font-semibold border ${VERDICT_MAP[data.answer.verdict]?.color ?? "bg-muted"}`}>
                      {VERDICT_MAP[data.answer.verdict]?.label}
                    </span>
                  )}
                </div>

                {data.analyst && (
                  <Link to="/analyst/$analystId" params={{ analystId: data.analystId! }} className="inline-flex items-center gap-3 group">
                    <Avatar className="h-10 w-10 ring-2 ring-card">
                      <AvatarImage src={data.analyst.avatar_url ?? undefined} />
                      <AvatarFallback>{data.analyst.display_name.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm group-hover:text-accent transition-colors">{data.analyst.display_name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> SEBI {data.analyst.sebi_type} · {data.analyst.sebi_reg_number}
                      </p>
                    </div>
                  </Link>
                )}

                {data.answer ? (
                  <div className="mt-5 relative">
                    <p className="text-base leading-relaxed whitespace-pre-wrap text-foreground/90">{data.answer.preview}</p>
                    {data.answer.truncated && (
                      <div className="mt-3 relative h-24 overflow-hidden">
                        <div className="space-y-2 blur-sm select-none">
                          <div className="h-3 bg-muted rounded w-full" />
                          <div className="h-3 bg-muted rounded w-11/12" />
                          <div className="h-3 bg-muted rounded w-10/12" />
                          <div className="h-3 bg-muted rounded w-9/12" />
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-card" />
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-3">
                      {formatDistanceToNow(new Date(data.answer.created_at!), { addSuffix: true })}
                    </p>
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-muted-foreground italic">Expert answer arriving within 24h of question.</p>
                )}
              </Card>
            </motion.div>

            {/* Hook CTA */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="relative overflow-hidden p-6 sm:p-8 border-2 border-accent/30 bg-gradient-to-br from-primary/10 via-accent/5 to-gold/10">
                <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
                <div className="relative">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-accent mb-2">
                    <Lock className="h-3 w-3" /> THE REST IS FOR MEMBERS
                  </div>
                  <h2 className="font-display text-2xl sm:text-3xl text-foreground leading-tight">
                    Don't gamble your portfolio.<br />
                    Get a <span className="text-accent">SEBI-verified second opinion</span> in 24 hours.
                  </h2>
                  <p className="mt-3 text-sm text-muted-foreground max-w-xl">
                    Instant AI report + a real registered analyst's voice — for less than the cost of one bad trade.
                    Telegram tipsters are why you're down 28%. Stop. Ask someone with a SEBI licence.
                  </p>

                  <div className="mt-5 grid sm:grid-cols-3 gap-2 text-[11px]">
                    <Perk icon={<Sparkles className="h-3.5 w-3.5" />} text="₹100 wallet credit on signup" />
                    <Perk icon={<Star className="h-3.5 w-3.5" />} text="2 free AI reports" />
                    <Perk icon={<TrendingUp className="h-3.5 w-3.5" />} text="Refer a friend → ₹50 each" />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button asChild size="lg" className="bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-card-hover">
                      <Link to="/signup" search={search.ref ? { ref: search.ref } as never : undefined}>
                        Sign up free · ₹100 credit <ArrowRight className="h-4 w-4 ml-1.5" />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <Link to="/login">I already have an account</Link>
                    </Button>
                  </div>

                  <p className="mt-4 text-[11px] text-muted-foreground italic">
                    2,400+ traders dodged a FOMO trade this month using Stockera.
                  </p>
                </div>
              </Card>
            </motion.div>

            <p className="text-[10px] text-center text-muted-foreground italic px-4">
              This is the personal educational analysis of a SEBI-registered Research Analyst. Not investment advice.
              Stockera (BASL-XXXX, pending). Grievances: <Link to="/grievance-redressal" className="underline">SCORES portal</Link>.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Perk({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-md bg-card/80 border border-border px-2.5 py-1.5 flex items-center gap-1.5 text-foreground/80">
      <span className="text-accent">{icon}</span>{text}
    </div>
  );
}

export const Route = createFileRoute("/r/$queryId")({
  head: () => ({ meta: [{ title: "SEBI Analyst Verdict — Stockera" }] }),
  component: PublicReportPage,
});

export { REFERRAL_KEY, REFERRAL_TTL_MS };
