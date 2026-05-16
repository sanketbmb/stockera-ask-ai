import { Logo } from "@/components/common/Logo";
import { cn } from "@/lib/utils";

export function StockeraSkeleton({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex min-h-[40vh] flex-col items-center justify-center gap-4", className)}>
      <div className="animate-pulse"><Logo size="md" linkTo={null} /></div>
      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 skeleton-shine rounded-full" />
      </div>
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}

export function SkeletonBar({ className }: { className?: string }) {
  return <div className={cn("skeleton-shine rounded-md h-4 w-full", className)} />;
}

export default StockeraSkeleton;
