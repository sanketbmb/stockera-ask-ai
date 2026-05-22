import { useState } from "react";
import { Share2, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface Props {
  queryId: string;
  stockName?: string;
  className?: string;
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "default" | "icon";
  compact?: boolean;
}

export function ShareButton({ queryId, stockName, className, variant = "outline", size = "sm", compact = false }: Props) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: refCode } = useQuery({
    queryKey: ["my-referral-code", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("referral_code").eq("id", user!.id).maybeSingle();
      return data?.referral_code ?? null;
    },
    staleTime: 5 * 60_000,
  });

  const handleShare = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/r/${queryId}${refCode ? `?ref=${refCode}` : ""}`;
    const title = stockName ? `${stockName} — SEBI analyst verdict` : "Stockera expert verdict";
    const text = "A SEBI-registered analyst answered this stock query on Stockera. Worth a 30-second read 👇";

    if (typeof navigator !== "undefined" && (navigator as Navigator).share) {
      try {
        await (navigator as Navigator).share({ title, text, url });
        return;
      } catch {/* user cancelled */}
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied — share it anywhere");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <Button onClick={handleShare} variant={variant} size={size} className={className}>
      {copied ? <Check className="h-3.5 w-3.5" /> : compact ? <Share2 className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
      {!compact && (copied ? "Copied" : "Share")}
    </Button>
  );
}
