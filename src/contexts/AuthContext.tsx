import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { markHasAccount } from "@/lib/auth/redirectHelper";

export type AppRole = "user" | "analyst" | "admin";

export interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  wallet_balance: number | null;
  referral_code: string | null;
  onboarding_completed: boolean | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: ProfileRow | null;
  roles: AppRole[];
  role: AppRole | null;
  isUser: boolean;
  isAnalyst: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function highestRole(roles: AppRole[]): AppRole | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("analyst")) return "analyst";
  if (roles.includes("user")) return "user";
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfileAndRoles = useCallback(async (userId: string) => {
    const [{ data: profileData }, { data: roleData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone, avatar_url, wallet_balance, referral_code, onboarding_completed")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile((profileData as ProfileRow | null) ?? null);
    setRoles(((roleData ?? []) as { role: AppRole }[]).map((r) => r.role));
  }, []);

  useEffect(() => {
    // Task A — stale refresh-token guard. If Supabase returns a
    // refresh-token error on init (browser was signed in earlier with a
    // token that has since been revoked/expired), gotrue-js will emit a
    // one-time 400 to /auth/v1/token?grant_type=refresh_token. Clear the
    // stale local session so it does NOT retry on every mount/tab-focus.
    const isRefreshError = (msg: string | undefined) =>
      !!msg && /refresh.?token/i.test(msg);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        if (event === "SIGNED_IN") markHasAccount();
        setTimeout(() => {
          fetchProfileAndRoles(newSession.user.id);
        }, 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
    });

    supabase.auth
      .getSession()
      .then(async ({ data: { session: existing }, error }) => {
        if (error && isRefreshError(error.message)) {
          try { await supabase.auth.signOut({ scope: "local" }); } catch { /* noop */ }
          setSession(null);
          setUser(null);
          setIsLoading(false);
          return;
        }
        setSession(existing);
        setUser(existing?.user ?? null);
        if (existing?.user) {
          fetchProfileAndRoles(existing.user.id).finally(() => setIsLoading(false));
        } else {
          setIsLoading(false);
        }
      })
      .catch(async (err) => {
        if (isRefreshError(err?.message)) {
          try { await supabase.auth.signOut({ scope: "local" }); } catch { /* noop */ }
        }
        setIsLoading(false);
      });

    return () => subscription.unsubscribe();
  }, [fetchProfileAndRoles]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
  }, []);

  const refresh = useCallback(async () => {
    if (user) await fetchProfileAndRoles(user.id);
  }, [user, fetchProfileAndRoles]);

  const value = useMemo<AuthContextValue>(() => {
    const role = highestRole(roles);
    return {
      user,
      session,
      profile,
      roles,
      role,
      isUser: roles.includes("user"),
      isAnalyst: roles.includes("analyst"),
      isAdmin: roles.includes("admin"),
      isLoading,
      signOut,
      refresh,
    };
  }, [user, session, profile, roles, isLoading, signOut, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
