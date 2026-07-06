// Stage 4F.3 APPLY-2 — thin wrapper around StockAutocomplete for the editor.
import { StockAutocomplete } from "@/components/common/StockAutocomplete";
import { Label } from "@/components/ui/label";

export interface SymbolPick {
  symbol: string;
  name: string;
}

interface Props {
  value: SymbolPick | null;
  onChange: (v: SymbolPick | null) => void;
  disabled?: boolean;
}

export function SymbolPicker({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-2">
      <Label>Stock *</Label>
      <div className={disabled ? "pointer-events-none opacity-60" : ""}>
        <StockAutocomplete
          value={
            value
              ? { symbol: value.symbol, name: value.name, sector: "NSE" }
              : null
          }
          onSelect={(s) => onChange({ symbol: s.symbol, name: s.name })}
          onClear={() => onChange(null)}
        />
      </div>
    </div>
  );
}

export default SymbolPicker;
