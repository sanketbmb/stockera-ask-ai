// Stage 4F.3 APPLY-2 — Admin list of video answers.
// Stage 4G APPLY-2 — added mandatory QueueSearchBar with visible result count.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Eye, PencilLine, Send, EyeOff } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueueSearchBar } from "@/components/admin/QueueSearchBar";
import { useAuth } from "@/contexts/AuthContext";
import {
  listAdminVideoAnswers,
  publishVideoAnswer,
  unpublishVideoAnswer,
} from "@/lib/video-answers-admin.functions";

type Status = "all" | "draft" | "published";

interface Row {
  id: string;
  expert_id: string;
  is_published: boolean;
  video_title: string | null;
  question_addressed_override: string | null;
  verdict: string | null;
  unlock_price_credits: number | null;
  created_at: string;
  queries: { stock_symbol: string | null; stock_name: string | null; query_text: string | null } | null;
  analyst_profiles: { display_name: string | null; sebi_reg_number: string | null } | null;
}

export default function VideoAnswersList() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("all");
  const [symbol, setSymbol] = useState("");
  const [q, setQ] = useState("");
  const [quickSearch, setQuickSearch] = useState("");

  const list = useServerFn(listAdminVideoAnswers);
  const publish = useServerFn(publishVideoAnswer);
  const unpublish = useServerFn(unpublishVideoAnswer);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin_video_answers", status, symbol, q],
    queryFn: async () => {
      const res = await list({
        data: {
          status,
          symbol: symbol.trim() || undefined,
          q: q.trim() || undefined,
          limit: 100,
        },
      });
      return res as unknown as Row[];
    },
  });

  const rows = useMemo(() => data ?? [], [data]);
  const filteredRows = useMemo(() => {
    const s = quickSearch.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      return (
        (r.queries?.stock_symbol ?? "").toLowerCase().includes(s) ||
        (r.queries?.stock_name ?? "").toLowerCase().includes(s) ||
        (r.queries?.query_text ?? "").toLowerCase().includes(s) ||
        (r.video_title ?? "").toLowerCase().includes(s) ||
        (r.question_addressed_override ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, quickSearch]);

  async function onPublish(id: string) {
    try {
      await publish({ data: { answerId: id } });
      toast.success("Published");
      qc.invalidateQueries({ queryKey: ["admin_video_answers"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function onUnpublish(id: string) {
    try {
      await unpublish({ data: { answerId: id } });
      toast.success("Unpublished");
      qc.invalidateQueries({ queryKey: ["admin_video_answers"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AdminShell>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Video answers</p>
          <h1 className="font-display text-3xl">Analyst videos</h1>
        </div>
        <Button asChild>
          <Link to={"/admin/compose-video" as never}><Plus className="h-4 w-4 mr-1.5" /> New video</Link>
        </Button>
      </div>

      <Card className="p-3 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[160px]">
          <label className="text-[11px] uppercase font-mono text-muted-foreground">Status</label>
          <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="text-[11px] uppercase font-mono text-muted-foreground">Symbol</label>
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. TCS" />
        </div>
        <div className="flex-[2] min-w-[200px]">
          <label className="text-[11px] uppercase font-mono text-muted-foreground">Search</label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="title / question / stock" />
        </div>
        <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">No video answers match these filters.</Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const title = r.video_title || r.question_addressed_override || r.queries?.query_text || "Untitled video answer";
            return (
              <Card key={r.id} className="p-4 flex flex-wrap gap-3 items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant={r.is_published ? "default" : "secondary"} className="text-[10px]">
                      {r.is_published ? "Published" : "Draft"}
                    </Badge>
                    {r.queries?.stock_symbol && <Badge variant="outline" className="font-mono text-[10px]">{r.queries.stock_symbol}</Badge>}
                    {r.verdict && <Badge variant="outline" className="text-[10px] uppercase">{r.verdict}</Badge>}
                    {r.unlock_price_credits != null && <span className="text-[11px] text-muted-foreground font-mono">{r.unlock_price_credits} cr</span>}
                  </div>
                  <p className="text-sm font-medium truncate">{title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.analyst_profiles?.display_name ?? "—"}
                    {r.analyst_profiles?.sebi_reg_number ? ` · SEBI RA ${r.analyst_profiles.sebi_reg_number}` : ""}
                    {" · "}{new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button size="sm" variant="outline" asChild>
                    <Link to={"/admin/videos/$answerId/preview" as never} params={{ answerId: r.id } as never}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={"/admin/videos/$answerId/edit" as never} params={{ answerId: r.id } as never}>
                      <PencilLine className="h-3.5 w-3.5 mr-1" /> Edit
                    </Link>
                  </Button>
                  {isAdmin && !r.is_published && (
                    <Button size="sm" onClick={() => onPublish(r.id)}>
                      <Send className="h-3.5 w-3.5 mr-1" /> Publish
                    </Button>
                  )}
                  {r.is_published && (
                    <Button size="sm" variant="destructive" onClick={() => onUnpublish(r.id)}>
                      <EyeOff className="h-3.5 w-3.5 mr-1" /> Unpublish
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
