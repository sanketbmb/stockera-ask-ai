import { useMemo } from "react";

interface Candle { date: string; close: number }

interface Props {
  candles: Candle[] | null | undefined;
  height?: number;
  className?: string;
}

/** Hand-rolled SVG polyline — no external chart lib. */
export function MiniPriceChart({ candles, height = 60, className }: Props) {
  const svg = useMemo(() => {
    if (!candles || candles.length < 2) return null;
    const w = 300;
    const h = height;
    const closes = candles.map((c) => c.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const step = w / (closes.length - 1);
    const points = closes
      .map((c, i) => `${(i * step).toFixed(2)},${(h - ((c - min) / range) * h).toFixed(2)}`)
      .join(" ");
    const rising = closes[closes.length - 1] >= closes[0];
    return { w, h, points, rising };
  }, [candles, height]);

  if (!svg) {
    return (
      <div
        className={className}
        style={{ height }}
        aria-label="30-day price chart unavailable"
      />
    );
  }
  const stroke = svg.rising ? "hsl(var(--primary))" : "hsl(var(--destructive))";
  return (
    <svg
      viewBox={`0 0 ${svg.w} ${svg.h}`}
      width="100%"
      height={svg.h}
      className={className}
      role="img"
      aria-label="30-day close price trend"
      preserveAspectRatio="none"
    >
      <polyline
        points={svg.points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
