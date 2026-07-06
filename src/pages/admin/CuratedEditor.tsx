import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { CuratedEditorForm, emptyForm, type CuratedFormState } from "@/components/admin/curated/CuratedEditorForm";
import type { OgPreview } from "@/components/admin/curated/OgScrapePreview";
import {
  loadCuratedForEdit,
  saveCuratedDraft,
  scrapeOgForUrl,
  publishCuratedItem,
  unpublishCuratedItem,
  deleteCuratedItem,
} from "@/lib/curated.functions";
import { resolveStockBySymbol } from "@/lib/canonical-stock";
import { useAuth } from "@/contexts/AuthContext";

export default function CuratedEditor({ itemId }: { itemId?: string }) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [form, setForm] = useState<CuratedFormState>(emptyForm());
  const [preview, setPreview] = useState<OgPreview | null>(null);
  const [scraping, setScraping] = useState(false);
  const [stockLookupLoading, setStockLookupLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(false);
  const [loaded, setLoaded] = useState(!itemId);

  const loadFn = useServerFn(loadCuratedForEdit);
  const saveFn = useServerFn(saveCuratedDraft);
  const scrapeFn = useServerFn(scrapeOgForUrl);
  const pubFn = useServerFn(publishCuratedItem);
  const unpubFn = useServerFn(unpublishCuratedItem);
  const delFn = useServerFn(deleteCuratedItem);

  useEffect(() => {
    if (!itemId) return;
    (async () => {
      try {
        const row = await loadFn({ data: { id: itemId } });
        const sm = (row as unknown as { stock_master?: { symbol?: string } }).stock_master;
        setForm({
          id: row.id,
          source_url: row.source_url ?? "",
          source_provider: row.source_provider ?? "",
          embed_kind: (row.embed_kind as "embed" | "link_out") ?? "link_out",
          title: row.title ?? "",
          description: row.description ?? "",
          custom_thumbnail_url: row.custom_thumbnail_url ?? "",
          tags: (row.tags ?? []).join(", "),
          sector: row.sector ?? "",
          category: (row.category as "general" | "stock_specific") ?? "general",
          stock_symbol: sm?.symbol ?? "",
          stock_master_id: row.stock_master_id ?? "",
          og_scrape_meta: (row.og_scrape_meta as Record<string, unknown> | null) ?? null,
        });
        setPublished(!!row.is_published);
        setLoaded(true);
      } catch (e) {
        toast.error((e as Error).message);
      }
    })();
  }, [itemId, loadFn]);

  const onScrape = async () => {
    setScraping(true);
    try {
      const res = await scrapeFn({ data: { url: form.source_url.trim() } });
      const p: OgPreview = {
        ok: res.ok,
        provider: res.provider,
        suggested_embed_kind: res.suggested_embed_kind,
        title: res.title,
        description: res.description,
        image_url: res.image_url,
        site_name: res.site_name,
      };
      setPreview(p);
      setForm((prev) => ({
        ...prev,
        source_provider: prev.source_provider || res.provider,
        embed_kind: prev.embed_kind ?? res.suggested_embed_kind,
        title: prev.title || (res.title ?? ""),
        description: prev.description || (res.description ?? ""),
        custom_thumbnail_url: prev.custom_thumbnail_url || (res.image_url ?? ""),
        og_scrape_meta: res.raw as Record<string, unknown>,
      }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setScraping(false);
    }
  };

  const onLookupStock = async (symbol: string) => {
    setStockLookupLoading(true);
    try {
      const s = await resolveStockBySymbol(symbol);
      return s ? { id: s.id, company_name: s.company_name } : null;
    } finally {
      setStockLookupLoading(false);
    }
  };

  const buildPayload = () => ({
    id: form.id,
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    source_url: form.source_url.trim(),
    source_provider: form.source_provider.trim().toLowerCase(),
    embed_kind: form.embed_kind,
    custom_thumbnail_url: form.custom_thumbnail_url.trim() || null,
    tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    sector: form.sector.trim() || null,
    stock_master_id: form.category === "stock_specific" ? form.stock_master_id || null : null,
    category: form.category,
    og_scrape_meta: form.og_scrape_meta,
  });

  const onSave = async () => {
    setSaving(true);
    try {
      const res = await saveFn({ data: buildPayload() as never });
      toast.success(form.id ? "Draft updated" : "Draft saved");
      if (!form.id) {
        setForm((f) => ({ ...f, id: res.id }));
        navigate({ to: "/admin/curated/$itemId/edit" as never, params: { itemId: res.id } as never, replace: true });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onPublish = async () => {
    if (!form.id) { toast.error("Save the draft first"); return; }
    try {
      await pubFn({ data: { id: form.id } });
      setPublished(true);
      toast.success("Published");
    } catch (e) { toast.error((e as Error).message); }
  };
  const onUnpublish = async () => {
    if (!form.id) return;
    try { await unpubFn({ data: { id: form.id } }); setPublished(false); toast.success("Unpublished"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const onDelete = async () => {
    if (!form.id) return;
    if (!confirm("Delete this curated item permanently?")) return;
    try { await delFn({ data: { id: form.id } }); toast.success("Deleted"); navigate({ to: "/admin/curated" as never }); }
    catch (e) { toast.error((e as Error).message); }
  };

  const canPublish = useMemo(
    () => isAdmin && !!form.title.trim() && !!form.source_url.trim() && !!form.source_provider && !!form.embed_kind,
    [isAdmin, form],
  );

  if (!loaded) return <AdminShell><p className="p-6 text-sm text-muted-foreground">Loading…</p></AdminShell>;

  return (
    <AdminShell>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Curated media</p>
          <h1 className="font-display text-3xl">{form.id ? "Edit curated item" : "New curated item"}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Free · attribution-first · never re-hosts third-party content
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/admin/curated" as never })}>Back</Button>
          {form.id ? (
            <Button variant="outline" onClick={() => window.open(`/curated/${form.id}`, "_blank")}>Preview public</Button>
          ) : null}
        </div>
      </div>

      <CuratedEditorForm
        value={form}
        onChange={setForm}
        onScrape={onScrape}
        scraping={scraping}
        preview={preview}
        onLookupStock={onLookupStock}
        stockLookupLoading={stockLookupLoading}
      />

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={saving || !form.title.trim() || !form.source_url.trim()}>
          {saving ? "Saving…" : form.id ? "Save changes" : "Save draft"}
        </Button>
        {published ? (
          <Button variant="outline" onClick={onUnpublish} disabled={!isAdmin}>Unpublish</Button>
        ) : (
          <Button variant="secondary" onClick={onPublish} disabled={!canPublish || !form.id}>
            Publish
          </Button>
        )}
        {form.id ? (
          <Button variant="destructive" onClick={onDelete} disabled={!isAdmin} className="ml-auto">Delete</Button>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Publish is admin-only. Analysts can edit their own drafts.
      </p>
    </AdminShell>
  );
}
