const items = [
  { icon: "🛡️", label: "SEBI-Registered Research Analyst · INH000019071" },
  { icon: "📊", label: "AI reports from real NSE/BSE data" },
  { icon: "🎥", label: "Personalized video answers in 24 hours" },
  { icon: "🎁", label: "First 2 reports free" },
  { icon: "🗣️", label: "Hindi & English" },
];

export function LiveStatsBar() {
  const loop = [...items, ...items];
  return (
    <div className="overflow-hidden bg-gradient-brand bg-noise py-3 text-white">
      <div className="marquee flex w-max gap-12 whitespace-nowrap px-6 font-mono text-sm font-medium">
        {loop.map((t, i) => (
          <span key={i} className="flex items-center gap-2">
            <span>{t.icon}</span>
            <span>{t.label}</span>
            <span className="text-white/30">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
