import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { motion, useInView } from "framer-motion";
import {
  Search,
  Send,
  Play,
  Clock,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { useTypewriter } from "@/lib/motion/useTypewriter";
import { GradientText } from "@/lib/motion";


// Canonical demo report — real SBI averaging report used across the site.
const DEMO_REPORT_ID = "4f71e760-ded3-42c5-a1b4-6dbe005345b1";
// Sample M&M video shown as the Step 2 preview thumbnail.
const DEMO_VIDEO_YT_ID = "daj-U65js2E";
const YT_THUMB = (id: string, q: "maxres" | "hq") => `https://i.ytimg.com/vi/${id}/${q}default.jpg`;
const SBI_QUESTION =
  "I bought SBI Bank at 1227 now at 1029. Should I average, hold, or sell?";

// Deep-link map for Step 3 textual cards → real section anchors on the report.
type TextCard = { icon: string; title: string; desc: string; anchor: string };
const TEXT_CARDS: TextCard[] = [
  { icon: "🔥", title: "Quick Verdict", desc: "BUY / HOLD / SELL — instant clarity", anchor: "quick-verdict" },
  { icon: "📉", title: "Technical Map", desc: "Support, resistance & trend direction", anchor: "technical-map" },
  { icon: "📊", title: "Fundamental View", desc: "Industry, debt, growth drivers", anchor: "fundamental-view" },
  { icon: "🎯", title: "Action Strategy", desc: "Entry zone, stoploss & target levels", anchor: "action-strategy" },
  { icon: "⚖️", title: "Risk–Reward Score", desc: "Risk score, reward & confidence level", anchor: "risk-reward" },
  { icon: "⚠️", title: "What Can Go Wrong?", desc: "Key risks & downside scenarios", anchor: "what-can-go-wrong" },
  { icon: "🧠", title: "Expert Insight", desc: "Strategic summary with behavioral note", anchor: "expert-insight" },
  { icon: "🕒", title: "Delivered in 60 min", desc: "Quick turnaround text-based answer", anchor: "delivered-in-60" },
];

type VideoCard = { icon: string; title: string; desc: string; anchor: string };
const VIDEO_CARDS: VideoCard[] = [
  { icon: "🔥", title: "Quick Verdict", desc: "Video walkthrough of BUY/HOLD/SELL", anchor: "quick-verdict" },
  { icon: "👤", title: "Investor Profile", desc: "Your entry, CMP, P&L on screen", anchor: "action-strategy" },
  { icon: "📊", title: "Fundamental + Technical", desc: "Charts & fundamentals explained", anchor: "fundamental-view" },
  { icon: "🎯", title: "Action Strategy", desc: "Visual entry/exit zones on chart", anchor: "action-strategy" },
  { icon: "⚖️", title: "Risk–Reward Score", desc: "Risk analysis with confidence meter", anchor: "risk-reward" },
  { icon: "⚠️", title: "What Can Go Wrong?", desc: "Visual risk scenarios & sector impact", anchor: "what-can-go-wrong" },
  { icon: "🧠", title: "Expert Closing Insight", desc: "Personal advice from your RA", anchor: "expert-insight" },
  { icon: "🎬", title: "Delivered in 24 hrs", desc: "Self-recorded video by SEBI-registered RA", anchor: "delivered-in-60" },
];

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.15 } } };
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100, damping: 20 } },
};

export function StepStory() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"textual" | "video">("textual");
  const { user } = useAuth();
  const [thumbState, setThumbState] = useState<"maxres" | "hq" | "fallback">("maxres");

  const p1Ref = useRef(null);
  const p1InViewRaw = useInView(p1Ref, {
    once: false,
    amount: 0.15,
    margin: "0px 0px -10% 0px",
  });
  const [p1Started, setP1Started] = useState(false);
  useEffect(() => {
    if (p1InViewRaw && !p1Started) setP1Started(true);
  }, [p1InViewRaw, p1Started]);
  const p1InView = p1InViewRaw || p1Started;
  const typed = useTypewriter(SBI_QUESTION, { start: p1InView, speed: 40 });

  // DEMO report is public — never gate on auth. Anon + authed users go
  // straight to /report/$queryId. Non-demo report flows still enforce auth
  // via AuthGatedReportLink / RequireAuth elsewhere.
  void user;
  const goReport = (view?: "text" | "video", hash?: string) => {
    navigate({
      to: "/report/$queryId",
      params: { queryId: DEMO_REPORT_ID },
      search: view ? ({ view } as never) : undefined,
      hash: hash,
    });
  };
  const goAsk = () => navigate({ to: "/post-query" });

  return (
    <section className="relative overflow-x-hidden">
      {/* Panel 1 — You Ask */}
      <div ref={p1Ref} className="min-h-fit py-12 md:py-16 flex items-center justify-center bg-background relative">
        <div className="container mx-auto px-4 max-w-2xl">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: false, amount: 0.35, margin: "-10% 0px" }}>
            <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-widest text-accent mb-3 text-center">STEP 1</motion.p>
            <motion.h2 variants={fadeUp} className="font-display text-2xl md:text-4xl font-bold text-center text-foreground mb-6">
              You Ask a <GradientText>Question</GradientText>
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
                  {typed.length < SBI_QUESTION.length && (
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

      {/* Panel 2 — Expert Responds */}
      <div className="min-h-fit py-14 md:py-20 flex items-center justify-center bg-secondary/30 relative">
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: false, amount: 0.15, margin: "-10% 0px" }}>
            <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-widest text-accent mb-3 text-center">STEP 2</motion.p>
            <motion.h2 variants={fadeUp} className="font-display text-2xl md:text-4xl font-bold text-center text-foreground mb-6">
              Expert <GradientText>Responds</GradientText>
            </motion.h2>

            {/* Compact chip row — AI speed chip + slots chip live side-by-side */}
            <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-2 mb-6">
              <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold px-3 py-1.5 rounded-full border border-emerald-500/25">
                <Sparkles className="w-3 h-3" /> 20 sec AI report · 2 free
              </span>
              <span className="inline-flex items-center gap-1.5 bg-warning/10 text-warning text-[11px] font-semibold px-3 py-1.5 rounded-full border border-warning/20">
                ✦ Limited availability · Slots filling fast
              </span>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Textual card → view=text */}
              <motion.div
                variants={{
                  hidden: { opacity: 0, x: -50 },
                  visible: {
                    opacity: 1,
                    x: 0,
                    transition: { type: "spring", stiffness: 80 },
                  },
                }}
                onClick={() => goReport("text")}
                className="bg-card rounded-2xl border border-border p-5 shadow-card relative cursor-pointer group hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
              >
                <div className="absolute -top-3 right-4 bg-accent text-accent-foreground text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-md">
                  <Clock className="w-3 h-3" /> Within 60 Minutes
                </div>
                <div className="flex items-center gap-3 mb-3 mt-2">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-sm">RA</div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">RA Mayank Sharma</p>
                    <p className="text-[11px] text-muted-foreground">SEBI Reg. · 8 yrs exp</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-accent" />
                  <span className="text-xs font-semibold text-accent uppercase tracking-wide">Textual Answer</span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                  Free AI report in ~20 sec. Human RA text answer follows within 60 minutes.
                </p>
                <div className="bg-secondary/50 rounded-xl p-4 border border-border/50">
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    "SBIN is near ₹1,020 support with a base building. Averaging here is defensible only with a strict stop below ₹985."
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-[10px] font-bold bg-destructive/10 text-destructive px-2 py-0.5 rounded">⊘ SL: ₹985</span>
                    <span className="text-[10px] font-bold bg-success/10 text-success px-2 py-0.5 rounded">◎ Target: ₹1,180</span>
                  </div>
                </div>
                <p className="mt-4 text-xs text-center font-semibold text-accent group-hover:underline">
                  Click to see full textual answer →
                </p>
              </motion.div>

              {/* Video card → view=video */}
              <motion.div
                variants={{
                  hidden: { opacity: 0, x: 50 },
                  visible: {
                    opacity: 1,
                    x: 0,
                    transition: { type: "spring", stiffness: 80 },
                  },
                }}
                onClick={() => goReport("video")}
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
                  <p className="text-xs text-muted-foreground">Premium human deep-dive. Click to see sample →</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Panel 3 — What You'll Get */}
      <div className="min-h-fit py-14 md:py-20 flex items-center justify-center bg-background relative">
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: false, amount: 0.15, margin: "-10% 0px" }}>
            <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-widest text-accent mb-3 text-center">STEP 3</motion.p>
            <motion.h2 variants={fadeUp} className="font-display text-2xl md:text-4xl font-bold text-center text-foreground mb-3">
              What You'll <GradientText>Get</GradientText>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-sm text-center text-muted-foreground mb-6">
              Deep insights covered in your textual answer & video analysis
            </motion.p>

            <motion.div variants={fadeUp} className="flex items-center justify-center gap-3 mb-6">
              <button
                onClick={() => setTab("textual")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all border ${tab === "textual" ? "bg-accent text-accent-foreground border-accent shadow-card" : "border-border text-muted-foreground hover:border-accent/50"}`}
              >
                <MessageSquare className="w-4 h-4" /> Textual (60 min)
              </button>
              <button
                onClick={() => setTab("video")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all border ${tab === "video" ? "bg-primary text-primary-foreground border-primary shadow-card" : "border-border text-muted-foreground hover:border-primary/50"}`}
              >
                <Play className="w-4 h-4" /> Video (24 hrs)
              </button>
            </motion.div>

            {tab === "textual" ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {TEXT_CARDS.map((item, i) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => goReport("text", item.anchor)}
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
                {VIDEO_CARDS.map((item, i) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => goReport("video", "expert-analysis")}
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
