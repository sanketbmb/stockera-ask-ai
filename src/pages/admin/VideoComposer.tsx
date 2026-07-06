// Stage 4G APPLY-2 — Unified RA video composer (DRAFT-ONLY).
//
// This page NEVER publishes. Publish UI is intentionally omitted. No unlock,
// wallet, entitlement, discover, or curated code is touched here.
import { useEffect, useMemo, useState } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, Loader2, Info } from "lucide-react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { CategoryPicker, type Category } from "@/components/admin/video-composer/CategoryPicker";
import { InputModeTabs, type InputMode } from "@/components/admin/video-composer/InputModeTabs";
import { FileUploadPane, type UploadResult } from "@/components/admin/video-composer/FileUploadPane";
import { RecordPane } from "@/components/admin/video-composer/RecordPane";
import { ExternalLinkPane } from "@/components/admin/video-composer/ExternalLinkPane";
import { ThumbnailField } from "@/components/admin/video-composer/ThumbnailField";
import { LinkedQueryHeader } from "@/components/admin/video-composer/LinkedQueryHeader";
import { SymbolPicker, type SymbolPick } from "@/components/admin/video-answers/SymbolPicker";
import { AnalystSelector } from "@/components/admin/video-answers/AnalystSelector";

import { saveVideoComposerDraft } from "@/lib/video-composer.functions";
import { parseYoutubeId } from "@/lib/youtube-id";

export default function VideoComposer() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/admin/compose-video" }) as { queryId?: string; answerId?: string };
  const queryId = search.queryId;

  // Load prefill query when coming from a query card
  const { data: prefillQuery } = useQuery({
    queryKey: ["composer_prefill_query", queryId],
    enabled: !!queryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("queries")
        .select("id, stock_symbol, stock_name, query_text, query_type, buy_price, current_price")
        .eq("id", queryId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Form state
  const [category, setCategory] = useState<Category>("stock_specific");
  const [mode, setMode] = useState<InputMode>("upload");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [symbol, setSymbol] = useState<SymbolPick | null>(null);
  const [priceCredits, setPriceCredits] = useState<number>(499);
  const [expertId, setExpertId] = useState<string | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [customThumbPath, setCustomThumbPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Prefill from query
  useEffect(() => {
    if (!prefillQuery) return;
    setCategory("stock_specific");
    if (prefillQuery.stock_symbol && prefillQuery.stock_name) {
      setSymbol({ symbol: prefillQuery.stock_symbol, name: prefillQuery.stock_name });
    }
    if (!question) setQuestion(prefillQuery.query_text);
    if (!title) setTitle(`Answer: ${prefillQuery.stock_name ?? prefillQuery.stock_symbol ?? "query"}`.slice(0, 140));
  }, [prefillQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Analyst self-lock
  const lockedTo = useMemo(() => (isAdmin ? null : user?.id ?? null), [isAdmin, user]);
  useEffect(() => { if (lockedTo && !expertId) setExpertId(lockedTo); }, [lockedTo, expertId]);

  const save = useServerFn(saveVideoComposerDraft);

  const externalIsYouTube = mode === "external" && !!parseYoutubeId(externalUrl);
  const externalYouTubeBlocked = category === "stock_specific" && externalIsYouTube;

  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (!title.trim()) errs.push("Title is required");
    if (description.trim().length < 40) errs.push("Description must be at least 40 characters");
    if (description.trim().length > 400) errs.push("Description must be at most 400 characters");
    if (!expertId) errs.push("Analyst is required");
    if (category === "stock_specific") {
      if (!symbol) errs.push("Stock is required for stock_specific");
      if (!priceCredits || priceCredits < 49 || priceCredits > 999) errs.push("Price must be between 49 and 999");
    }
    if (mode === "upload" || mode === "record") {
      if (!uploadResult) errs.push(mode === "upload" ? "Upload a video file" : "Record and attach a clip");
    }
    if (mode === "external") {
      if (!externalUrl.trim()) errs.push("Paste an external video URL");
      if (externalYouTubeBlocked) errs.push("YouTube not allowed for stock_specific");
    }
    return errs;
  }, [title, description, expertId, category, symbol, priceCredits, mode, uploadResult, externalUrl, externalYouTubeBlocked]);

  const canSave = validationErrors.length === 0 && !busy;

  const autoPreviewUrl =
    mode === "external" && parseYoutubeId(externalUrl)
      ? `https://i.ytimg.com/vi/${parseYoutubeId(externalUrl)}/hqdefault.jpg`
      : uploadResult?.previewUrl ?? null;

  async function handleSave() {
    if (!canSave || !expertId) return;
    setBusy(true);
    try {
      const source =
        mode === "external"
          ? { kind: "external" as const, externalUrl: externalUrl.trim() }
          : {
              kind: mode,
              storagePath: uploadResult!.storagePath,
              thumbnailStoragePath: uploadResult!.thumbnailStoragePath,
              durationSec: uploadResult!.durationSec ?? undefined,
            };

      const res = await save({
        data: {
          category,
          title: title.trim(),
          description: description.trim(),
          questionAddressed: question.trim() || undefined,
          expertId,
          source,
          stock: category === "stock_specific" && symbol
            ? { symbol: symbol.symbol, stockName: symbol.name }
            : undefined,
          priceCredits: category === "stock_specific" ? priceCredits : undefined,
          queryId: queryId,
          customThumbnailPath: customThumbPath,
        },
      });
      toast.success("Draft saved");
      // Route to admin videos list; edit routes are not rewired in APPLY-2.
      navigate({ to: "/admin/videos" as never, search: { savedAnswerId: res.answerId } as never });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <LinkedQueryHeader query={prefillQuery ?? null} />

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">RA composer</p>
          <h1 className="font-display text-3xl">Compose video answer</h1>
        </div>
        <Badge variant="secondary" className="text-[11px]">Draft only · publish disabled</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <CategoryPicker value={category} onChange={setCategory} />
          </Card>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold text-sm">Video source</h2>
            <InputModeTabs value={mode} onChange={setMode} />
            <div className="pt-2">
              {user && mode === "upload" && (
                <FileUploadPane userId={user.id} onUploaded={setUploadResult} uploaded={uploadResult} />
              )}
              {user && mode === "record" && (
                <RecordPane userId={user.id} onUploaded={setUploadResult} uploaded={uploadResult} />
              )}
              {mode === "external" && (
                <ExternalLinkPane value={externalUrl} onChange={setExternalUrl} category={category} />
              )}
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="font-semibold text-sm">Details</h2>
            <div className="space-y-2">
              <Label htmlFor="composer-title">Title *</Label>
              <Input id="composer-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="e.g. TCS Q3 review — hold or exit?" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="composer-desc">Description * ({description.length}/400)</Label>
              <Textarea
                id="composer-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={400}
                placeholder="40–400 chars. Shown before unlock."
              />
              <p className="text-[11px] text-muted-foreground">Minimum 40, maximum 400 characters.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="composer-q">Question addressed{category === "stock_specific" ? " *" : ""}</Label>
              <Textarea
                id="composer-q"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={category === "general" ? "Optional for general videos." : "What specific question does this video answer?"}
              />
            </div>
          </Card>

          {category === "stock_specific" && (
            <Card className="p-5 space-y-4">
              <h2 className="font-semibold text-sm">Stock &amp; price</h2>
              <SymbolPicker value={symbol} onChange={setSymbol} />
              <div className="space-y-2">
                <Label htmlFor="composer-price">Unlock price (credits) *</Label>
                <Input
                  id="composer-price"
                  type="number"
                  min={49}
                  max={999}
                  value={priceCredits}
                  onChange={(e) => setPriceCredits(Number(e.target.value) || 0)}
                />
                <p className="text-[11px] text-muted-foreground">Between 49 and 999 credits.</p>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <AnalystSelector value={expertId} onChange={setExpertId} lockedTo={lockedTo} />
          </Card>
          <Card className="p-5">
            {user && (
              <ThumbnailField
                userId={user.id}
                autoPreviewUrl={autoPreviewUrl}
                customPath={customThumbPath}
                onCustomChange={setCustomThumbPath}
              />
            )}
          </Card>

          <Card className="p-4">
            <p className="text-xs text-muted-foreground flex gap-2 items-start">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Draft only. Nothing is published to users. Preview, unlock and wallet flows are intentionally disabled in this build slice.
            </p>
          </Card>

          {validationErrors.length > 0 && (
            <Card className="p-3 border-amber-500/40 bg-amber-500/5">
              <p className="text-[11px] font-medium mb-1 text-amber-700 dark:text-amber-300">Fix before saving:</p>
              <ul className="text-[11px] text-amber-700 dark:text-amber-300 list-disc pl-4 space-y-0.5">
                {validationErrors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </Card>
          )}

          <Button className="w-full" onClick={handleSave} disabled={!canSave} size="lg">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save draft
          </Button>
        </div>
      </div>
    </AdminShell>
  );
}
