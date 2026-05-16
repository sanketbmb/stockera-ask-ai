const items = [
  "📊 50,247 Queries Answered",
  "⭐ 4.8/5 Avg Rating",
  "🛡️ 12 SEBI-Verified Experts",
  "⚡ Avg Response: 47 min",
  "🏆 ₹2.4 Cr+ Investor Losses Prevented",
  "📈 Today: 143 queries answered",
];

export function LiveStatsBar() {
  const loop = [...items, ...items];
  return (
    <div className="overflow-hidden bg-gradient-brand py-3 text-white">
      <div className="marquee flex w-max gap-12 whitespace-nowrap px-6 font-mono text-sm font-medium">
        {loop.map((t, i) => (
          <span key={i} className="flex items-center gap-2">
            {t}<span className="text-white/30">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
