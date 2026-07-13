## Revised Plan — Step 2 Video Card thumbnail (2-layer treatment)

**Scope:** `src/components/landing/StepStory.tsx` only. No other files. No click-behavior changes. `useAuth` stays as-is (still referenced via `void user` on line 74).

**Approach:** Replace the placeholder gradient block (lines 202-209) with a 16:9 preview box containing:

- Blurred, scaled, darkened background layer (same YT thumbnail, `object-cover`, full bleed)
- Sharp foreground layer (same YT thumbnail, `object-contain`, centered — no subject cropping)
- Centered play button overlay
- Fallback chain: `maxresdefault.jpg` → `hqdefault.jpg` → original placeholder UI (icon + caption)
- Bottom caption row (lines 210-216) kept unchanged

---

### Unified diff (only file: `src/components/landing/StepStory.tsx`)

```diff
@@ -15,6 +15,9 @@
 
 
 // Canonical demo report — real SBI averaging report used across the site.
 const DEMO_REPORT_ID = "4f71e760-ded3-42c5-a1b4-6dbe005345b1";
+// Sample M&M video shown as the Step 2 preview thumbnail.
+const DEMO_VIDEO_YT_ID = "daj-U65js2E";
+const YT_THUMB = (id: string, q: "maxres" | "hq") => `https://i.ytimg.com/vi/${id}/${q}default.jpg`;
 const SBI_QUESTION =
   "I bought SBI Bank at 1227 now at 1029. Should I average, hold, or sell?";
 
@@ -53,6 +56,7 @@
 export function StepStory() {
   const navigate = useNavigate();
   const [tab, setTab] = useState<"textual" | "video">("textual");
   const { user } = useAuth();
+  const [thumbState, setThumbState] = useState<"maxres" | "hq" | "fallback">("maxres");
 
   const p1Ref = useRef(null);
@@ -199,15 +203,45 @@
                 <div className="absolute -top-3 right-4 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-md">
                   <Clock className="w-3 h-3" /> Within 24 Hours
                 </div>
-                <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-accent/5 to-primary/5 rounded-xl border border-border/50 min-h-[180px]">
-                  <div className="text-center">
-                    <div className="w-16 h-16 rounded-full bg-accent/10 mx-auto flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
-                      <Play className="w-7 h-7 text-accent ml-1" />
+                <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-accent/5 to-primary/5">
+                  {thumbState !== "fallback" ? (
+                    <>
+                      {/* Background: blurred + scaled + darkened side-fill */}
+                      <img
+                        src={YT_THUMB(DEMO_VIDEO_YT_ID, thumbState)}
+                        alt=""
+                        aria-hidden="true"
+                        className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-70"
+                        onError={() =>
+                          setThumbState((s) => (s === "maxres" ? "hq" : "fallback"))
+                        }
+                      />
+                      <div className="absolute inset-0 bg-black/30" />
+                      {/* Foreground: full subject, no crop */}
+                      <img
+                        src={YT_THUMB(DEMO_VIDEO_YT_ID, thumbState)}
+                        alt="Sample video analysis by SEBI-registered RA"
+                        loading="lazy"
+                        className="relative z-10 h-full w-full object-contain"
+                        onError={() =>
+                          setThumbState((s) => (s === "maxres" ? "hq" : "fallback"))
+                        }
+                      />
+                      {/* Centered play affordance */}
+                      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
+                        <div className="w-14 h-14 rounded-full bg-white/95 shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform">
+                          <Play className="w-6 h-6 text-primary ml-0.5" fill="currentColor" />
+                        </div>
+                      </div>
+                    </>
+                  ) : (
+                    <div className="absolute inset-0 flex items-center justify-center">
+                      <div className="text-center">
+                        <div className="w-16 h-16 rounded-full bg-accent/10 mx-auto flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
+                          <Play className="w-7 h-7 text-accent ml-1" />
+                        </div>
+                        <p className="text-xs text-muted-foreground">Self-recorded video by RA</p>
+                      </div>
                     </div>
-                    <p className="text-xs text-muted-foreground">Self-recorded video by RA</p>
-                  </div>
+                  )}
                 </div>
                 <div className="mt-4">
                   <div className="flex items-center gap-2 mb-1">
```

---

### Confirmation

- Only `src/components/landing/StepStory.tsx` changes.
- No changes to imports of `useAuth` (still used at L56/L74).
- No changes to `goReport` / `onClick` — click behavior identical.
- No backend, route, or SEO changes.

**STOP — awaiting `APPROVED — APPLY`.**  
  
APPROVED — APPLY.

Apply exactly this one-file Step 2 video thumbnail polish in src/components/landing/StepStory.tsx only.

Do not change any other file.

After applying, verify visually that:

1. the Step 2 VIDEO ANALYSIS card shows the real thumbnail

2. the preview is 16:9

3. the subject is not awkwardly cropped

4. the play overlay looks centered and clean

5. click behavior is unchanged

Then STOP and report completion.

&nbsp;