import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const VERDICTS = ["BUY", "SELL", "HOLD", "AVERAGE", "WAIT", "PARTIAL_EXIT"] as const;

const TEMPLATES: Record<string, string> = {
  buy_or_sell: "Verdict: \nReasoning: \n- \n- \nKey levels:\n• Stop Loss: ₹\n• Target 1: ₹\n• Target 2: ₹\nRisk note: \nSEBI disclaimer: Educational, not investment advice.",
  holding: "If you're holding:\n- \n- \nRecommended action: \nLevels to watch:\n• Stop Loss: ₹\n• Add zone: ₹\nSEBI disclaimer: Educational, not investment advice.",
  averaging: "On averaging this position:\n- \n- \nAveraging zone: ₹\nNew SL after averaging: ₹\nSEBI disclaimer: Educational, not investment advice.",
  fresh_entry: "Fresh entry view:\n- \n- \nEntry zone: ₹\nStop Loss: ₹\nTarget: ₹\nSEBI disclaimer: Educational, not investment advice.",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  queryId: string;
  queryType: string | null;
  stockName: string;
}

export function TextAnswerModal({ open, onOpenChange, queryId, queryType, stockName }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [verdict, setVerdict] = useState<string>("BUY");
  const [stopLoss, setStopLoss] = useState("");
  const [target, setTarget] = useState("");
  const initialBody = useMemo(() => TEMPLATES[queryType ?? ""] ?? TEMPLATES.buy_or_sell, [queryType]);
  const [body, setBody] = useState(initialBody);

  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const wordsOk = words >= 100 && words <= 600;

  const publish = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const finalBody = `Verdict: ${verdict}\n${body}\n\nStop Loss: ₹${stopLoss || "—"}\nTarget: ₹${target || "—"}`;
      const { error: ansErr } = await supabase.from("answers").insert({
        query_id: queryId,
        expert_id: user.id,
        answer_type: "text",
        body: finalBody,
        is_published: true,
      });
      if (ansErr) throw ansErr;
      const { error: qErr } = await supabase
        .from("queries")
        .update({ status: "expert_answered" })
        .eq("id", queryId);
      if (qErr) throw qErr;
    },
    onSuccess: () => {
      toast.success("Text answer published");
      qc.invalidateQueries({ queryKey: ["analyst_queue"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Text Answer · {stockName}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Verdict</Label>
            <Select value={verdict} onValueChange={setVerdict}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VERDICTS.map((v) => <SelectItem key={v} value={v}>{v.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Stop Loss (₹)</Label>
              <Input value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="245" />
            </div>
            <div className="space-y-1.5">
              <Label>Target (₹)</Label>
              <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="320" />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <Label>Answer body</Label>
            <span className={wordsOk ? "text-emerald-600" : "text-amber-600"}>{words} / 100–600 words</span>
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            className="font-mono text-xs"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => publish.mutate()}
            disabled={!wordsOk || publish.isPending}
            className="bg-gradient-to-r from-primary to-accent text-primary-foreground"
          >
            {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish Answer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
