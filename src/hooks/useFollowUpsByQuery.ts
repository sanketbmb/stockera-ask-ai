import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface FollowUpRow {
  id: string;
  query_id: string;
  parent_followup_id: string | null;
  thread_id: string | null;
  role: string;
  content: string | null;
  conversation_mode: string | null;
  created_at: string;
}

export function useFollowUpsByQuery(queryId: string | undefined, opts: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  const enabled = (opts.enabled ?? true) && !!queryId && !!user;

  const q = useQuery({
    queryKey: ["ai_followups", queryId, user?.id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_followups")
        .select("id, query_id, parent_followup_id, thread_id, role, content, conversation_mode, created_at")
        .eq("query_id", queryId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FollowUpRow[];
    },
    staleTime: 30_000,
  });

  return {
    data: q.data ?? [],
    count: q.data?.length ?? 0,
    isLoading: q.isLoading,
    error: q.error,
  };
}
