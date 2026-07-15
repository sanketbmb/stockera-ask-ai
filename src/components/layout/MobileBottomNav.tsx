import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ListChecks, Plus, Wallet, User } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/", label: "Home", Icon: Home, ariaLabel: "Go to homepage" },
  { to: "/my-queries", label: "Queries", Icon: ListChecks },
  { to: "/wallet", label: "Wallet", Icon: Wallet },
  { to: "/settings", label: "Profile", Icon: User },
] as const;

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    document.body.classList.add("has-mobile-nav");
    return () => document.body.classList.remove("has-mobile-nav");
  }, []);

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur safe-bottom no-print"
      aria-label="Mobile navigation"
    >
      <div className="relative grid grid-cols-5 h-16">
        {ITEMS.slice(0, 2).map(({ to, label, Icon }) => (
          <NavItem key={to} to={to} label={label} Icon={Icon} active={pathname === to} />
        ))}
        <div className="flex items-center justify-center">
          <Link
            to="/post-query"
            aria-label="Post a Query"
            className="-translate-y-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-teal active:scale-95 transition"
          >
            <Plus className="h-6 w-6" />
          </Link>
        </div>
        {ITEMS.slice(2).map(({ to, label, Icon }) => (
          <NavItem key={to} to={to} label={label} Icon={Icon} active={pathname === to} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({ to, label, Icon, active }: { to: string; label: string; Icon: typeof Home; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex flex-col items-center justify-center gap-1 text-[10px] font-medium",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}

export default MobileBottomNav;
