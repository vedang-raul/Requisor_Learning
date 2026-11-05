"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileSignature, ImageIcon, Loader2, Plus, RotateCcw, Upload, X } from "lucide-react";
import { BrandHeader } from "@/components/lesson/assignment-brand-header";
import { cn } from "@/lib/utils";
import { BRAND_LIMITS, ndaTemplate, type AssignmentBrand } from "@/lib/courses/assignment-brand";
import { contrast, darkenUntil, MIN_BUTTON_CONTRAST } from "@/lib/theme/university-theme";
import type { NdaSignature } from "@/lib/courses/assignment-nda";

/**
 * Step 3 of the lesson wizard, "Branded": the sponsor's name, logo, banner,
 * colour and links, and the optional NDA learners sign before they see the
 * brief. The brief itself is set above (one for all, or one per learner).
 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const input = "focus-ring h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-zinc-900";

/** The brand as saved: empty links left out, the NDA only when switched on. */
export function cleanBrand(brand: AssignmentBrand): AssignmentBrand {
  const links = brand.links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.label || l.url);
  return {
    name: brand.name.trim(),
    ...(brand.logoUrl ? { logoUrl: brand.logoUrl } : {}),
    ...(brand.bannerUrl ? { bannerUrl: brand.bannerUrl } : {}),
    ...(brand.accent ? { accent: brand.accent.toUpperCase() } : {}),
    links,
    ...(brand.nda ? { nda: { text: brand.nda.text.trim() } } : {}),
  };
}

/** What still needs fixing before the brand can be saved; null when it's fine. */
export function brandProblem(brand: AssignmentBrand): string | null {
  const b = cleanBrand(brand);
  if (b.name.length < 2) return "Name the brand that sponsors this assignment (step 3).";
  if (b.links.some((l) => !l.label || !/^https:\/\/\S+$/i.test(l.url))) return "Give every brand link a label and a full https:// address (step 3).";
  if (b.nda && b.nda.text.length < BRAND_LIMITS.ndaMin) return "Write the confidentiality agreement, or switch the NDA off (step 3).";
  return null;
}

function ImageUpload({ label, hint, value, onChange, allowUploads, uploading, setUploading, wide }: {
  label: string; hint: string; value: string | undefined; onChange: (url: string | undefined) => void;
  allowUploads: boolean; uploading: boolean; setUploading: (busy: boolean) => void; wide?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File | undefined) {
    if (ref.current) ref.current.value = "";
    if (!file) return;
    setError(null);
    if (!/\.(png|jpe?g)$/i.test(file.name) || !/^image\/(png|jpeg)$/.test(file.type)) { setError("Choose a PNG or JPG image."); return; }
    if (file.size > MAX_IMAGE_BYTES) { setError("That image is larger than 5 MB."); return; }
    setBusy(true); setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("read")); reader.readAsDataURL(file); });
      const res = await fetch("/api/tutor/resources-files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, dataUrl }) });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't upload the image.");
      onChange(data.url);
    } catch (e) {
      setError(e instanceof Error && e.message !== "read" ? e.message : "Couldn't upload the image.");
    } finally {
      setBusy(false); setUploading(false);
    }
  }
  return (
    <div>
      <p className="text-sm font-medium text-zinc-800">{label} <span className="font-normal text-zinc-500">(optional)</span></p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-zinc-50", wide ? "aspect-[4/1] w-48" : "h-14 w-14")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value ? <img src={value} alt={label} className={wide ? "h-full w-full object-cover" : "max-h-12 max-w-12 object-contain"} /> : <ImageIcon className="h-5 w-5 text-zinc-300" aria-hidden="true" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!allowUploads || uploading} onClick={() => ref.current?.click()}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{value ? "Replace" : "Upload"}
          </button>
          {value && <button type="button" onClick={() => onChange(undefined)} className="focus-ring text-xs font-medium text-red-700 hover:underline">Remove</button>}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">{allowUploads ? hint : "Save the course draft first to upload images."}</p>
      <input ref={ref} type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

/** Who has signed this lesson's NDA (only once the lesson is saved). */
function Signatures({ lessonId }: { lessonId: string }) {
  const [rows, setRows] = useState<NdaSignature[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tutor/assignment-nda?lessonId=${encodeURIComponent(lessonId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { signatures: [] }))
      .then((d: { signatures?: NdaSignature[] }) => { if (!cancelled) setRows(d.signatures ?? []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [lessonId]);
  if (rows === null) return <p className="flex items-center gap-1.5 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading signatures…</p>;
  if (!rows.length) return <p className="text-xs text-zinc-500">No one has signed yet.</p>;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-semibold text-zinc-700">Signed by {rows.filter((r) => r.current).length} learner{rows.filter((r) => r.current).length === 1 ? "" : "s"}</summary>
      <ul className="mt-1.5 max-h-48 divide-y divide-zinc-100 overflow-auto rounded-lg border border-zinc-200">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-2 px-2.5 py-1.5">
            <span><span className="font-medium text-zinc-800">{r.signedName}</span> <span className="text-zinc-500">· {r.email}</span></span>
            <span className="text-zinc-500">{new Date(r.signedAt).toLocaleString()}{r.current ? "" : " · earlier version"}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function AssignmentBrandEditor({ value, onChange, allowUploads, uploading, setUploading, savedLessonId }: {
  value: AssignmentBrand; onChange: (next: AssignmentBrand) => void;
  allowUploads: boolean; uploading: boolean; setUploading: (busy: boolean) => void;
  /** The lesson's id once it's saved, to list NDA signatures. */
  savedLessonId?: string;
}) {
  const set = (patch: Partial<AssignmentBrand>) => onChange({ ...value, ...patch });
  const accent = value.accent ?? "#23AE97";
  const accentWeak = value.accent ? contrast(value.accent, "#FFFFFF") < MIN_BUTTON_CONTRAST : false;
  const setLink = (i: number, patch: Partial<{ label: string; url: string }>) => set({ links: value.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
      <div>
        <p className="text-sm font-semibold text-zinc-900">The sponsor</p>
        <p className="text-xs text-zinc-500">Shown throughout the assignment: at the top of the brief, on the hand-in, and in learners&apos; submissions.</p>
      </div>
      <label className="block text-sm font-medium text-zinc-800">Brand name
        <input className={cn(input, "mt-1")} value={value.name} maxLength={BRAND_LIMITS.name} placeholder="e.g. Findorff Construction" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageUpload label="Logo" hint="PNG or JPG, up to 5 MB. Square or wide logos both work." value={value.logoUrl} onChange={(logoUrl) => set({ logoUrl })}
          allowUploads={allowUploads} uploading={uploading} setUploading={setUploading} />
        <ImageUpload label="Banner" hint="PNG or JPG, up to 5 MB. Wide images work best (e.g. 1600 × 400)." value={value.bannerUrl} onChange={(bannerUrl) => set({ bannerUrl })}
          allowUploads={allowUploads} uploading={uploading} setUploading={setUploading} wide />
      </div>

      <div>
        <p className="text-sm font-medium text-zinc-800">Brand colour <span className="font-normal text-zinc-500">(optional)</span></p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input type="color" value={accent} onChange={(e) => set({ accent: e.target.value.toUpperCase() })} aria-label="Brand colour" className="h-9 w-11 cursor-pointer rounded-lg border border-border bg-white p-0.5" />
          <span className="font-mono text-xs text-zinc-600">{value.accent ?? "Not set: the app's own colour"}</span>
          {value.accent && <button type="button" onClick={() => set({ accent: undefined })} className="text-xs font-medium text-zinc-600 hover:underline">Use the app&apos;s colour</button>}
        </div>
        {accentWeak && value.accent && (
          <p role="alert" className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />White text on this colour is hard to read.
            <button type="button" onClick={() => set({ accent: darkenUntil(value.accent!, "#FFFFFF", MIN_BUTTON_CONTRAST) })} className="font-semibold underline">Use a deeper shade</button>
          </p>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-zinc-800">Links to the brand <span className="font-normal text-zinc-500">(optional, up to {BRAND_LIMITS.links})</span></p>
        <div className="mt-1.5 space-y-1.5">
          {value.links.map((l, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_2.25rem] gap-1.5">
              <input className={input} value={l.label} maxLength={BRAND_LIMITS.linkLabel} placeholder="Label, e.g. Website" aria-label={`Link ${i + 1} label`} onChange={(e) => setLink(i, { label: e.target.value })} />
              <input className={cn(input, l.url && !/^https:\/\/\S+$/i.test(l.url.trim()) && "border-red-300")} value={l.url} maxLength={BRAND_LIMITS.linkUrl} placeholder="https://…" aria-label={`Link ${i + 1} address`} onChange={(e) => setLink(i, { url: e.target.value })} />
              <button type="button" onClick={() => set({ links: value.links.filter((_, j) => j !== i) })} aria-label={`Remove link ${i + 1}`}
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600"><X className="h-4 w-4" /></button>
            </div>
          ))}
          {value.links.length < BRAND_LIMITS.links && (
            <button type="button" onClick={() => set({ links: [...value.links, { label: "", url: "" }] })} className="focus-ring inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-primary hover:bg-primary/5">
              <Plus className="h-3.5 w-3.5" />Add a link
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-zinc-200 pt-3">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-800"><FileSignature className="h-4 w-4 text-primary" aria-hidden="true" />Confidentiality agreement (NDA)</span>
            <span className="block text-xs text-zinc-500">{value.nda ? "Learners sign it before they can read the brief or hand in. Until then they see only the brand, title, due date and points." : "Off: anyone in the course can read the brief."}</span>
          </span>
          <button type="button" role="switch" aria-checked={Boolean(value.nda)} aria-label="Learners sign an NDA first"
            onClick={() => set({ nda: value.nda ? undefined : { text: ndaTemplate(value.name) } })}
            className={cn("focus-ring relative h-7 w-12 shrink-0 rounded-full transition", value.nda ? "bg-primary" : "bg-zinc-300")}>
            <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", value.nda ? "left-[22px]" : "left-0.5")} />
          </button>
        </div>
        {value.nda && (
          <>
            <textarea value={value.nda.text} onChange={(e) => set({ nda: { text: e.target.value } })} rows={9} maxLength={BRAND_LIMITS.ndaMax} aria-label="The agreement learners sign"
              className="focus-ring w-full rounded-lg border border-border bg-white px-3 py-2 text-xs leading-relaxed text-zinc-800" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => set({ nda: { text: ndaTemplate(value.name) } })} className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:underline">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Start again from the template
              </button>
              <span className="text-[11px] text-zinc-500">{value.nda.text.trim().length.toLocaleString()} / {BRAND_LIMITS.ndaMax.toLocaleString()}</span>
            </div>
            <p className="text-[11px] text-zinc-500">
              A plain-English starting point, not legal advice: have the brand or your institution check the wording. Learners sign by typing their full name and ticking a box; the exact text they agreed to is kept with their signature. If you change it, learners sign the new version.
            </p>
            {savedLessonId && <Signatures lessonId={savedLessonId} />}
          </>
        )}
      </div>

      {(value.name.trim() || value.logoUrl || value.bannerUrl) && (
        <div>
          <p className="mb-1 text-xs font-semibold text-zinc-600">How learners see it</p>
          <BrandHeader brand={cleanBrand(value)} />
        </div>
      )}
    </div>
  );
}
