// Stage 4F.3 APPLY-2 — RA dropdown, SEBI-registered analysts only.
// Admins may pick any; analysts locked to themselves (parent enforces via `lockedTo`).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface AnalystOption {
  id: string;
  display_name: string;
  sebi_reg_number: string | null;
}

interface Props {
  value: string | null;
  onChange: (id: string) => void;
  lockedTo?: string | null;
  disabled?: boolean;
}

export function AnalystSelector({ value, onChange, lockedTo, disabled }: Props) {
  const { data: analysts, isLoading } = useQuery({
    queryKey: ["admin_video_analysts", lockedTo ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("analyst_profiles")
        .select("id, display_name, sebi_reg_number, is_approved")
        .not("sebi_reg_number", "is", null)
        .order("display_name", { ascending: true });
      if (lockedTo) q = q.eq("id", lockedTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AnalystOption[];
    },
  });

  return (
    <div className="space-y-2">
      <Label>Analyst (RA) *</Label>
      <Select
        value={value ?? undefined}
        onValueChange={onChange}
        disabled={disabled || isLoading || !!lockedTo}
      >
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? "Loading…" : "Select analyst"} />
        </SelectTrigger>
        <SelectContent>
          {(analysts ?? []).map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.display_name}{a.sebi_reg_number ? ` · ${a.sebi_reg_number}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">Only SEBI-registered analysts are listed.</p>
    </div>
  );
}

export default AnalystSelector;
