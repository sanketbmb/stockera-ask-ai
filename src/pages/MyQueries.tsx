import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { QueryHistoryCard, type QueryHistoryItem } from "@/components/query/QueryHistoryCard";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "ai_answered", label: "AI Answered" },
  { id: "expert_answered", label: "Expert Answered" },
];

export default function MyQueriesPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["my-queries", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: queries } = await supabase
        .from("queries")
        .select("id, stock_name, stock_symbol, query_type, query_text, status, ai_report, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (!queries?.length) return [];
      const ids = queries.map((q) => q.id);
      const { data: answers } = await supabase
        .from("answers")
        .select("id, query_id, answer_type, body, video_url, video_thumbnail, duration_seconds, created_at, expert_id, verdict, key_level, time_horizon, risk_note, is_published, report_url, report_filename, report_mime, report_size_bytes, report_label")
        .in("query_id", ids)
        .eq("is_published", true);
      const byQuery = new Map<string, typeof answers>();
      (answers ?? []).forEach((a) => {
        const list = byQuery.get(a.query_id) ?? [];
        list.push(a);
        byQuery.set(a.query_id, list);
      });
      return queries.map((q) => ({ ...q, answers: byQuery.get(q.id) ?? [] })) as QueryHistoryItem[];
    },
  });

  const filtered = filter === "all" ? data : data.filter((q) => q.status === filter);

  return (
    <AppShell title="My Queries">
      <Tabs value={filter} onValueChange={setFilter} className="mb-6">
        <TabsList>
          {FILTERS.map((f) => <TabsTrigger key={f.id} value={f.id}>{f.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="font-display text-xl mt-3">No queries here yet</p>
          <p className="text-muted-foreground text-sm mt-1">Ask your first stock question and get instant AI analysis.</p>
          <Button asChild className="mt-4 bg-gradient-to-r from-primary to-accent text-primary-foreground">
            <Link to="/post-query">Ask your first question →</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => <QueryHistoryCard key={q.id} item={q} />)}
        </div>
      )}
    </AppShell>
  );
}
