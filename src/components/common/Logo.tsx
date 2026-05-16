import { Link } from "@tanstack/react-router";
import logoSrc from "@/assets/stockera-logo.png";
import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "default" | "white" | "compact";
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  linkTo?: string | null;
  className?: string;
}

const sizeMap = { sm: "h-7", md: "h-9", lg: "h-12" };
const titleSizeMap = { sm: "text-sm", md: "text-base", lg: "text-xl" };

export function Logo({
  variant = "default",
  size = "md",
  showTagline = true,
  linkTo = "/",
  className,
}: LogoProps) {
  const isWhite = variant === "white";
  const isCompact = variant === "compact";

  const content = (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src={logoSrc}
        alt="Ask The Expert by Stockera"
        className={cn(sizeMap[size], "w-auto object-contain drop-shadow-sm")}
      />
      {!isCompact && (
        <div className="flex flex-col leading-tight">
          <span
            className={cn(
              "font-display font-normal tracking-tight",
              titleSizeMap[size],
              isWhite ? "text-white" : "text-primary",
            )}
          >
            Ask The Expert
          </span>
          {showTagline && (
            <span
              className={cn(
                "font-mono uppercase tracking-[0.18em] text-[10px]",
                isWhite ? "text-white/70" : "text-muted-foreground",
              )}
            >
              by Stockera
            </span>
          )}
        </div>
      )}
    </div>
  );

  return linkTo ? (
    <Link to={linkTo} className="inline-flex items-center">
      {content}
    </Link>
  ) : (
    content
  );
}

export default Logo;
