// Stage 4F.3 APPLY-2 — pick an existing user query for the chosen stock, or
// author a synthetic "video_seed" query. The synthetic query row is created
// server-side inside createVideoAnswerDraft; here we only capture the intent.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type QueryChoice =
  | { mode: "existing"; queryId: string }
  | { mode: "synthetic"; questionText: string };

interface Props {
  symbol: string | null;
  value: QueryChoice | null;
  onChange: (v: QueryChoice) => void;
  disabled?: boolean;
}

interface QueryRow {
  id: string;
  query_text: string;
  created_at: string;
}

export function QuerySelector({ symbol, value, onChange, disabled }: Props) {
  const mode = value?.mode ?? "existing";

  const { data: queries, isLoading } = useQuery({
    queryKey: ["admin_video_queries_for_symbol", symbol],
    enabled: !!symbol,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("queries")
        .select("id, query_text, created_at")
        .eq("stock_symbol", symbol!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as QueryRow[];
    },
  });

  return (
    <div className="space-y-3">
      <Label>Question addressed *</Label>
      <RadioGroup
        value={mode}
        onValueChange={(m) => {
          if (m === "existing") onChange({ mode: "existing", queryId: "" });
          else onChange({ mode: "synthetic", questionText: "" });
        }}
        className="flex gap-4"
      >
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="existing" disabled={disabled || !symbol} /> Existing user query
        </label>
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="synthetic" disabled={disabled} /> Create synthetic (video seed)
        </label>
      </RadioGroup>

      {mode === "existing" && (
        <div>
          <Select
            value={value?.mode === "existing" ? value.queryId || undefined : undefined}
            onValueChange={(id) => onChange({ mode: "existing", queryId: id })}
            disabled={disabled || !symbol || isLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder={!symbol ? "Pick a stock first" : isLoading ? "Loading…" : "Select a query"} />
            </SelectTrigger>
            <SelectContent>
              {(queries ?? []).map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  {q.query_text.slice(0, 90)}{q.query_text.length > 90 ? "…" : ""}
                </SelectItem>
              ))}
              {(queries ?? []).length === 0 && !isLoading && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No queries for this stock — create a synthetic one instead.
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {mode === "synthetic" && (
        <div className="space-y-1.5">
          <Textarea
            value={value?.mode === "synthetic" ? value.questionText : ""}
            onChange={(e) => onChange({ mode: "synthetic", questionText: e.target.value })}
            placeholder="e.g. Is TCS a buy after the Q3 results?"
            rows={3}
            maxLength={500}
            disabled={disabled}
          />
          <p className="text-[11px] text-muted-foreground">
            Seeds a system-owned query row so this video can be surfaced without a real user question.
          </p>
        </div>
      )}
    </div>
  );
}

export default QuerySelector;
