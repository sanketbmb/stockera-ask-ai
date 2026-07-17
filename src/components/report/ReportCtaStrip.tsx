import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { BookmarkPlus, Check, Download, Loader2, Share2, X } from "lucide-react";
import { toast } from "sonner";
import {
  addToPortfolio,
  getPortfolioEntryByQuery,
  removeFromPortfolio,
} from "@/lib/portfolio.functions";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthRedirectPath } from "@/lib/auth/redirectHelper";

function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).replace(/[₹,\s]/g, "").match(/[\d.]+/);
  return m ? Number(m[0]) : null;
}

interface Props {
  queryId: string;
  stockName: string;
  stockSymbol: string | null;
  buyPrice: number | null;
  currentPrice: number | null;
  target1?: string;
  stopLoss?: string;
  isPublic?: boolean;
}

export function ReportCtaStrip({
  queryId,
  stockName,
  stockSymbol,
  buyPrice,
  currentPrice,
  target1,
  stopLoss,
  isPublic = true,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addFn = useServerFn(addToPortfolio);
  const removeFn = useServerFn(removeFromPortfolio);
  const lookupFn = useServerFn(getPortfolioEntryByQuery);

  const { data: existing } = useQuery({
    queryKey: ["portfolio-entry", queryId],
    queryFn: () => lookupFn({ data: { queryId } }),
    enabled: Boolean(user && queryId),
    staleTime: 30_000,
  });

  const inWatchlist = Boolean(existing?.id);
  const [justAdded, setJustAdded] = useState(false);

  const addMut = useMutation({
    mutationFn: async () => {
      const finalBuy = buyPrice ?? currentPrice;
      if (!stockSymbol || !finalBuy) throw new Error("Missing stock symbol or price");
      return addFn({
        data: {
          queryId,
          stockSymbol,
          stockName,
          buyPrice: finalBuy,
          quantity: 1,
          target: parsePrice(target1),
          stopLoss: parsePrice(stopLoss),
        },
      });
    },
    onSuccess: () => {
      setJustAdded(true);
      toast.success(`Added ${stockSymbol ?? stockName} to your Watchlist`);
      queryClient.invalidateQueries({ queryKey: ["portfolio-entry", queryId] });
      setTimeout(() => setJustAdded(false), 1200);
    },
    onError: (e: Error) => {
      const msg = e.message || "Could not add to Watchlist";
      if (/duplicate|unique/i.test(msg)) toast.message("Already in your Watchlist");
      else toast.error(msg);
    },
  });

  const removeMut = useMutation({
    mutationFn: async () => {
      if (!existing?.id) return;
      return removeFn({ data: { id: existing.id } });
    },
    onSuccess: () => {
      toast.success("Removed from Watchlist");
      queryClient.invalidateQueries({ queryKey: ["portfolio-entry", queryId] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not remove"),
  });

  const handleWatchlistClick = () => {
    if (!user) {
      toast.info("Sign in to save to your Watchlist");
      navigate({ to: getAuthRedirectPath() as never });
      return;
    }
    if (inWatchlist) removeMut.mutate();
    else addMut.mutate();
  };

  const handlePdf = () => {
    const sym = (stockSymbol ?? stockName).replace(/[^A-Za-z0-9_-]/g, "");
    const date = new Date().toISOString().slice(0, 10);
    const original = document.title;
    document.title = `AskTheExpert-${sym}-${date}`;
    setTimeout(() => {
      window.print();
      setTimeout(() => { document.title = original; }, 500);
    }, 50);
  };

  const handleShare = async () => {
    const url = window.location.href;
    const title = `${stockName} — AskTheExpert Report`;
    if (!isPublic) {
      toast.message("Make this report public from My Queries to share", {
        action: { label: "My Queries", onClick: () => navigate({ to: "/my-queries" }) },
      });
      return;
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title, url }); return; } catch { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      // execCommand fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast.success("Link copied to clipboard");
      } catch {
        toast.error("Copy failed — long-press the URL to share manually");
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  // Inject scoped styles once (sheen + lift). Reduced-motion safe.
  useEffect(() => {
    if (document.getElementById("report-cta-strip-styles")) return;
    const style = document.createElement("style");
    style.id = "report-cta-strip-styles";
    style.textContent = `
      .rcs-btn { position: relative; overflow: hidden; transition: transform .25s ease, box-shadow .25s ease; }
      .rcs-btn:hover { transform: translateY(-1px); }
      .rcs-btn .rcs-sheen {
        position: absolute; inset: 0; pointer-events: none;
        background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,.35) 50%, transparent 70%);
        transform: translateX(-120%); transition: transform .7s ease;
      }
      .rcs-btn:hover .rcs-sheen { transform: translateX(120%); }
      .rcs-primary:hover { box-shadow: 0 10px 28px -10px hsl(var(--primary) / 0.55); }
      .rcs-pop { animation: rcs-pop .45s cubic-bezier(.2,.8,.2,1.2); }
      @keyframes rcs-pop { 0%{transform:scale(.92)} 60%{transform:scale(1.06)} 100%{transform:scale(1)} }
      @media (prefers-reduced-motion: reduce) {
        .rcs-btn, .rcs-btn:hover { transform: none; transition: none; }
        .rcs-btn .rcs-sheen { display: none; }
        .rcs-pop { animation: none; }
      }
    `;
    document.head.appendChild(style);
  }, []);

  const watchBusy = addMut.isPending || removeMut.isPending;

  return (
    <div className="mx-auto max-w-4xl print:hidden">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Button
          onClick={handleWatchlistClick}
          disabled={watchBusy}
          className={`rcs-btn rcs-primary w-full justify-center text-primary-foreground ${
            inWatchlist
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-600 hover:to-teal-600"
              : "bg-gradient-to-r from-teal-600 to-primary hover:from-teal-500 hover:to-primary"
          } ${justAdded ? "rcs-pop" : ""}`}
          aria-label={inWatchlist ? `Remove ${stockSymbol ?? stockName} from Watchlist` : `Add ${stockSymbol ?? stockName} to Watchlist`}
        >
          <span className="rcs-sheen" aria-hidden />
          {watchBusy ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : inWatchlist ? (
            <Check className="h-4 w-4 mr-2" />
          ) : (
            <BookmarkPlus className="h-4 w-4 mr-2" />
          )}
          <span className="truncate">
            {inWatchlist ? "In Watchlist · Remove" : "Add to my Watchlist"}
          </span>
          {inWatchlist && <X className="h-3.5 w-3.5 ml-2 opacity-70" />}
        </Button>

        <Button
          variant="outline"
          onClick={handlePdf}
          className="rcs-btn w-full justify-center border-border hover:border-primary/40 hover:bg-primary/5"
        >
          <span className="rcs-sheen" aria-hidden />
          <Download className="h-4 w-4 mr-2" />
          <span className="truncate">Download PDF</span>
        </Button>

        <Button
          variant="outline"
          onClick={handleShare}
          className="rcs-btn w-full justify-center border-border hover:border-primary/40 hover:bg-primary/5"
        >
          <span className="rcs-sheen" aria-hidden />
          <Share2 className="h-4 w-4 mr-2" />
          <span className="truncate">Share Report</span>
        </Button>
      </div>
    </div>
  );
}

export default ReportCtaStrip;
