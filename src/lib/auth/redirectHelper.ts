const HAS_ACCOUNT_KEY = "asktheexpert_has_account";
const INTENDED_DEST_KEY = "asktheexpert_intended_destination";

export function markHasAccount(): void {
  try { localStorage.setItem(HAS_ACCOUNT_KEY, "1"); } catch { /* noop */ }
}

export function hasAccountLocally(): boolean {
  try { return localStorage.getItem(HAS_ACCOUNT_KEY) === "1"; } catch { return false; }
}

export function getAuthRedirectPath(): "/login" | "/signup" {
  if (typeof window !== "undefined") {
    try {
      const path = window.location.pathname + window.location.search;
      saveIntendedDestination(path);
    } catch { /* noop */ }
  }
  return hasAccountLocally() ? "/login" : "/signup";
}

function isSafeInternalPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.startsWith("/") &&
    !path.startsWith("//")
  );
}

const EXCLUDED_INTENT_PREFIXES = ["/login", "/signup", "/auth/callback", "/reset-password", "/admin/login", "/logout"];

export function saveIntendedDestination(path: string): void {
  if (!isSafeInternalPath(path)) return;
  if (EXCLUDED_INTENT_PREFIXES.some((p) => path === p || path.startsWith(p + "?") || path.startsWith(p + "/"))) return;
  try { sessionStorage.setItem(INTENDED_DEST_KEY, path); } catch { /* noop */ }
}

export function consumeIntendedDestination(): string | null {
  try {
    const v = sessionStorage.getItem(INTENDED_DEST_KEY);
    sessionStorage.removeItem(INTENDED_DEST_KEY);
    return isSafeInternalPath(v) ? v : null;
  } catch {
    return null;
  }
}
