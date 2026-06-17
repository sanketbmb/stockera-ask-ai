import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Wallet, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "asktheexpert_welcome_seen_v1";

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => setOpen(true), 400);
    return () => window.clearTimeout(t);
  }, []);

  const markSeen = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) markSeen();
    setOpen(next);
  };

  const go = (to: "/post-query" | "/wallet") => {
    markSeen();
    setOpen(false);
    navigate({ to });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center font-display text-2xl">
            Welcome to Ask The Expert 🎉
          </DialogTitle>
          <DialogDescription className="text-center text-sm leading-relaxed pt-2">
            We&apos;ve credited <span className="font-semibold text-foreground">250 points</span> to your wallet
            (valid for 30 days) — enough for ~5 AI reports. Use them to research stocks,
            get sector views, or ask SEBI-registered analysts.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col sm:flex-col gap-2 sm:space-x-0">
          <Button
            onClick={() => go("/post-query")}
            className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-95"
          >
            <Plus className="h-4 w-4 mr-2" /> Post your first query
          </Button>
          <Button onClick={() => go("/wallet")} variant="outline" className="w-full">
            <Wallet className="h-4 w-4 mr-2" /> View wallet
          </Button>
        </DialogFooter>
        <p className="text-center text-[10px] text-muted-foreground mt-2">
          SEBI Reg: INH000019071 · Educational only
        </p>
      </DialogContent>
    </Dialog>
  );
}

export default WelcomeModal;
