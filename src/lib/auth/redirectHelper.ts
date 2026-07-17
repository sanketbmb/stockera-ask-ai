const HAS_ACCOUNT_KEY = "asktheexpert_has_account";

export function markHasAccount(): void {
  try { localStorage.setItem(HAS_ACCOUNT_KEY, "1"); } catch { /* noop */ }
}

export function hasAccountLocally(): boolean {
  try { return localStorage.getItem(HAS_ACCOUNT_KEY) === "1"; } catch { return false; }
}

export function getAuthRedirectPath(): "/login" | "/signup" {
  return hasAccountLocally() ? "/login" : "/signup";
}
