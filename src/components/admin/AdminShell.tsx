import { type ReactNode, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Inbox,
  Upload,
  User,
  TrendingUp,
  LogOut,
  Menu,
  ShieldCheck,
  Crown,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Logo } from "@/components/common/Logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const NAV = [
  { to: "/admin/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/admin/dashboard", label: "Assigned Queries", Icon: Inbox, hash: "queue" },
  { to: "/admin/profile", label: "My Profile", Icon: User },
] as const;

function AnalystProfileBadge({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["analyst_profile", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("analyst_profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      return data;
    },
  });

  const toggleAvail = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from("analyst_profiles")
        .update({ is_available: next })
        .eq("id", userId);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      toast.success(next ? "You're now Available" : "Marked as Busy");
      qc.invalidateQueries({ queryKey: ["analyst_profile", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!profile) {
    return (
      <p className="text-[11px] text-white/50 font-mono">
        No analyst profile linked yet
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] text-[hsl(var(--gold))] font-mono uppercase tracking-wider">
        <ShieldCheck className="h-3 w-3" />
        SEBI {profile.sebi_type} · {profile.sebi_reg_number}
      </div>
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10">
        <span className="text-[11px] text-white/70 flex items-center gap-1.5">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              profile.is_available ? "bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.7)]" : "bg-amber-400",
            )}
          />
          {profile.is_available ? "Available" : "Busy"}
        </span>
        <Switch
          checked={!!profile.is_available}
          onCheckedChange={(v) => toggleAvail.mutate(v)}
        />
      </div>
      {!profile.is_approved && (
        <div className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
          Pending SEBI verification
        </div>
      )}
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { user, profile, signOut, isAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const initials = (profile?.full_name || user?.email || "E").slice(0, 1).toUpperCase();

  return (
    <div className="flex flex-col h-full text-white" style={{ background: "#0F1E3C" }}>
      <div className="p-5 border-b border-white/10">
        <Logo variant="white" size="sm" linkTo="/" />
      </div>
      <div className="p-5 border-b border-white/10 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border border-[hsl(var(--gold))]/40">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold))] text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{profile?.full_name || "Expert"}</p>
            <p className="text-[11px] text-white/50 truncate">{user?.email}</p>
          </div>
        </div>
        {user && <AnalystProfileBadge userId={user.id} />}
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map(({ to, label, Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={label}
              to={to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] font-medium"
                  : "text-white/70 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          );
        })}
        <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/40">
          <Upload className="h-4 w-4" /> Upload Video <span className="text-[10px] ml-auto">via Queue</span>
        </div>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/40">
          <TrendingUp className="h-4 w-4" /> My Performance <span className="text-[10px] ml-auto">soon</span>
        </div>

        <button
          onClick={async () => {
            await signOut();
            onNavigate?.();
            window.location.href = "/";
          }}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors mt-2"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </nav>

      {isAdmin && (
        <div className="p-4 border-t border-white/10">
          <Link
            to="/admin/super"
            onClick={onNavigate}
            className="flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 bg-gradient-to-r from-[hsl(var(--gold))]/20 to-[hsl(var(--gold))]/5 border border-[hsl(var(--gold))]/40 text-[hsl(var(--gold))] hover:from-[hsl(var(--gold))]/30 transition-all"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Crown className="h-4 w-4" /> Super Admin Panel
            </span>
            <span>→</span>
          </Link>
        </div>
      )}

      <div className="p-4 border-t border-white/10">
        <p className="text-[10px] leading-relaxed text-white/40">
          ⚠ Content is your individual responsibility as a SEBI-registered analyst.
        </p>
      </div>
    </div>
  );
}

export function AdminShell({ children, title }: { children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex bg-mesh">
      <aside className="hidden lg:flex w-72 shrink-0 sticky top-0 h-screen">
        <SidebarBody />
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30">
          <div className="flex items-center justify-between px-4 py-3">
            <Logo size="sm" />
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 border-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarBody onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 lg:py-8 w-full max-w-7xl">
          {title && <h1 className="font-display text-3xl md:text-4xl mb-6">{title}</h1>}
          {children}
        </main>
      </div>
    </div>
  );
}
