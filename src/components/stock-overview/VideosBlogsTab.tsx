import { Card } from "@/components/ui/card";
import { Video, FileText } from "lucide-react";
import type { StockOverview } from "./types";

interface Props { data: StockOverview }

export function VideosBlogsTab({ data }: Props) {
  return (
    <Card className="p-8 text-center">
      <div className="flex items-center justify-center gap-3 text-muted-foreground">
        <Video className="h-6 w-6" aria-hidden="true" />
        <FileText className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Videos and analyst blogs on {data.symbol} — coming soon.
      </p>
    </Card>
  );
}

export default VideosBlogsTab;
