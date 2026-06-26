// Shared verdict tone tokens. Two named exports — one filled chip variant
// (marquee + master-search recent tab) and one outline pill variant
// (problems-we-solve copy highlights). Values are byte-identical to the
// previously-inlined consts; do not edit keys or values without also
// updating every read site.

export const VERDICT_TONE_FILLED: Record<string, string> = {
  BUY: "bg-success/15 text-success",
  WATCHLIST: "bg-primary/10 text-primary",
  HOLD: "bg-gold/15 text-[hsl(var(--gold-foreground))]",
  WAIT: "bg-muted text-muted-foreground",
  AVERAGE: "bg-accent/15 text-accent",
  "PARTIAL EXIT": "bg-warning/15 text-[hsl(var(--gold-foreground))]",
  REDUCE: "bg-warning/15 text-[hsl(var(--gold-foreground))]",
  EXIT: "bg-destructive/15 text-destructive",
  AVOID: "bg-destructive/15 text-destructive",
};

export const VERDICT_TONE_OUTLINE: Record<string, string> = {
  BUY: "border-primary/40 text-primary",
  WATCHLIST: "border-primary/40 text-primary",
  HOLD: "border-border text-muted-foreground",
  WAIT: "border-border text-muted-foreground",
  AVERAGE: "border-warning/40 text-warning",
  "PARTIAL EXIT": "border-warning/40 text-warning",
  REDUCE: "border-warning/40 text-warning",
  EXIT: "border-destructive/40 text-destructive",
  AVOID: "border-destructive/40 text-destructive",
};
