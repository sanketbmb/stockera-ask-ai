import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { Plus, ExternalLink } from "lucide-react";
import { listAdminCurated } from "@/lib/curated.functions";

export default function CuratedList() {
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [published, setPublished] = useState<"all" | "draft" | "published">("all");
  const listFn = useServerFn(listAdminCurated);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-curated", q, provider, category, published],
    queryFn: () =>
      listFn({
        data: {
          q: q.trim() || undefined,
          provider: provider === "all" ? undefined : provider,
          category: category === "all" ? undefined : (category as "general" | "stock_specific"),
          published,
          limit: 200,
        },
      }),
  });

  const rows = data ?? [];
  const providers = useMemo(() => Array.from(new Set(rows.map((r) => r.source_provider))).sort(), [rows]);

  return (
    <AdminShell>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Curated media</p>
          <h1 className="font-display text-3xl">Curated library</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Editorially curated third-party content. Free · attribution-first · no re-hosting.
          </p>
        </div>
        <Button asChild size="lg" className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
          <Link to={"/admin/curated/new" as never}><Plus className="h-4 w-4 mr-1.5" /> New curated item</Link>
        </Button>
      </div>

      <Card className="p-4 mb-4 grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <Input
            placeholder="Search title, description, or URL…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger><SelectValue placeholder="Provider" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            {providers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any category</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="stock_specific">Stock-specific</SelectItem>
            </SelectContent>
          </Select>
          <Select value={published} onValueChange={(v) => setPublished(v as "all" | "draft" | "published")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="md:col-span-4 text-[11px] text-muted-foreground">
          {isLoading ? "Loading…" : `${rows.length} matching item${rows.length === 1 ? "" : "s"}`}
        </p>
      </Card>

      <div className="grid gap-3">
        {rows.map((r) => (
          <Card key={r.id} className="p-4 flex flex-wrap gap-3 items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display text-lg text-accent truncate">{r.title}</span>
                {r.is_published ? (
                  <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700">Published</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Draft</Badge>
                )}
                <Badge variant="outline" className="text-[10px]">{r.source_provider}</Badge>
                <Badge variant="outline" className="text-[10px]">{r.embed_kind}</Badge>
                <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
              </div>
              <p className="text-[11px] font-mono text-muted-foreground truncate mt-1">
                <a href={r.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:underline">
                  {r.source_url} <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Updated {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })} · views {r.view_count ?? 0} · CTs {r.click_through_count ?? 0}
              </p>
            </div>
            <div className="flex gap-2">
              {r.is_published ? (
                <Button asChild size="sm" variant="outline">
                  <a href={`/curated/${r.id}`} target="_blank" rel="noopener">View</a>
                </Button>
              ) : null}
              <Button asChild size="sm">
                <Link to={"/admin/curated/$itemId/edit" as never} params={{ itemId: r.id } as never}>Edit</Link>
              </Button>
            </div>
          </Card>
        ))}
        {!isLoading && rows.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">No curated items match.</Card>
        ) : null}
      </div>
    </AdminShell>
  );
}
