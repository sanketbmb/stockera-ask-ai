// Shared PDF download button. Used by stock, sector, and educational
// reports. The button is a plain <Button onClick={...}> — never wrap it in
// a <Link>, an <a href>, or anything that interprets its child text as a
// navigation target.

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Download as DownloadIcon, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  generateAnalysisPdf,
  generateSectorPdf,
  generateEducationalPdf,
} from "@/lib/pdf.functions";
import type { QueryType } from "@/types/stock-analysis";

type Props =
  | { kind: "stock"; symbol: string; horizon: QueryType; includeNews?: boolean }
  | { kind: "sector"; queryId: string }
  | { kind: "educational"; queryId: string };

export function DownloadPdfButton(props: Props) {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const genStock = useServerFn(generateAnalysisPdf);
  const genSector = useServerFn(generateSectorPdf);
  const genEdu = useServerFn(generateEducationalPdf);

  if (!authLoading && !user) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => navigate({ to: "/login" })}
        className="gap-1.5"
      >
        <LogIn className="h-3.5 w-3.5" />
        <span className="text-xs">Sign in to download</span>
      </Button>
    );
  }

  const handleClick = async () => {
    if (busy) return;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      toast.error("Your session expired. Please sign in again.");
      navigate({ to: "/login" });
      return;
    }
    setBusy(true);
    const t = toast.loading("Preparing PDF…");
    try {
      let res: { url: string; cache_hit: boolean };
      if (props.kind === "stock") {
        res = await genStock({
          data: {
            symbol: props.symbol,
            horizon: props.horizon,
            include_news: props.includeNews ?? true,
          },
        });
      } else if (props.kind === "sector") {
        res = await genSector({ data: { queryId: props.queryId } });
      } else {
        res = await genEdu({ data: { queryId: props.queryId } });
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
      toast.success(res.cache_hit ? "Loaded cached PDF" : "PDF ready", { id: t });
    } catch (err) {
      toast.error((err as Error).message || "Could not generate PDF", { id: t });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={busy || authLoading}
      className="gap-1.5"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <DownloadIcon className="h-3.5 w-3.5" />
      )}
      <span className="text-xs">{busy ? "Generating…" : "Download PDF"}</span>
    </Button>
  );
}

