import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

interface Props {
  stockName: string;
  verdict?: string;
  tagline?: string;
  className?: string;
}

export function WhatsAppShare({ stockName, verdict = "View report", tagline = "AI-generated analysis", className }: Props) {
  const message = `📊 Ask The Expert Analysis for ${stockName}:\nVerdict — ${verdict}. ${tagline}.\nGet your own free stock analysis at https://stockera.in`;
  const href = `https://wa.me/?text=${encodeURIComponent(message)}`;
  return (
    <Button asChild variant="outline" className={className}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="h-4 w-4 mr-2" /> Share on WhatsApp
      </a>
    </Button>
  );
}

export default WhatsAppShare;
