import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, Check, Gift, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Reveal } from "./motion-helpers";

export function ReferralBanner() {
  const { user, profile } = useAuth();
  const [copied, setCopied] = useState(false);

  const refLink = profile?.referral_code
    ? `${typeof window !== "undefined" ? window.location.origin : "https://stockera.in"}/signup?ref=${profile.referral_code}`
    : null;

  const handleCopy = async () => {
    if (!refLink) return;
    try {
      await navigator.clipboard.writeText(refLink);
      setCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  return (
    <section className="px-4 py-16 sm:px-6">
      <Reveal className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-gold p-8 text-[hsl(var(--gold-foreground))] shadow-card-lg sm:p-12">
          <Gift className="absolute -right-6 -top-6 h-40 w-40 opacity-10" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--gold-foreground))]/10 px-3 py-1 text-xs font-semibold">
                <Gift className="h-3.5 w-3.5" /> REFERRAL REWARDS
              </div>
              <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
                Earn ₹50 for Every Friend You Refer
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed opacity-90 sm:text-base">
                Share your link → they sign up → you both get ₹50 wallet credit. No limits. Withdraw or use it for premium queries.
              </p>
            </div>

            <div className="rounded-2xl bg-[hsl(var(--gold-foreground))]/10 p-5 backdrop-blur">
              {user && refLink ? (
                <>
                  <div className="text-[10px] font-semibold uppercase tracking-widest opacity-80">Your Referral Link</div>
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-card p-2.5">
                    <code className="flex-1 truncate font-mono text-xs text-foreground">{refLink}</code>
                    <Button size="sm" onClick={handleCopy} className="rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <div className="mt-3 text-xs opacity-80">
                    Code: <span className="font-mono font-semibold">{profile?.referral_code}</span>
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-medium">Sign up to get your referral link</p>
                  <Button asChild className="mt-4 w-full rounded-full bg-[hsl(var(--gold-foreground))] text-gold hover:opacity-90">
                    <Link to="/signup">Get My Referral Link <ArrowRight className="ml-1 h-4 w-4" /></Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
