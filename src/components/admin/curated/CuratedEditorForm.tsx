import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SourceProviderPicker } from "./SourceProviderPicker";
import { EmbedKindPicker } from "./EmbedKindPicker";
import { OgScrapePreview, type OgPreview } from "./OgScrapePreview";

export type CuratedFormState = {
  id?: string;
  source_url: string;
  source_provider: string;
  embed_kind: "embed" | "link_out";
  title: string;
  description: string;
  custom_thumbnail_url: string;
  tags: string; // comma-separated in UI
  sector: string;
  category: "general" | "stock_specific";
  stock_symbol: string;
  stock_master_id: string;
  og_scrape_meta: Record<string, unknown> | null;
};

export function emptyForm(): CuratedFormState {
  return {
    source_url: "",
    source_provider: "",
    embed_kind: "link_out",
    title: "",
    description: "",
    custom_thumbnail_url: "",
    tags: "",
    sector: "",
    category: "general",
    stock_symbol: "",
    stock_master_id: "",
    og_scrape_meta: null,
  };
}

export function CuratedEditorForm({
  value,
  onChange,
  onScrape,
  scraping,
  preview,
  onLookupStock,
  stockLookupLoading,
  disabled,
}: {
  value: CuratedFormState;
  onChange: (next: CuratedFormState) => void;
  onScrape: () => Promise<void>;
  scraping: boolean;
  preview: OgPreview | null;
  onLookupStock: (symbol: string) => Promise<{ id: string; company_name: string | null } | null>;
  stockLookupLoading: boolean;
  disabled?: boolean;
}) {
  const set = <K extends keyof CuratedFormState>(k: K, v: CuratedFormState[K]) =>
    onChange({ ...value, [k]: v });
  const [stockNote, setStockNote] = useState<string>("");

  const lookup = async () => {
    setStockNote("");
    const sym = value.stock_symbol.trim().toUpperCase();
    if (!sym) return;
    const found = await onLookupStock(sym);
    if (!found) {
      set("stock_master_id", "");
      setStockNote(`No match for "${sym}" in stock_master`);
    } else {
      set("stock_master_id", found.id);
      setStockNote(`Linked: ${sym} (${found.company_name ?? "—"})`);
    }
  };

  return (
    <div className="grid gap-4">
      <Card className="p-4 grid gap-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Source URL</Label>
        <div className="flex gap-2">
          <Input
            value={value.source_url}
            onChange={(e) => set("source_url", e.target.value)}
            placeholder="https://…"
            disabled={disabled}
          />
          <Button type="button" onClick={onScrape} disabled={scraping || !value.source_url.trim() || disabled}>
            {scraping ? "Fetching…" : "Fetch preview"}
          </Button>
        </div>
        <OgScrapePreview preview={preview} />
      </Card>

      <Card className="p-4 grid gap-3">
        <div className="grid md:grid-cols-2 gap-3">
          <SourceProviderPicker value={value.source_provider} onChange={(v) => set("source_provider", v)} />
          <EmbedKindPicker value={value.embed_kind} onChange={(v) => set("embed_kind", v)} />
        </div>

        <div className="grid gap-1.5">
          <Label>Title</Label>
          <Input value={value.title} onChange={(e) => set("title", e.target.value)} maxLength={200} disabled={disabled} />
        </div>
        <div className="grid gap-1.5">
          <Label>Description</Label>
          <Textarea
            value={value.description}
            onChange={(e) => set("description", e.target.value)}
            rows={4}
            maxLength={2000}
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Custom thumbnail URL (optional)</Label>
          <Input
            value={value.custom_thumbnail_url}
            onChange={(e) => set("custom_thumbnail_url", e.target.value)}
            placeholder="Overrides og:image"
            disabled={disabled}
          />
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Tags (comma-separated)</Label>
            <Input value={value.tags} onChange={(e) => set("tags", e.target.value)} disabled={disabled} />
          </div>
          <div className="grid gap-1.5">
            <Label>Sector (optional)</Label>
            <Input value={value.sector} onChange={(e) => set("sector", e.target.value)} disabled={disabled} />
          </div>
        </div>
      </Card>

      <Card className="p-4 grid gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Category</Label>
          <Select
            value={value.category}
            onValueChange={(v) => set("category", v as "general" | "stock_specific")}
            disabled={disabled}
          >
            <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General (free, no stock required)</SelectItem>
              <SelectItem value="stock_specific">Stock-specific (still free)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Curated items are FREE regardless of category. No unlock/wallet flow applies.
          </p>
        </div>
        {value.category === "stock_specific" ? (
          <div className="grid gap-1.5">
            <Label>Stock symbol (canonical)</Label>
            <div className="flex gap-2">
              <Input
                value={value.stock_symbol}
                onChange={(e) => set("stock_symbol", e.target.value.toUpperCase())}
                placeholder="e.g. RELIANCE"
                disabled={disabled}
              />
              <Button type="button" variant="secondary" onClick={lookup} disabled={stockLookupLoading || disabled}>
                {stockLookupLoading ? "Looking…" : "Lookup"}
              </Button>
            </div>
            {stockNote ? <p className="text-[11px] text-muted-foreground">{stockNote}</p> : null}
            {value.stock_master_id ? (
              <p className="text-[11px] text-muted-foreground font-mono">stock_master_id: {value.stock_master_id}</p>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
