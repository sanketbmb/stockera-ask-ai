import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, useInView } from "framer-motion";
import {
  Search,
  Send,
  Play,
  Clock,
  MessageSquare,
} from "lucide-react";

// Demo report — real RVNL AI report from library
const DEMO_REPORT_ID = "b2238d39-d6ec-40ae-9a17-780bfa2e1354";

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.15 } } };
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100, damping: 20 } },
};

function useTyping(text: string, speed: number, start: boolean) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (!start) return;
    setDisplayed("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, start]);
  return displayed;
}

export function StepStory() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"textual" | "video">("textual");

  const p1Ref = useRef(null);
  const p1InView = useInView(p1Ref, { once: true, amount: 0.5 });
  const fullQuery = "I bought Dixon at 18,000. Now at 16,200. Should I hold or exit?";
  const typed = useTyping(fullQuery, 40, p1InView);

  const goReport = () =>
    navigate({ to: "/report/$queryId", params: { queryId: DEMO_REPORT_ID } });
  const goAsk = () => navigate({ to: "/post-query" });

  return (
    <section className="relative overflow-x-hidden">
      {/* Panel 1 */}
      <div
        ref={p1Ref}
        className="min-h-fit py-12 md:py-16 flex items-center justify-center bg-background relative"
      >
        <div className="container mx-auto px-4 max-w-2xl">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.4 }}>
            <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-widest text-accent mb-3 text-center">
              STEP 1
            </motion.p>
            <motion.h2 variants={fadeUp} className="font-display text-2xl md:text-4xl font-bold text-center text-foreground mb-6">
              You Ask a <span className="text-gradient" style={{ backgroundImage: "linear-gradient(90deg,#2BA8A0,#1F3C73,#F5B731,#2BA8A0)" }}>Question</span>
            </motion.h2>
            <motion.div
              variants={fadeUp}
              role="button"
              tabIndex={0}
              onClick={goAsk}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && goAsk()}
              className="relative rounded-2xl border border-border bg-card shadow-card-lg overflow-hidden cursor-pointer hover:shadow-card-hover transition-shadow"
            >
              <div className="flex items-center gap-3 p-4 md:p-5">
                <Search className="w-5 h-5 text-muted-foreground shrink-0" />
                <span className="text-sm md:text-base text-foreground flex-1 min-h-[24px] pr-12">
                  {typed}
                  {typed.length < fullQuery.length && (
                    <motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.6 }} className="inline-block w-0.5 h-4 bg-accent ml-0.5 align-middle" />
                  )}
                </span>
              </div>
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center">
                  <Send className="w-4 h-4 text-accent-foreground" />
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Panel 2 */}
      <div className="min-h-fit py-14 md:py-20 flex items-center justify-center bg-secondary/30 relative">
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }}>
            <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-widest text-accent mb-3 text-center">
              STEP 2
            </motion.p>
            <motion.h2 variants={fadeUp} className="font-display text-2xl md:text-4xl font-bold text-center text-foreground mb-8">
              Expert <span className="text-gradient" style={{ backgroundImage: "linear-gradient(90deg,#2BA8A0,#1F3C73,#F5B731,#2BA8A0)" }}>Responds</span>
            </motion.h2>

            <motion.div variants={fadeUp} className="text-center mb-6">
              <span className="inline-flex items-center gap-2 bg-warning/10 text-warning text-xs font-semibold px-3 py-1.5 rounded-full border border-warning/20">
                ✦ Limited availability · Slots filling fast
              </span>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Textual */}
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 80, delay: 0.2 }}
                onClick={goReport}
                className="bg-card rounded-2xl border border-border p-5 shadow-card relative cursor-pointer group hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
              >
                <div className="absolute -top-3 right-4 bg-accent text-accent-foreground text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-md">
                  <Clock className="w-3 h-3" /> Within 60 Minutes
                </div>
                <div className="flex items-center gap-3 mb-4 mt-2">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-sm">RA</div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">RA Mayank Sharma</p>
                    <p className="text-[11px] text-muted-foreground">SEBI Reg. · 8 yrs exp</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-accent" />
                  <span className="text-xs font-semibold text-accent uppercase tracking-wide">Textual Answer</span>
                </div>
                <div className="bg-secondary/50 rounded-xl p-4 border border-border/50">
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    "Dixon is at key support near ₹16,000. Risk-reward turning negative below this level."
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-[10px] font-bold bg-destructive/10 text-destructive px-2 py-0.5 rounded">⊘ SL: ₹14,800</span>
                    <span className="text-[10px] font-bold bg-success/10 text-success px-2 py-0.5 rounded">◎ Target: ₹19,500</span>
                  </div>
                </div>
                <p className="mt-4 text-xs text-center font-semibold text-accent group-hover:underline">
                  Click to see full textual answer →
                </p>
              </motion.div>

              {/* Video */}
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 80, delay: 0.3 }}
                onClick={goReport}
                className="bg-card rounded-2xl border border-border p-5 shadow-card relative cursor-pointer group hover:shadow-card-hover hover:-translate-y-0.5 transition-all flex flex-col"
              >
                <div className="absolute -top-3 right-4 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-md">
                  <Clock className="w-3 h-3" /> Within 24 Hours
                </div>
                <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-accent/5 to-primary/5 rounded-xl border border-border/50 min-h-[180px]">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-accent/10 mx-auto flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <Play className="w-7 h-7 text-accent ml-1" />
                    </div>
                    <p className="text-xs text-muted-foreground">Self-recorded video by RA</p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Play className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-primary uppercase tracking-wide">Video Analysis</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Detailed selfie-recorded breakdown. Click to see sample →</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Panel 3 */}
      <div className="min-h-fit py-14 md:py-20 flex items-center justify-center bg-background relative">
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }}>
            <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-widest text-accent mb-3 text-center">
              STEP 3
            </motion.p>
            <motion.h2 variants={fadeUp} className="font-display text-2xl md:text-4xl font-bold text-center text-foreground mb-3">
              What You'll <span className="text-gradient" style={{ backgroundImage: "linear-gradient(90deg,#2BA8A0,#1F3C73,#F5B731,#2BA8A0)" }}>Get</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-sm text-center text-muted-foreground mb-6">
              Deep technical insights covered in your textual answer & video analysis
            </motion.p>

            <motion.div variants={fadeUp} className="flex items-center justify-center gap-3 mb-6">
              <button
                onClick={() => setTab("textual")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all border ${
                  tab === "textual" ? "bg-accent text-accent-foreground border-accent shadow-card" : "border-border text-muted-foreground hover:border-accent/50"
                }`}
              >
                <MessageSquare className="w-4 h-4" /> Textual (60 min)
              </button>
              <button
                onClick={() => setTab("video")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all border ${
                  tab === "video" ? "bg-primary text-primary-foreground border-primary shadow-card" : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                <Play className="w-4 h-4" /> Video (24 hrs)
              </button>
            </motion.div>

            {tab === "textual" ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { icon: "🔥", title: "Quick Verdict", desc: "BUY / HOLD / SELL — instant clarity via text" },
                  { icon: "📊", title: "Fundamental View", desc: "Industry, debt, growth drivers & outlook" },
                  { icon: "📉", title: "Technical Map", desc: "Support, resistance & trend direction" },
                  { icon: "🎯", title: "Action Strategy", desc: "Entry zone, stoploss & target levels" },
                  { icon: "⚖️", title: "Risk–Reward Score", desc: "Risk score, reward & confidence level" },
                  { icon: "⚠️", title: "What Can Go Wrong?", desc: "Key risks & downside scenarios" },
                  { icon: "🧠", title: "Expert Insight", desc: "Strategic summary with behavioral advice" },
                  { icon: "🕒", title: "Delivered in 60 min", desc: "Quick turnaround text-based answer" },
                ].map((item, i) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.06 }}
                    onClick={goReport}
                    className="flex items-start gap-3 p-3.5 rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 hover:border-accent/50 hover:bg-card hover:-translate-y-0.5 hover:shadow-card transition-all cursor-pointer"
                  >
                    <span className="text-lg shrink-0">{item.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { icon: "🔥", title: "Quick Verdict", desc: "Video walkthrough of BUY/HOLD/SELL decision" },
                  { icon: "👤", title: "Investor Profile", desc: "Your entry, CMP, P&L reviewed on screen" },
                  { icon: "📊", title: "Fundamental + Technical", desc: "Charts, patterns & fundamentals explained" },
                  { icon: "🎯", title: "Action Strategy", desc: "Visual entry/exit zones on chart" },
                  { icon: "⚖️", title: "Risk–Reward Score", desc: "Risk analysis with confidence meter" },
                  { icon: "⚠️", title: "What Can Go Wrong?", desc: "Visual risk scenarios & sector impact" },
                  { icon: "🧠", title: "Expert Closing Insight", desc: "Personal advice from your Research Analyst" },
                  { icon: "🎬", title: "Delivered in 24 hrs", desc: "Self-recorded video by SEBI-registered RA" },
                ].map((item, i) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.06 }}
                    onClick={goReport}
                    className="flex items-start gap-3 p-3.5 rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 hover:border-primary/50 hover:bg-card hover:-translate-y-0.5 hover:shadow-card transition-all cursor-pointer"
                  >
                    <span className="text-lg shrink-0">{item.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export default StepStory;
