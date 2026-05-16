import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, AlertTriangle, Loader2, Camera } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function AnalystProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [specs, setSpecs] = useState("");
  const [langs, setLangs] = useState("");
  const [available, setAvailable] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["analyst_profile_full", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("analyst_profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
      setSpecs((profile.specializations ?? []).join(", "));
      setLangs((profile.languages ?? []).join(", "));
      setAvailable(!!profile.is_available);
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("No session");
      const { error } = await supabase.from("analyst_profiles").update({
        display_name: displayName.trim(),
        bio: bio.slice(0, 200),
        specializations: specs.split(",").map((s) => s.trim()).filter(Boolean),
        languages: langs.split(",").map((s) => s.trim()).filter(Boolean),
        is_available: available,
      }).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["analyst_profile_full", user?.id] });
      qc.invalidateQueries({ queryKey: ["analyst_profile", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      const path = `${user.id}/avatar_${Date.now()}.${file.name.split(".").pop()}`;
      const { error } = await supabase.storage.from("profiles").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("profiles").getPublicUrl(path);
      const { error: uErr } = await supabase.from("analyst_profiles").update({ avatar_url: pub.publicUrl }).eq("id", user.id);
      if (uErr) throw uErr;
      await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", user.id);
      toast.success("Photo updated");
      qc.invalidateQueries({ queryKey: ["analyst_profile_full", user?.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <AdminShell title="My Analyst Profile">
      {isLoading && <Skeleton className="h-96 w-full" />}

      {!isLoading && !profile && (
        <Card className="p-6">
          <p className="text-sm">No analyst profile linked to your account yet. Apply via the analyst application form.</p>
        </Card>
      )}

      {profile && (
        <>
          {!profile.is_approved ? (
            <Card className="p-4 mb-5 bg-amber-500/10 border-amber-500/40">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm">
                  <span className="font-medium text-amber-700 dark:text-amber-300">Your account is pending SEBI verification.</span> Our team is reviewing your credentials. You'll be able to receive queries once approved.
                </p>
              </div>
            </Card>
          ) : (
            <Card className="p-4 mb-5 bg-emerald-500/10 border-emerald-500/40">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">SEBI Verified — Your profile is live on the platform.</p>
              </div>
            </Card>
          )}

          <Card className="p-6">
            <div className="flex items-center gap-5 mb-6">
              <div className="relative">
                <Avatar className="h-20 w-20 border-2 border-primary/30">
                  <AvatarImage src={profile.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xl">{displayName.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <label className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1.5 cursor-pointer hover:bg-primary/90">
                  {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
                </label>
              </div>
              <div>
                <Badge className="bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] border-[hsl(var(--gold))]/40">
                  SEBI {profile.sebi_type} · {profile.sebi_reg_number}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">Read-only. Contact support to update.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="space-y-1.5 flex flex-col">
                <Label>Availability</Label>
                <div className="flex items-center gap-3 h-10 px-3 rounded-md border border-input">
                  <Switch checked={available} onCheckedChange={setAvailable} />
                  <span className="text-sm">{available ? "Available for new queries" : "Busy — not accepting"}</span>
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Bio <span className="text-muted-foreground text-[10px]">({bio.length}/200)</span></Label>
                <Textarea value={bio} maxLength={200} rows={3} onChange={(e) => setBio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Specializations <span className="text-muted-foreground text-[10px]">(comma separated)</span></Label>
                <Input value={specs} onChange={(e) => setSpecs(e.target.value)} placeholder="Equity, IT, Banking" />
              </div>
              <div className="space-y-1.5">
                <Label>Languages</Label>
                <Input value={langs} onChange={(e) => setLangs(e.target.value)} placeholder="English, Hindi" />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
              </Button>
            </div>
          </Card>
        </>
      )}
    </AdminShell>
  );
}
