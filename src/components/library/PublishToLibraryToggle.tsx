import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Globe, Lock, EyeOff, Archive } from "lucide-react";
import { FIRM } from "@/lib/firm-details";

interface Props {
  queryId: string;
  compact?: boolean;
}

type QueryRow = {
  user_id: string;
  is_public_library: boolean | null;
  public_consent_anonymized: boolean | null;
  public_consent_at: string | null;
  library_tombstoned_at: string | null;
  stock_name: string | null;
  query_text: string | null;
};

type AnswerRow = { id: string; verdict: string | null } | null;

const COMPLIANCE_NOTE =
  `Reports are personal analyst responses published with your consent. ` +
  `They are research, not personalized advice for others. ${FIRM.legalName} · SEBI RA ${FIRM.sebiRegNumber}.`;

export function PublishToLibraryToggle({ queryId, compact = false }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [publishOpen, setPublishOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [anonChecked, setAnonChecked] = useState(false);
  const [pubAck, setPubAck] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["library-consent", queryId],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: q }, { data: a }] = await Promise.all([
        supabase
          .from("queries")
          .select(
            "user_id, is_public_library, public_consent_anonymized, public_consent_at, library_tombstoned_at, stock_name, query_text",
          )
          .eq("id", queryId)
          .single(),
        supabase
          .from("answers")
          .select("id, verdict")
          .eq("query_id", queryId)
          .eq("is_published", true)
          .eq("answer_type", "video")
          .not("video_url", "is", null)
          .maybeSingle(),
      ]);
      return { q: q as QueryRow | null, a: a as AnswerRow };
    },
  });

  const mutate = useMutation({
    mutationFn: async (patch: Partial<{
      is_public_library: boolean;
      public_consent_anonymized: boolean;
      public_consent_at: string;
    }>) => {
      const { error } = await supabase.from("queries").update(patch).eq("id", queryId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["library-consent", queryId] }),
  });

  if (!user || isLoading || !data?.q) return null;
  const q = data.q;
  // Owner-only.
  if (q.user_id !== user.id) return null;
  const answer = data.a;

  const isTombstoned = !!q.library_tombstoned_at;
  const isPublic = !!q.is_public_library;
  const isAnon = !!q.public_consent_anonymized;
  const hasAnswer = !!answer;

  // STATE D — tombstoned
  if (isTombstoned) {
    const when = q.library_tombstoned_at
      ? new Date(q.library_tombstoned_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : "";
    const pill = (
      <Badge variant="outline" className="gap-1 text-[11px]">
        <Archive className="h-3 w-3" /> Previously public · reverted on {when}
      </Badge>
    );
    return compact ? pill : <Section>{pill}</Section>;
  }

  // STATE A — not yet answered
  if (!hasAnswer) {
    if (compact) {
      return (
        <Badge variant="outline" className="gap-1 text-[11px]" title="Available after your analyst answer is delivered">
          <Lock className="h-3 w-3" /> Private
        </Badge>
      );
    }
    return (
      <Section>
        <p className="text-sm text-muted-foreground">
          You can publish this report to the public library after your analyst answer is delivered.
        </p>
      </Section>
    );
  }

  // STATE C — public
  if (isPublic) {
    const when = q.public_consent_at
      ? new Date(q.public_consent_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : "";
    const pill = (
      <Badge className="gap-1 text-[11px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
        <Globe className="h-3 w-3" /> Public in Library{isAnon ? " · Anonymous" : ""}
      </Badge>
    );
    if (compact) return pill;
    return (
      <Section>
        <div className="flex items-center gap-2 flex-wrap">
          {pill}
          {when && <span className="text-[11px] text-muted-foreground">Published {when}</span>}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => mutate.mutate({ public_consent_anonymized: !isAnon })}
            disabled={mutate.isPending}
          >
            <EyeOff className="h-3.5 w-3.5 mr-1.5" />
            {isAnon ? "Show my name" : "Make anonymous"}
          </Button>
          <AlertDialog open={revertOpen} onOpenChange={setRevertOpen}>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">Revert to private</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revert to private?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your report will be removed from the public library. The URL will remain
                  but the content will be hidden. This is reversible only within 30 days.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    mutate.mutate(
                      { is_public_library: false },
                      { onSuccess: () => toast.success("Reverted to private.") },
                    );
                    setRevertOpen(false);
                  }}
                >
                  Revert
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <ComplianceFootnote />
      </Section>
    );
  }

  // STATE B — delivered, not public
  const previewTitle = anonChecked
    ? `Question about ${q.stock_name ?? "a stock"}`
    : (q.query_text ?? q.stock_name ?? "").slice(0, 140);

  const confirmDialog = (
    <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish this report?</AlertDialogTitle>
          <AlertDialogDescription>
            The following will go live in the Stockera Research Library:
            <span className="block mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
              {previewTitle}
            </span>
            <span className="mt-2 block text-xs">
              {anonChecked ? "Your name will be hidden." : "Your name will be visible."}{" "}
              You can revert this anytime.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              mutate.mutate(
                {
                  is_public_library: true,
                  public_consent_anonymized: anonChecked,
                  public_consent_at: new Date().toISOString(),
                },
                {
                  onSuccess: () => toast.success("Published to library. You can revert anytime."),
                  onError: (e) => toast.error((e as Error).message),
                },
              );
              setPublishOpen(false);
            }}
          >
            Publish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (compact) {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => setPublishOpen(true)}>
          Publish ▸
        </Button>
        {confirmDialog}
      </>
    );
  }

  return (
    <Section>
      <h3 className="font-display text-lg">Make this report public</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Help other Indian investors learn from your question. Your name will be visible
        unless you choose anonymous. You can revert this anytime.
      </p>
      <div className="mt-4 space-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={pubAck} onCheckedChange={(v) => setPubAck(!!v)} />
          Publish to the Stockera Research Library
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={anonChecked} onCheckedChange={(v) => setAnonChecked(!!v)} />
          Hide my name (publish anonymously)
        </label>
      </div>
      <Button
        className="mt-4"
        disabled={!pubAck || mutate.isPending}
        onClick={() => setPublishOpen(true)}
      >
        Publish to Library
      </Button>
      {confirmDialog}
      <ComplianceFootnote />
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      {children}
    </div>
  );
}

function ComplianceFootnote() {
  return (
    <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">{COMPLIANCE_NOTE}</p>
  );
}
