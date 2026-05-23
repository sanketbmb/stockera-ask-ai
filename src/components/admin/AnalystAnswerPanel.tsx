import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { VERDICT_OPTIONS } from "@/lib/verdict";
import { cn } from "@/lib/utils";
import { AnalystReportUploader, type UploadedReport } from "@/components/admin/AnalystReportUploader";

interface Props {
  queryId: string;
  stockName: string;
}

export function AnalystAnswerPanel({ queryId, stockName }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [verdict, setVerdict] = useState<string>("");
  const [body, setBody] = useState("");
  const [keyLevel, setKeyLevel] = useState("");
  const [horizon, setHorizon] = useState<string>("");
  const [riskNote, setRiskNote] = useState("");
  const [report, setReport] = useState<UploadedReport | null>(null);
  const [agreed, setAgreed] = useState(false);

  const { data: existing } = useQuery({
    queryKey: ["analyst_draft", queryId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("answers")
        .select("*")
        .eq("query_id", queryId)
        .eq("expert_id", user!.id)
        .eq("answer_type", "text")
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (existing) {
      setVerdict(existing.verdict ?? "");
      setBody(existing.body ?? "");
      setKeyLevel(existing.key_level ?? "");
      setHorizon(existing.time_horizon ?? "");
      setRiskNote(existing.risk_note ?? "");
      if (existing.is_published) setAgreed(true);
    }
  }, [existing]);

  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const wordsOk = words >= 150 && words <= 800;
  const canPublish = wordsOk && !!verdict && agreed;

  const save = useMutation({
    mutationFn: async ({ publish }: { publish: boolean }) => {
      if (!user) throw new Error("Not signed in");
      const payload = {
        query_id: queryId,
        expert_id: user.id,
        answer_type: "text" as const,
        body,
        verdict: verdict || null,
        key_level: keyLevel || null,
        time_horizon: horizon || null,
        risk_note: riskNote || null,
        is_published: publish,
      };
      const { error } = await supabase
        .from("answers")
        .upsert(payload, { onConflict: "query_id,expert_id,answer_type" });
      if (error) throw error;

      if (publish) {
        // Flip query status to expert_answered (no-op if already)
        const { data: q } = await supabase.from("queries").select("status").eq("id", queryId).single();
        if (q && q.status !== "expert_answered") {
          await supabase.from("queries").update({ status: "expert_answered" }).eq("id", queryId);
        }
        await supabase.from("audit_events").insert({
          event_type: "answer_published",
          actor_id: user.id,
          resource_type: "answer",
          resource_id: null,
          payload: { answer_type: "text", query_id: queryId, verdict },
        });
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.publish ? "Answer published to investor" : "Draft saved");
      qc.invalidateQueries({ queryKey: ["analyst_draft", queryId] });
      qc.invalidateQueries({ queryKey: ["analyst_queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const published = !!existing?.is_published;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4 mt-3">
      {published && (
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          ✓ This text answer is published. Edits will update what the investor sees.
        </div>
      )}

      <div>
        <Label className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Verdict</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {VERDICT_OPTIONS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setVerdict(v.value)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold border transition",
                verdict === v.value ? v.color : "bg-background border-border text-muted-foreground hover:border-primary",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Your Analysis</Label>
          <span className={cn("text-[11px] font-mono", wordsOk ? "text-emerald-600" : "text-red-600")}>{words} / 150–800 words</span>
        </div>
        <Textarea
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Address the investor's specific situation. Mention ${stockName}, their buy price context, key observations, and what factors they should monitor. Speak in plain language.`}
          className="mt-2 text-sm"
        />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Key level to watch</Label>
          <Input value={keyLevel} onChange={(e) => setKeyLevel(e.target.value.slice(0, 80))} placeholder="e.g. Monitor ₹62" />
        </div>
        <div>
          <Label className="text-xs">Time horizon</Label>
          <Select value={horizon} onValueChange={setHorizon}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Short term (<3 mo)">Short term (&lt;3 mo)</SelectItem>
              <SelectItem value="Medium term (3-12 mo)">Medium term (3-12 mo)</SelectItem>
              <SelectItem value="Long term (1+ year)">Long term (1+ year)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Risk note</Label>
          <Input value={riskNote} onChange={(e) => setRiskNote(e.target.value.slice(0, 120))} placeholder="Short risk caveat" />
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
        <span>
          I confirm this is my personal educational analysis based on my SEBI research analyst registration.
          It does not constitute investment advice for any specific person.
        </span>
      </label>

      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={() => save.mutate({ publish: false })} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1.5" /> Save Draft</>}
        </Button>
        <Button
          size="sm"
          onClick={() => save.mutate({ publish: true })}
          disabled={!canPublish || save.isPending}
          className="bg-gradient-to-r from-primary to-accent text-primary-foreground"
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-1.5" /> {published ? "Update Published" : "Publish Answer"}</>}
        </Button>
      </div>
    </div>
  );
}
