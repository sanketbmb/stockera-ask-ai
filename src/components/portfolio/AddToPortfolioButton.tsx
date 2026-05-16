import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Briefcase, Check, Loader2 } from "lucide-react";
import { addToPortfolio } from "@/lib/portfolio.functions";
import { toast } from "sonner";

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
}

export function AddToPortfolioButton({
  queryId, stockName, stockSymbol, buyPrice, currentPrice, target1, stopLoss,
}: Props) {
  const add = useServerFn(addToPortfolio);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);

  const handleAdd = async () => {
    const finalBuy = buyPrice ?? currentPrice;
    if (!stockSymbol || !finalBuy) {
      toast.error("Missing stock symbol or buy price");
      return;
    }
    setLoading(true);
    try {
      await add({
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
      setAdded(true);
      toast.success(`${stockName} added to your portfolio`);
    } catch (e) {
      toast.error((e as Error).message || "Failed to add");
    } finally {
      setLoading(false);
    }
  };

  if (added) {
    return (
      <Button variant="outline" disabled className="w-full">
        <Check className="h-4 w-4 mr-2" /> Added to Portfolio
      </Button>
    );
  }
  return (
    <Button onClick={handleAdd} disabled={loading} variant="outline" className="w-full">
      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Briefcase className="h-4 w-4 mr-2" />}
      Add to my Portfolio
    </Button>
  );
}
