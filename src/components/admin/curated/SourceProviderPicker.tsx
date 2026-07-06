import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PROVIDERS = [
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "Twitter / X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "medium", label: "Medium" },
  { value: "substack", label: "Substack" },
  { value: "moneycontrol", label: "Moneycontrol" },
  { value: "livemint", label: "Livemint" },
  { value: "economictimes", label: "Economic Times" },
  { value: "other", label: "Other" },
];

export function SourceProviderPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const known = PROVIDERS.find((p) => p.value === value);
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Source provider</Label>
      <Select value={known ? value : "other"} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Pick source" /></SelectTrigger>
        <SelectContent>
          {PROVIDERS.map((p) => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!known && value ? (
        <p className="text-[11px] text-muted-foreground">Detected: <span className="font-mono">{value}</span></p>
      ) : null}
    </div>
  );
}
