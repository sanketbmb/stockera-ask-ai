import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/common/Logo";

function FullPageLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-mesh">
      <Logo size="lg" linkTo={null} />
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground animate-pulse">
        Loading…
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

export function RequireAnalyst({ children }: { children: ReactNode }) {
  const { user, isAnalyst, isAdmin, isLoading } = useAuth();
  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/admin/login" />;
  if (!isAnalyst && !isAdmin) return <Navigate to="/admin/login" />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isAdmin, isLoading } = useAuth();
  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/admin/login" />;
  if (!isAdmin) return <Navigate to="/admin/login" />;
  return <>{children}</>;
}
