import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SebiFooterNote } from "./SebiFooterNote";
import { TestModeBadge } from "./TestModeBadge";

interface PaywallPopupProps {
  open: boolean;
  onClose: () => void;
  required: number;
  balance: number;
  userId: string | null;
  onCredited?: () => void;
}

export function PaywallPopup({ open, onClose, required, balance, userId, onCredited }: PaywallPopupProps) {
  const [isBeta, setIsBeta] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockedReason, setLockedReason] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    setLockedReason(null);
    supabase
      .from("profiles")
      .select("founder_beta")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setIsBeta((data as any)?.founder_beta === true);
      });
    return () => {
      active = false;
    };
  }, [open, userId]);

  const handleDemoTopup = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("demo-topup-credit", { body: {} });
      if (error) {
        const status = (error as unknown as { context?: Response }).context?.status;
        if (status === 403) {
          setLockedReason("Top-up will be enabled after demo approval.");
          toast.info("Demo top-up not available right now.");
        } else {
          toast.error("Demo top-up failed. Please try again.");
        }
        return;
      }
      const st = (data as any)?.status;
      if (st === "ok") {
        toast.success("+100 pts credited");
      } else if (st === "idempotent_replay") {
        toast.info("Demo top-up already used today.");
      } else {
        toast.error("Unexpected response.");
      }
      onCredited?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Wallet className="h-5 w-5 text-primary" />
            Add points to keep asking
          </DialogTitle>
          <DialogDescription className="text-sm">
            Open mode follow-ups draw on live tools and broader market context — they cost{" "}
            <strong>{required} points</strong> per answer.
            <br />
            <span className="text-muted-foreground">
              Explain mode (this report only) remains free.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 my-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Your balance</span>
            <span className="font-mono tabular-nums">{balance.toLocaleString("en-IN")} pts</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-muted-foreground">Required</span>
            <span className="font-mono tabular-nums">{required.toLocaleString("en-IN")} pts</span>
          </div>
        </div>

        <div className="mt-2 space-y-3">
          {isBeta === null ? (
            <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin mr-2" /> Checking access…
            </div>
          ) : isBeta && !lockedReason ? (
            <Button
              onClick={handleDemoTopup}
              disabled={busy}
              className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Demo Top-Up (+100 pts)
            </Button>
          ) : (
            <p className="text-sm text-center text-muted-foreground py-2">
              {lockedReason ?? "Top-up will be enabled after demo approval."}
            </p>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <div className="flex justify-center">
            <TestModeBadge />
          </div>
          <SebiFooterNote />
        </div>
      </DialogContent>
    </Dialog>
  );
}
