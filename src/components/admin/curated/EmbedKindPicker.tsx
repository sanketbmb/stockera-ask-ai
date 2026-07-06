import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export function EmbedKindPicker({
  value,
  onChange,
}: {
  value: "embed" | "link_out";
  onChange: (v: "embed" | "link_out") => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Embed behavior</Label>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as "embed" | "link_out")} className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="embed" /> Official embed
        </label>
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="link_out" /> Link-out only
        </label>
      </RadioGroup>
      <p className="text-[11px] text-muted-foreground">
        Use official embed only when the source explicitly allows it (YouTube/Twitter). Otherwise
        show a link-out card with attribution.
      </p>
    </div>
  );
}
