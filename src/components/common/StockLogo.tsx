// SEO STAGE B — universal stock logo renderer.
// Logo-only: never renders user, wallet, price, or unlock data.
import { cn } from "@/lib/utils";
import { initialsDataUrl, stockLogoSrc } from "@/lib/stock-logo";

interface Props {
  symbol: string | null | undefined;
  size?: number;
  className?: string;
  alt?: string;
  rounded?: boolean;
}

export function StockLogo({ symbol, size = 32, className, alt, rounded }: Props) {
  const src = stockLogoSrc(symbol);
  const fallback = initialsDataUrl(symbol ?? "?");
  return (
    <img
      src={src}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      alt={alt ?? `${(symbol ?? "").toString().toUpperCase() || "Stock"} logo`}
      style={{ width: size, height: size }}
      className={cn(
        rounded !== false && "rounded-md",
        "shrink-0 border border-border bg-white object-contain p-1",
        className,
      )}
      onError={(e) => {
        const img = e.currentTarget as HTMLImageElement;
        if (img.src !== fallback) img.src = fallback;
      }}
    />
  );
}

export default StockLogo;
