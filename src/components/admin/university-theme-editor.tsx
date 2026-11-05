"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2, RotateCcw, Sparkles, Trash2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { askConfirm } from "@/components/ui/confirm-dialog";
import { themeFontFamily } from "@/lib/theme/fonts";
import { MAX_FONT_BYTES } from "@/lib/theme/font-upload";
import { UniversityLayoutEditor } from "@/components/admin/university-layout-editor";
import { DEFAULT_LAYOUT, navHidden, navName, type NavKey } from "@/lib/theme/university-layout";
import { DEFAULT_THEME, sameTheme, THEME_FONTS, THEME_PRESETS, themeWarnings, type UniversityTheme } from "@/lib/theme/university-theme";

/**
 * A university's theme, for super admins: colours and font for its members,
 * with a preview of the app in them. Saving takes effect on each member's next
 * page; Reset goes back to Requisor's own look. A font of the university's own
 * can be uploaded (WOFF2, WOFF, TTF or OTF) and chosen as "Uploaded font".
 *
 * Quickest first: describe the feel in a few words and the AI picks a readable
 * theme, or pick a ready-made style. Every colour can still be set by hand
 * under "Customise every detail".
 */
/** The university's own font: saved already (src is its address here), or picked and waiting for Save (file). */
type OwnFont = { name: string; src: string; file?: { name: string; data: string } };
const FONT_FILES = ".woff2,.woff,.ttf,.otf";
const COLOURS: { key: "primary" | "secondary" | "background" | "sidebar"; label: string; hint: string }[] = [
  { key: "primary", label: "Main colour", hint: "Buttons, links, highlights, progress" },
  { key: "secondary", label: "Secondary colour", hint: "Gradients and second accents" },
  { key: "background", label: "Page background", hint: "Behind the cards" },
  { key: "sidebar", label: "Sidebar", hint: "The navigation on the left" },
];

const HEX = /^#[0-9a-f]{6}$/i;

function ColourField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  // Follow changes made elsewhere (a suggested shade, Reset) without fighting the typing.
  if (value !== shown) { setShown(value); setText(value); }
  return (
    <div>
      <p className="text-xs font-medium text-zinc-700">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`${label}: pick`} className="h-9 w-11 cursor-pointer rounded-lg border border-zinc-200 bg-white p-0.5" />
        <input
          value={text} maxLength={7} spellCheck={false} aria-label={`${label}: hex code`}
          onChange={(e) => { const v = e.target.value.trim(); setText(v); if (HEX.test(v)) onChange(v.toUpperCase()); }}
          className={cn("focus-ring h-9 w-24 rounded-lg border bg-white px-2 font-mono text-xs uppercase text-zinc-900", HEX.test(text) ? "border-zinc-200" : "border-red-300")}
        />
      </div>
      <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p>
    </div>
  );
}

/** The app in miniature, in the chosen theme. */
function Preview({ theme, ownFont }: { theme: UniversityTheme; ownFont: string | null }) {
  const font = (theme.font === "custom" ? ownFont : themeFontFamily(theme.font)) ?? undefined;
  const layout = theme.layout ?? DEFAULT_LAYOUT;
  const dark = layout.sidebarStyle === "dark";
  const sidebarBg = dark ? "#18181B" : layout.sidebarStyle === "tinted" ? `linear-gradient(${theme.primary}1A, ${theme.primary}1A), ${theme.sidebar}` : theme.sidebar;
  // A learner's menu, as this university names and orders it.
  const learnerKeys: NavKey[] = ["dashboard", "paths", "my-learning", "badges", "submissions", "profile"];
  const menu = layout.nav.map((n) => n.key).filter((k) => learnerKeys.includes(k) && !navHidden(layout, k)).slice(0, 5);
  return (
    <div aria-label="Preview" className="overflow-hidden rounded-xl border border-zinc-200" style={{ background: theme.background, fontFamily: font }}>
      {layout.topbar && (
        <div className={cn("flex items-center gap-1.5 border-b border-zinc-200 px-2.5", layout.topbar.compact ? "h-6" : "h-8")} style={{ background: theme.sidebar }}>
          {layout.topbar.logo && <span className="h-3.5 w-3.5 rounded-sm" style={{ background: theme.primary }} aria-hidden="true" />}
          <span className="flex-1" />
          {layout.topbar.search && <span className="h-3.5 w-20 rounded border border-zinc-200 bg-white" aria-hidden="true" />}
          {layout.topbar.xp && <span className="rounded-full px-1.5 text-[9px] font-semibold text-white" style={{ background: theme.primary }}>50 XP</span>}
        </div>
      )}
      <div className={cn("flex min-h-[180px]", layout.sidebarSide === "right" && "flex-row-reverse")}>
        <div className={cn("shrink-0 space-y-1.5 border-zinc-200 p-2.5", layout.sidebarSide === "right" ? "border-l" : "border-r", layout.sidebarStart === "collapsed" ? "w-10" : "w-28")} style={{ background: sidebarBg }}>
          {menu.map((k, i) => layout.sidebarStart === "collapsed"
            ? <div key={k} className="mx-auto h-4 w-4 rounded" style={{ background: i === 0 ? theme.primary : dark ? "#3F3F46" : "#E4E4E7" }} title={navName(layout, k)} />
            : <div key={k} className={cn("truncate rounded-md px-2 py-1 text-[11px]", i === 0 ? "font-semibold text-white" : dark ? "text-zinc-300" : "text-zinc-600")} style={i === 0 ? { background: theme.primary } : undefined}>{navName(layout, k)}</div>)}
        </div>
        <div className="flex-1 p-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
            <p className="text-sm font-semibold" style={{ color: theme.primary }}>Welcome back</p>
            <p className="mt-0.5 text-[11px] text-zinc-600">Continue where you left off: Lesson 3 of Data Analytics.</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
              <div className="h-full w-3/5 rounded-full" style={{ background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})` }} />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white" style={{ background: theme.primary }}>Continue</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: theme.secondary }}>New</span>
              <span className="text-[11px] font-medium underline" style={{ color: theme.primary }}>View all</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UniversityThemeEditor({ id, name, initial, savedFont, onClose, onSaved }: {
  id: number; name: string; initial: UniversityTheme | null; savedFont: { name: string; version: number } | null; onClose: () => void; onSaved: (text: string) => void;
}) {
  const [theme, setTheme] = useState<UniversityTheme>(initial ?? DEFAULT_THEME);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownFont, setOwnFont] = useState<OwnFont | null>(savedFont ? { name: savedFont.name, src: `/api/universities/${id}/font/?v=${savedFont.version}` } : null);
  const [previewFamily, setPreviewFamily] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [feel, setFeel] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  // The uploaded font, loaded into this page under a name of its own, for the preview.
  useEffect(() => {
    if (!ownFont) { setPreviewFamily(null); return; }
    let cancelled = false;
    const family = `UniversityFontPreview${Math.random().toString(36).slice(2, 8)}`;
    new FontFace(family, `url(${ownFont.src})`).load()
      .then((loaded) => { if (cancelled) return; document.fonts.add(loaded); setPreviewFamily(`"${family}", ui-sans-serif, system-ui, sans-serif`); })
      .catch(() => { if (!cancelled) setError("The browser couldn't read that font. Try a WOFF2 or TTF file."); });
    return () => { cancelled = true; };
  }, [ownFont]);
  const warnings = themeWarnings(theme);
  const set = (patch: Partial<UniversityTheme>) => { setTheme((t) => ({ ...t, ...patch })); setError(null); };

  async function suggest() {
    setAiBusy(true); setError(null); setAiNote(null);
    try {
      const res = await fetch("/api/admin/universities/theme/suggest/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: feel }) });
      const data = (await res.json().catch(() => ({}))) as { theme?: UniversityTheme; why?: string; adjusted?: boolean; error?: string };
      if (!res.ok || !data.theme) throw new Error(data.error ?? "Couldn't make a theme right now. Try again, or pick a style.");
      setTheme((t) => ({ ...data.theme!, ...(t.layout ? { layout: t.layout } : {}) }));
      setAiNote([data.why, data.adjusted ? "Some shades were made deeper or lighter so text stays easy to read." : ""].filter(Boolean).join(" ") || "Here's a theme for that feel.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  function pickFont(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!/\.(woff2?|ttf|otf)$/i.test(file.name)) { setError("Choose a WOFF2, WOFF, TTF or OTF font file."); return; }
    if (file.size > MAX_FONT_BYTES) { setError("That font file is too large. Keep it under 1.5 MB (WOFF2 files are the smallest)."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result);
      setOwnFont({ name: file.name, src: data, file: { name: file.name, data } });
      set({ font: "custom" });
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsDataURL(file);
  }

  async function removeFont() {
    if (!ownFont) return;
    // Picked but never saved: just forget it.
    if (ownFont.file && !savedFont) { setOwnFont(null); if (theme.font === "custom") set({ font: "default" }); return; }
    if (!(await askConfirm(`Remove the uploaded font from ${name}? Its members go back to Requisor's font.`, { confirmLabel: "Remove font", danger: true }))) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/universities/font/", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The font couldn't be removed.");
      onSaved(`The uploaded font was removed from ${name}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function put(next: UniversityTheme | null) {
    setBusy(true); setError(null);
    try {
      // A newly picked font goes up first: the theme can only use a font that is saved.
      if (next?.font === "custom" && ownFont?.file) {
        const up = await fetch("/api/admin/universities/font/", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, file: ownFont.file }) });
        const upData = (await up.json().catch(() => ({}))) as { error?: string };
        if (!up.ok) throw new Error(upData.error ?? "The font couldn't be uploaded.");
      }
      const res = await fetch("/api/admin/universities/theme/", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, theme: next }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The theme couldn't be saved.");
      onSaved(next ? `${name}'s theme was saved. Its members see it on the next page they open.` : `${name} is back to Requisor's own look.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!(await askConfirm(`Go back to Requisor's own colours and font for ${name}?`, { confirmLabel: "Reset" }))) return;
    void put(null);
  }

  return (
    <div className="mt-2 w-full space-y-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Theme for {name}</p>
          <p className="text-[11px] text-zinc-500">What its tutors, learners and university admins see once they sign in. Public pages and other universities keep Requisor&apos;s look.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the theme" className="focus-ring rounded-md p-1 text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div>
            <label htmlFor={`theme-feel-${id}`} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800"><Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />Describe how it should feel</label>
            <div className="mt-1 flex gap-2">
              <input id={`theme-feel-${id}`} value={feel} maxLength={300} onChange={(e) => setFeel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && feel.trim().length >= 3 && !aiBusy) void suggest(); }}
                placeholder="e.g. a bit of red mixed with brown, warm and serious" className="focus-ring h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900" />
              <button type="button" disabled={aiBusy || busy || feel.trim().length < 3} onClick={() => void suggest()}
                className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white disabled:opacity-50">
                {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}Create with AI
              </button>
            </div>
            {aiNote && <p role="status" className="mt-1.5 text-[11px] text-emerald-800">{aiNote} Check the preview, then save.</p>}
          </div>

          <div>
            <p className="text-xs font-semibold text-zinc-800">Or pick a style</p>
            <div role="radiogroup" aria-label="Ready-made styles" className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {THEME_PRESETS.map((p) => {
                const on = sameTheme({ ...p.theme }, { ...theme, layout: undefined });
                return (
                  <button key={p.key} type="button" role="radio" aria-checked={on} onClick={() => { setTheme((t) => ({ ...p.theme, ...(t.layout ? { layout: t.layout } : {}) })); setAiNote(null); setError(null); }}
                    className={cn("focus-ring flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 text-left text-[11px] font-medium text-zinc-700 transition", on ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-300")}>
                    <span aria-hidden="true" className="flex shrink-0 overflow-hidden rounded-full border border-black/10">
                      <span className="h-4 w-2" style={{ background: p.theme.primary }} /><span className="h-4 w-2" style={{ background: p.theme.secondary }} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {on && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white">
            <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((v) => !v)}
              className="focus-ring flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-zinc-800">
              Customise every detail
              <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition", detailsOpen && "rotate-180")} aria-hidden="true" />
            </button>
            {detailsOpen && (
          <div className="space-y-3 border-t border-zinc-100 p-3">
          <div className="grid grid-cols-2 gap-3">
            {COLOURS.map((c) => <ColourField key={c.key} label={c.label} hint={c.hint} value={theme[c.key]} onChange={(v) => set({ [c.key]: v })} />)}
          </div>
          <label className="block text-xs font-medium text-zinc-700">Font
            <select value={theme.font} onChange={(e) => set({ font: e.target.value as UniversityTheme["font"] })}
              className="focus-ring mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900">
              {THEME_FONTS.filter((f) => f.key !== "custom" || ownFont).map((f) => (
                <option key={f.key} value={f.key}>{f.key === "custom" ? `Uploaded: ${ownFont?.name}` : `${f.label}${f.kind === "serif" ? " (serif)" : ""}`}</option>
              ))}
            </select>
          </label>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept={FONT_FILES} className="hidden" onChange={(e) => pickFont(e.target.files?.[0])} />
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:opacity-50">
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />{ownFont ? "Replace uploaded font" : "Upload a font"}
              </button>
              {ownFont && (
                <button type="button" disabled={busy} onClick={() => void removeFont()} className="focus-ring inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Remove font
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {ownFont && <>{ownFont.file ? "Picked" : "Uploaded"}: <span className="font-medium text-zinc-700">{ownFont.name}</span>{ownFont.file ? " (uploads when you save)" : ""}. </>}
              WOFF2, WOFF, TTF or OTF, up to 1.5 MB. Only upload a font the university is licensed to use on its website.
            </p>
          </div>
          </div>
            )}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white">
            <button type="button" aria-expanded={layoutOpen} onClick={() => setLayoutOpen((v) => !v)}
              className="focus-ring flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-zinc-800">
              Layout and navigation
              <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition", layoutOpen && "rotate-180")} aria-hidden="true" />
            </button>
            {layoutOpen && (
              <div className="border-t border-zinc-100 p-3">
                <UniversityLayoutEditor value={theme.layout ?? DEFAULT_LAYOUT} onChange={(layout) => set({ layout })} />
              </div>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Preview theme={theme} ownFont={previewFamily} />
          {warnings.map((w) => (
            <p key={w.field} role="alert" className="flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{w.text}
              {w.fix && <button type="button" onClick={() => set({ [w.field]: w.fix })} className="font-semibold underline">Use {w.fix} instead</button>}
            </p>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" disabled={busy || !initial} onClick={() => void reset()} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:opacity-40">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Reset to Requisor
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="focus-ring rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700">Cancel</button>
          <button type="button" disabled={busy || (!ownFont?.file && (initial ? sameTheme(initial, theme) : sameTheme(DEFAULT_THEME, theme)))} onClick={() => void put(theme)}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}Save theme
          </button>
        </div>
      </div>
    </div>
  );
}
