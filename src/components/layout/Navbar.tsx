import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, LogOut, LayoutDashboard, MessageSquare, Wallet } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/common/NotificationBell";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Experts", href: "/#experts" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/faq" },
];

export function Navbar() {
  const { user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const initials = (profile?.full_name || user?.email || "U").slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo size="md" />

        <nav className="hidden items-center gap-7 lg:flex">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Button asChild className="rounded-full bg-gradient-brand text-white shadow-glow-teal hover:opacity-95">
            <Link to="/post-query">Post a Query</Link>
          </Button>

          {user ? (
            <>
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full ring-2 ring-transparent transition hover:ring-accent/30">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">{initials}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm font-medium">{profile?.full_name ?? "Investor"}</div>
                  <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/dashboard"><LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/my-queries"><MessageSquare className="mr-2 h-4 w-4" /> My Queries</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/wallet"><Wallet className="mr-2 h-4 w-4" /> Wallet</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}><LogOut className="mr-2 h-4 w-4" /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm"><Link to="/login">Login</Link></Button>
              <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90"><Link to="/signup">Get Started Free</Link></Button>
            </>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" aria-label="Open menu"><Menu className="h-5 w-5" /></Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[85vw] sm:w-96">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="mt-6 flex flex-col gap-5">
              {navLinks.map((l) => (
                <a key={l.label} href={l.href} onClick={() => setOpen(false)}
                  className="text-base font-medium text-foreground">{l.label}</a>
              ))}
              <div className={cn("mt-4 flex flex-col gap-2 border-t border-border pt-5")}>
                <Button asChild className="rounded-full bg-gradient-brand text-white"><Link to="/post-query">Post a Query</Link></Button>
                {user ? (
                  <>
                    <Button asChild variant="outline"><Link to="/dashboard">Dashboard</Link></Button>
                    <Button variant="ghost" onClick={() => signOut()}>Sign out</Button>
                  </>
                ) : (
                  <>
                    <Button asChild variant="outline"><Link to="/login">Login</Link></Button>
                    <Button asChild><Link to="/signup">Get Started Free</Link></Button>
                  </>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
