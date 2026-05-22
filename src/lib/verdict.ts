export const VERDICT_OPTIONS = [
  { value: "HOLD",            label: "HOLD",             color: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40" },
  { value: "MONITOR",         label: "MONITOR",          color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40" },
  { value: "REDUCE_EXPOSURE", label: "REDUCE EXPOSURE",  color: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40" },
  { value: "ADD_GRADUALLY",   label: "ADD GRADUALLY",    color: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/40" },
  { value: "WAIT_FOR_CLARITY",label: "WAIT FOR CLARITY", color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/40" },
] as const;

export type VerdictValue = typeof VERDICT_OPTIONS[number]["value"];

export const VERDICT_MAP: Record<string, { label: string; color: string }> =
  Object.fromEntries(VERDICT_OPTIONS.map((v) => [v.value, { label: v.label, color: v.color }]));

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.slice(0, Math.min(3, local.length));
  return `${head}${"*".repeat(Math.max(1, local.length - head.length))}@${domain}`;
}
