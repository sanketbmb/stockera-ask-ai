import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function SettingsPage() {
  const { user, profile, refresh } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [notif, setNotif] = useState({ email: true, whatsapp: true, marketing: false });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      // bio not in ProfileRow type; fetch separately if needed
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("bio").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data?.bio) setBio(data.bio);
    });
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: fullName.trim() || null,
      phone: phone.trim() || null,
      bio: bio.trim() || null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
    await refresh();
  };

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Max 2MB"); return; }
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from("profiles").upload(path, file, { upsert: true, cacheControl: "0" });
    if (error) { toast.error(error.message); return; }
    const { data: { publicUrl } } = supabase.storage.from("profiles").getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    toast.success("Avatar updated");
    await refresh();
  };

  const changePassword = async () => {
    if (password.length < 6) { toast.error("Min 6 characters"); return; }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPwSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated");
    setPassword("");
  };

  const initials = (profile?.full_name || user?.email || "U").slice(0, 1).toUpperCase();
  const googleLinked = (user?.app_metadata?.providers ?? []).includes("google");

  return (
    <AppShell title="Settings">
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <Card className="p-6 max-w-2xl">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profile?.avatar_url ?? undefined} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>Change avatar</Button>
                <input ref={fileInput} type="file" accept="image/*" hidden onChange={onAvatarChange} />
                <p className="text-[11px] text-muted-foreground mt-2">PNG/JPG up to 2MB</p>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
              </div>
              <div>
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" maxLength={240} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell us about your investing style" />
                <p className="text-[11px] text-muted-foreground text-right mt-1">{bio.length}/240</p>
              </div>
              <Button onClick={saveProfile} disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <Card className="p-6 max-w-2xl space-y-4">
            <NotifRow label="Email notifications" desc="Reports ready, expert answers, weekly digest" checked={notif.email} onChange={(v) => setNotif((n) => ({ ...n, email: v }))} />
            <NotifRow label="WhatsApp notifications" desc="Real-time updates from analysts" checked={notif.whatsapp} onChange={(v) => setNotif((n) => ({ ...n, whatsapp: v }))} />
            <NotifRow label="Marketing emails" desc="Tips, market commentary, offers" checked={notif.marketing} onChange={(v) => setNotif((n) => ({ ...n, marketing: v }))} />
            <p className="text-[11px] text-muted-foreground pt-2">Notification preferences UI is local. We'll persist these in a future update.</p>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <Card className="p-6 max-w-2xl space-y-6">
            <div>
              <h3 className="font-display text-lg">Change password</h3>
              <div className="mt-3 flex gap-2">
                <PasswordInput placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button onClick={changePassword} disabled={pwSaving}>{pwSaving ? "Saving…" : "Update"}</Button>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <h3 className="font-display text-lg">Linked accounts</h3>
              <div className="mt-3 flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <span>Google</span>
                <span className={googleLinked ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>{googleLinked ? "Connected" : "Not connected"}</span>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <h3 className="font-display text-lg text-red-600 dark:text-red-400">Delete account</h3>
              <p className="text-xs text-muted-foreground mt-1">Account deletion requires support assistance. We'll permanently remove your data within 30 days.</p>
              <Button variant="outline" className="mt-3 border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10" onClick={() => toast.info("Email support@stockera.in to request account deletion")}>
                Request deletion
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function NotifRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
