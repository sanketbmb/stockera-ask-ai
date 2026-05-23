import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileText, Upload, X, Loader2, Gift, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const MAX = 15 * 1024 * 1024;
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg";

export interface UploadedReport {
  report_url: string;
  report_filename: string;
  report_mime: string;
  report_size_bytes: number;
}

interface Props {
  queryId: string;
  existing?: {
    report_url?: string | null;
    report_filename?: string | null;
    report_size_bytes?: number | null;
  } | null;
  onChange: (r: UploadedReport | null) => void;
}

function fmt(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function AnalystReportUploader({ queryId, existing, onChange }: Props) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedReport | null>(
    existing?.report_url
      ? {
          report_url: existing.report_url,
          report_filename: existing.report_filename ?? "report",
          report_mime: "",
          report_size_bytes: existing.report_size_bytes ?? 0,
        }
      : null,
  );

  const handle = async (file: File | null) => {
    if (!file || !user) return;
    if (file.size > MAX) {
      toast.error("File too large — max 15MB");
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${queryId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("analyst-reports")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("analyst-reports").getPublicUrl(path);
      const result: UploadedReport = {
        report_url: pub.publicUrl,
        report_filename: file.name,
        report_mime: file.type || "application/octet-stream",
        report_size_bytes: file.size,
      };
      setUploaded(result);
      onChange(result);
      toast.success("Report attached");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const remove = () => {
    setUploaded(null);
    onChange(null);
  };

  return (
    <div className="rounded-lg border border-dashed border-accent/40 bg-accent/5 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Gift className="h-3.5 w-3.5 text-accent" />
        <Label className="text-xs uppercase tracking-wider font-mono text-accent">
          Analyst Report · giveaway (optional)
        </Label>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Attach a free downloadable file (PDF / DOC / XLS / image · max 15 MB) that the investor can view and download.
      </p>

      {uploaded ? (
        <div className="flex items-center gap-2 rounded-md bg-background border border-border p-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{uploaded.report_filename}</p>
            {uploaded.report_size_bytes > 0 && (
              <p className="text-[10px] text-muted-foreground font-mono">{fmt(uploaded.report_size_bytes)}</p>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={remove} className="h-7 w-7 p-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <label
          htmlFor={`report-file-${queryId}`}
          className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 cursor-pointer hover:border-accent transition-colors"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">
            {uploading ? "Uploading…" : "Choose a file to attach"}
          </span>
          <FileText className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
          <input
            id={`report-file-${queryId}`}
            type="file"
            accept={ACCEPT}
            className="hidden"
            disabled={uploading}
            onChange={(e) => handle(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
    </div>
  );
}
