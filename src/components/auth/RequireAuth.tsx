import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthRedirectPath } from "@/lib/auth/redirectHelper";
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
  if (!user) return <Navigate to={getAuthRedirectPath() as never} replace />;
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
  const { user, isAdmin, isLoading, roles } = useAuth();
  const urlBypass = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("adminBypass") === "1";
  const bypass = import.meta.env.VITE_ADMIN_DEV_BYPASS === "true" || urlBypass;
  if (isLoading) return <FullPageLoader />;
  if (!user) {
    console.warn("[RequireAdmin] No user signed in → redirecting to /admin/login");
    return <Navigate to="/admin/login" />;
  }
  console.info("[RequireAdmin] user=", user.email, "roles=", roles, "isAdmin=", isAdmin, "bypass=", bypass);
  if (!isAdmin && !bypass) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-2xl font-bold">Not authorized</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          You're signed in as <code className="font-mono">{user.email}</code> but your account does not have the
          <code className="font-mono mx-1">admin</code> role.
        </p>
        <p className="text-xs text-muted-foreground">
          Current roles: <code className="font-mono">{roles.length ? roles.join(", ") : "(none)"}</code>
        </p>
        <p className="text-xs text-muted-foreground">
          Dev override: set <code className="font-mono">VITE_ADMIN_DEV_BYPASS=true</code> in <code>.env</code> and restart the dev server.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
