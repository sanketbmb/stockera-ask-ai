import { useEffect, useState } from "react";
import { Star, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Reveal } from "./motion-helpers";

const testimonials = [
  { quote: "I was about to panic sell IDFC Bank at ₹63. The AI report said HOLD with support at ₹60. I held, it's now ₹74. Saved my ₹45,000.", name: "Rajesh K.", city: "Pune", stock: "IDFC First Bank" },
  { quote: "Priya ma'am's video in Hindi was so clear. She told me exactly when to average Tata Motors. Really helpful.", name: "Sunita M.", city: "Jaipur", stock: "Tata Motors" },
  { quote: "Unlike social media tipsters, these experts actually explain the WHY. Worth every rupee.", name: "Aman S.", city: "Delhi", stock: "Multiple" },
  { quote: "The AI report is shockingly accurate. Got the support zone for Zomato exactly right.", name: "Neha P.", city: "Mumbai", stock: "Zomato" },
  { quote: "First free query convinced me. Now I use it for every stock I'm confused about.", name: "Vikram T.", city: "Chennai", stock: "Multiple" },
  { quote: "Finally a platform that speaks our language — not just English jargon.", name: "Dinesh R.", city: "Ahmedabad", stock: "Reliance" },
];

export function Testimonials() {
  const [start, setStart] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStart((s) => (s + 1) % testimonials.length), 4500);
    return () => clearInterval(id);
  }, []);

  const visible = [0, 1, 2].map((i) => testimonials[(start + i) % testimonials.length]);

  return (
    <section className="bg-secondary/40 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl text-foreground sm:text-4xl">What Investors Are Saying</h2>
          <p className="mt-3 text-muted-foreground">Real reviews from real investors across India.</p>
        </Reveal>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {visible.map((t, i) => (
            <div
              key={`${start}-${i}`}
              className="animate-[fade-in_0.6s_ease-out] rounded-2xl border border-border bg-card p-6 shadow-card md:[&:nth-child(2)]:translate-y-0 md:[&:nth-child(1)]:translate-y-3 md:[&:nth-child(3)]:translate-y-3"
            >
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, k) => <Star key={k} className="h-4 w-4 fill-gold text-gold" />)}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground">"{t.quote}"</p>
              <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-gradient-brand text-xs text-white">{t.name.split(" ").map((s) => s[0]).join("")}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-foreground">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.city} · {t.stock}</div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-center gap-1.5">
          {testimonials.map((_, i) => (
            <button
              key={i}
              onClick={() => setStart(i)}
              className={`h-1.5 rounded-full transition-all ${i === start ? "w-6 bg-accent" : "w-1.5 bg-muted-foreground/30"}`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
