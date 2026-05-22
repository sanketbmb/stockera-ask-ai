import { useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Video } from "lucide-react";
import { VideoAnswerPaymentModal } from "./VideoAnswerPaymentModal";

interface Props extends Omit<ButtonProps, "onClick"> {
  queryId?: string | null;
  stockName?: string;
  children?: ReactNode;
}

export function BookAnalystVideoButton({ queryId, stockName, children, className, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        {...rest}
        className={className ?? "bg-gradient-to-r from-primary to-accent text-primary-foreground"}
        onClick={() => setOpen(true)}
      >
        {children ?? (
          <>
            <Video className="h-4 w-4 mr-2" /> Book Analyst Video — ₹100
          </>
        )}
      </Button>
      <VideoAnswerPaymentModal open={open} onOpenChange={setOpen} queryId={queryId ?? null} stockName={stockName} />
    </>
  );
}
