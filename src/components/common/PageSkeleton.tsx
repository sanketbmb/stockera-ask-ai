import { Logo } from "@/components/common/Logo";

export function PageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-mesh">
      <div className="animate-pulse"><Logo size="md" linkTo={null} /></div>
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/2 animate-[marquee_1.2s_linear_infinite] bg-gradient-brand" />
      </div>
    </div>
  );
}

export default PageSkeleton;
