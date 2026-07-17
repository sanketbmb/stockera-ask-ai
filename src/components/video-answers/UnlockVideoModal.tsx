// Stage 4F.2 APPLY-2 — Unlock confirmation modal.
//
// Flow:
//   idle → click "Confirm & unlock" → useUnlockVideoAnswer mutation → status branch:
//     • "ok"                   → navigate to /v/{answerId}
//     • "already_unlocked"     → navigate to /v/{answerId} (idempotent replay)
//     • "insufficient_credits" → error state with top-up CTA
//     • "unauthenticated"      → auth expiry — send to /login
//     • other                  → generic error, retry available
//
// This modal is the ONLY UI that invokes the unlock mutation.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getAuthRedirectPath } from "@/lib/auth/redirectHelper";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUnlockVideoAnswer } from "@/hooks/useUnlockVideoAnswer";
import { InlinePriceChip } from "./InlinePriceChip";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  answerId: string;
  title: string;
  unlockPriceCredits: number;
  analystName: string | null;
}

export function UnlockVideoModal({
  open,
  onOpenChange,
  answerId,
  title,
  unlockPriceCredits,
  analystName,
}: Props) {
  const { profile, refresh } = useAuth();
  const navigate = useNavigate();
  const mutation = useUnlockVideoAnswer(answerId);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const balance = profile?.wallet_balance ?? 0;
  const insufficient = balance < unlockPriceCredits;

  // Reset transient state when modal reopens.
  useEffect(() => {
    if (open) {
      setErrorMsg(null);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const closeAndGoWatch = () => {
    onOpenChange(false);
    navigate({ to: "/v/$answerId", params: { answerId } });
  };

  const onConfirm = async () => {
    setErrorMsg(null);
    try {
      const res = await mutation.mutateAsync();
      if (res.status === "ok" || res.status === "already_unlocked") {
        await refresh();
        closeAndGoWatch();
        return;
      }
      if (res.status === "insufficient_credits") {
        setErrorMsg(
          `You need ${res.required ?? unlockPriceCredits} credits to unlock. Current balance: ${res.balance ?? balance}.`,
        );
        return;
      }
      if (res.status === "unauthenticated") {
        onOpenChange(false);
        navigate({
          to: getAuthRedirectPath() as never,
          search: { redirect: `/v/${answerId}` } as never,
        });
        return;
      }
      setErrorMsg(`Unable to unlock (status: ${res.status}).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      // Auth expiry surfaces as a thrown 401 from the middleware.
      if (/unauthorized/i.test(msg)) {
        onOpenChange(false);
        navigate({
          to: getAuthRedirectPath() as never,
          search: { redirect: `/v/${answerId}` } as never,
        });
        return;
      }
      setErrorMsg(msg);
    }
  };

  const isBusy = mutation.isPending;
  const showInsufficient =
    errorMsg?.startsWith("You need") || (insufficient && !errorMsg && !mutation.isSuccess);

  return (
    <Dialog open={open} onOpenChange={(o) => !isBusy && onOpenChange(o)}>
      <DialogContent className="max-w-md" data-testid="unlock-video-modal">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">Unlock analyst video</DialogTitle>
          <DialogDescription className="line-clamp-2">{title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
            <span className="text-muted-foreground">Price</span>
            <InlinePriceChip credits={unlockPriceCredits} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
            <span className="text-muted-foreground">Your balance</span>
            <span
              className={
                insufficient ? "font-medium text-destructive" : "font-medium text-foreground"
              }
              data-testid="unlock-modal-balance"
            >
              {balance} credits
            </span>
          </div>
          {analystName && (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>
                By {analystName}. Credits are debited once — you keep permanent access.
              </span>
            </p>
          )}

          {showInsufficient && (
            <div
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Not enough credits</p>
                <p className="mt-0.5">
                  {errorMsg ??
                    `You need ${unlockPriceCredits} credits. Current balance: ${balance}.`}
                </p>
              </div>
            </div>
          )}

          {errorMsg && !showInsufficient && (
            <div
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {showInsufficient ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isBusy}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  navigate({ to: "/topup" });
                }}
                data-testid="unlock-modal-topup"
              >
                Top up credits
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isBusy}>
                Cancel
              </Button>
              <Button
                onClick={onConfirm}
                disabled={isBusy || insufficient}
                data-testid="unlock-modal-confirm"
              >
                {isBusy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Unlocking…
                  </>
                ) : (
                  <>Confirm &amp; unlock — {unlockPriceCredits} credits</>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UnlockVideoModal;
