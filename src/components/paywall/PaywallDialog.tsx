import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Wallet } from "lucide-react";
import type { PaywallGateResult } from "@/lib/paywall";
import type { ActionKey } from "@/lib/points";

const ACTION_LABEL: Record<ActionKey, string> = {
  stock_picker: "Stock Picker",
  sector_view: "Sector View",
  ai_report: "AI Report",
  video_answer: "Video Answer",
  live_session: "1:1 Private Session",
  educational: "Educational Report",
};

const ACTION_SUBTITLE: Record<ActionKey, string> = {
  stock_picker: "Run a fresh, filter-aware pick from today's verified universe.",
  sector_view: "Get a structured 12-month view across an entire sector.",
  ai_report: "Generate a personalised, source-backed equity report.",
  video_answer: "Get a recorded analyst response tailored to your question.",
  live_session: "Book a private session with a SEBI-registered analyst.",
  educational: "Unlock the full educational deep-dive.",
};

export function PaywallDialog({
  open,
  onOpenChange,
  gate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gate: PaywallGateResult | null;
}) {
  const navigate = useNavigate();
  if (!gate) return null;

  const label = ACTION_LABEL[gate.action_key] ?? "Premium Action";
  const subtitle = ACTION_SUBTITLE[gate.action_key] ?? "Unlock this premium action.";
  const shortfall = Math.max(0, gate.required_points - gate.current_balance);
  const isSignIn = gate.reason === "Sign in to continue";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 to-transparent" />
        <DialogHeader className="relative">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center text-xl">
            Unlock {label}
          </DialogTitle>
          <DialogDescription className="text-center">
            {subtitle}
          </DialogDescription>
        </DialogHeader>

        {!isSignIn && gate.required_points > 0 && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
            <Row label="Required credits" value={`${gate.required_points}`} strong />
            <Row label="Your balance" value={`${gate.current_balance}`} />
            {shortfall > 0 && (
              <Row label="Shortfall" value={`${shortfall}`} accent />
            )}
            <p className="pt-2 text-xs text-muted-foreground">
              Your welcome credits can be used toward premium actions.
            </p>
          </div>
        )}

        {isSignIn && (
          <p className="text-center text-sm text-muted-foreground">
            Sign in to access premium actions and use your welcome credits.
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              navigate({ to: "/topup" });
            }}
          >
            <Wallet className="mr-2 h-4 w-4" />
            Add Wallet Credits
          </Button>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              navigate({ to: "/pricing" });
            }}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            See pricing
          </button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          accent ? "font-mono text-destructive" : strong ? "font-mono font-semibold" : "font-mono"
        }
      >
        {value}
      </span>
    </div>
  );
}
