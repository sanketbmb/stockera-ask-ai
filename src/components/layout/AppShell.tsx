import { type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ListChecks, Wallet, Gift, Settings, LogOut, Menu } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { cn } from "@/lib/utils";
import { useWalletBalance, useWalletRealtime } from "@/lib/points";
import { Skeleton } from "@/components/ui/skeleton";

const NAV = [
  { to: "/dashboard", label: "Dashboard", Icon: Home },
  { to: "/my-queries", label: "My Queries", Icon: ListChecks },
  { to: "/wallet", label: "Wallet", Icon: Wallet },
  { to: "/referral", label: "Refer & Earn", Icon: Gift },
  { to: "/settings", label: "Settings", Icon: Settings },
] as const;

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { user, profile, signOut } = useAuth();
  const { data: walletBalance, isLoading: balanceLoading } = useWalletBalance(user?.id);
  useWalletRealtime(user?.id);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const initials = (profile?.full_name || user?.email || "U").slice(0, 1).toUpperCase();

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-border">
        <Logo size="sm" linkTo="/" />
      </div>
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{profile?.full_name || "Welcome"}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <Badge variant="outline" className="mt-3 w-full justify-center font-mono text-xs bg-primary/5 border-primary/20 text-primary">
          ₹{profile?.wallet_balance ?? 0} wallet
        </Badge>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map(({ to, label, Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
        <button
          onClick={async () => { await signOut(); onNavigate?.(); }}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </nav>
      <div className="p-4 border-t border-border">
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          ⚠ SEBI Disclaimer: AI reports are educational. Personalized advice comes from SEBI-registered analysts only.
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="min-h-screen bg-mesh flex">
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-border bg-card/80 backdrop-blur sticky top-0 h-screen">
        <SidebarBody />
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30">
          <div className="flex items-center justify-between px-4 py-3">
            <Logo size="sm" />
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarBody />
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-6xl w-full">
          {title && <h1 className="font-display text-3xl md:text-4xl mb-6">{title}</h1>}
          {children}
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
