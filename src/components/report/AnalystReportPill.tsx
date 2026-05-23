import { FileText, Download, ExternalLink, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  reportUrl: string | null | undefined;
  filename?: string | null;
  mime?: string | null;
  sizeBytes?: number | null;
  label?: string | null;
  compact?: boolean;
}

function formatBytes(b?: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function AnalystReportPill({ reportUrl, filename, mime, sizeBytes, label, compact }: Props) {
  if (!reportUrl) return null;
  const displayName = filename || "analyst-report";
  const ext = (mime ?? displayName.split(".").pop() ?? "").toLowerCase();

  return (
    <div className={`rounded-lg border border-accent/40 bg-accent/5 ${compact ? "p-2.5" : "p-3"}`}>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Gift className="h-3 w-3 text-accent" />
          <span className="text-[10px] uppercase tracking-wider font-mono text-accent font-semibold">
            {label || "Analyst Report"}
          </span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
            giveaway · free
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="h-9 w-9 rounded-md bg-background border border-border flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{displayName}</p>
            <p className="text-[10px] text-muted-foreground font-mono uppercase">
              {ext.includes("/") ? ext.split("/")[1] : ext} {sizeBytes ? `· ${formatBytes(sizeBytes)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button asChild size="sm" variant="outline" className="h-8">
            <a href={reportUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3 w-3 mr-1" /> View
            </a>
          </Button>
          <Button asChild size="sm" className="h-8 bg-gradient-to-r from-primary to-accent text-primary-foreground">
            <a href={reportUrl} download={displayName}>
              <Download className="h-3 w-3 mr-1" /> Download
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
