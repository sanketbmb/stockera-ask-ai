import { AnimatedCounter } from "@/components/common/AnimatedCounter";

const items = [
  { icon: "📊", value: 50247, suffix: " Queries Answered" },
  { icon: "⭐", value: 4.8, suffix: "/5 Avg Rating", decimals: 1 },
  { icon: "🛡️", value: 12, suffix: " SEBI-Verified Experts" },
  { icon: "⚡", value: 47, suffix: " min Avg Response" },
  { icon: "🏆", prefix: "₹", value: 2.4, suffix: " Cr+ Losses Prevented", decimals: 1 },
  { icon: "📈", value: 143, suffix: " queries today" },
];

export function LiveStatsBar() {
  const loop = [...items, ...items];
  return (
    <div className="overflow-hidden bg-gradient-brand bg-noise py-3 text-white">
      <div className="marquee flex w-max gap-12 whitespace-nowrap px-6 font-mono text-sm font-medium">
        {loop.map((t, i) => (
          <span key={i} className="flex items-center gap-2">
            <span>{t.icon}</span>
            <AnimatedCounter end={t.value} prefix={t.prefix} suffix={t.suffix} decimals={t.decimals ?? 0} />
            <span className="text-white/30">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
