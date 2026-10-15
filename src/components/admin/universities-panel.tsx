"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, ImagePlus, Loader2, Pencil, Plus, Radio, Trash2, X } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { refreshBranding } from "@/lib/branding-client";

/**
 * For super admins: the universities on the platform, and which one the public
 * pages show. Switching the public partner changes the "In association with"
 * name and logo on the landing page and every sign-in page at once, for
 * pitching to a new university. Signed-in members always see their own.
 */
type UniversityRow = {
  id: number; name: string; shortName: string; domains: string[]; logoUrl: string | null;
  people: number; pending: number; courses: number;
};
type Draft = { id: number | null; name: string; shortName: string; domains: string; logo: string | null | undefined; preview: string | null };

const EMPTY: Draft = { id: null, name: "", shortName: "", domains: "", logo: undefined, preview: null };
const inputClass = "focus-ring h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900";

export function UniversitiesPanel({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<UniversityRow[] | null>(null);
  const [publicPartnerId, setPublicPartnerId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    fetch("/api/admin/universities/", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { universities?: UniversityRow[]; publicPartnerId?: number | null } | null) => {
        setRows(data?.universities ?? []);
        setPublicPartnerId(data?.publicPartnerId ?? null);
      })
      .catch(() => setRows([]));
  useEffect(() => { void load(); }, []);

  const changed = (text: string) => {
    setNote({ ok: true, text });
    refreshBranding();
    onChanged?.();
    void load();
  };

  async function send(method: "POST" | "PATCH" | "DELETE" | "PUT", body: Record<string, unknown>) {
    const res = await fetch("/api/admin/universities/", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "That change couldn't be saved.");
  }

  async function switchPublicPartner(id: number | null) {
    setNote(null);
    try {
      await send("PUT", { publicPartnerId: id });
      const name = rows?.find((r) => r.id === id)?.name;
      changed(name ? `The public pages now show "In association with ${name}".` : "The public pages no longer show a partner.");
    } catch (error) {
      setNote({ ok: false, text: (error as Error).message });
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setNote(null);
    try {
      const body = { id: draft.id ?? undefined, name: draft.name, shortName: draft.shortName, domains: draft.domains, ...(draft.logo !== undefined ? { logo: draft.logo } : {}) };
      await send(draft.id ? "PATCH" : "POST", body);
      changed(draft.id ? `${draft.name} was updated.` : `${draft.name} was added.`);
      setDraft(null);
    } catch (error) {
      setNote({ ok: false, text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: UniversityRow) {
    if (!window.confirm(`Remove ${row.name}? Its ${row.people} people and ${row.courses} courses stay on the platform without a university, and its admins become students.`)) return;
    try {
      await send("DELETE", { id: row.id });
      changed(`${row.name} was removed.`);
    } catch (error) {
      setNote({ ok: false, text: (error as Error).message });
    }
  }

  function pickLogo(file: File | undefined) {
    if (!file || !draft) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setNote({ ok: false, text: "Use a PNG, JPEG or WebP image for the logo." }); return; }
    if (file.size > 512 * 1024) { setNote({ ok: false, text: "The logo is too large. Keep it under 512 KB." }); return; }
    const reader = new FileReader();
    reader.onload = () => { const url = String(reader.result); setDraft((d) => (d ? { ...d, logo: url, preview: url } : d)); };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      {/* The pitch switch */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-1.5"><Radio className="h-4 w-4 text-primary" aria-hidden="true" /></div>
          <CardTitle>Partner on the public pages</CardTitle>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          The university named &quot;In association with&quot; on the landing page and the sign-in pages, with its logo. Switch it when pitching to a new university. Signed-in members always see their own university.
        </p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Partner on the public pages">
          {(rows ?? []).map((row) => (
            <button
              key={row.id} type="button" role="radio" aria-checked={publicPartnerId === row.id} onClick={() => switchPublicPartner(row.id)}
              className={cn("focus-ring flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition", publicPartnerId === row.id ? "border-primary bg-primary/5 text-zinc-900 ring-2 ring-primary/20" : "border-zinc-200 text-zinc-700 hover:border-zinc-300")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {row.logoUrl ? <img src={row.logoUrl} alt="" className="h-6 w-6 object-contain" /> : <Building2 className="h-5 w-5 text-zinc-400" aria-hidden="true" />}
              {row.shortName}
            </button>
          ))}
          <button
            type="button" role="radio" aria-checked={publicPartnerId === null} onClick={() => switchPublicPartner(null)}
            className={cn("focus-ring rounded-xl border px-3 py-2 text-sm transition", publicPartnerId === null ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-zinc-200 text-zinc-600 hover:border-zinc-300")}
          >
            No partner
          </button>
        </div>
      </Card>

      {note && <p role={note.ok ? "status" : "alert"} className={cn("rounded-lg px-3 py-2 text-xs", note.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{note.text}</p>}

      {/* The universities */}
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <CardTitle>Universities</CardTitle>
          {!draft && (
            <button type="button" onClick={() => setDraft({ ...EMPTY })} className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />Add university
            </button>
          )}
        </div>

        {draft && (
          <div className="mb-4 space-y-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-900">{draft.id ? `Edit ${draft.name}` : "New university"}</p>
              <button type="button" onClick={() => setDraft(null)} aria-label="Cancel" className="focus-ring rounded-md p-1 text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-zinc-700">Full name
                <input className={cn(inputClass, "mt-1")} value={draft.name} maxLength={120} placeholder="e.g. Milwaukee School of Engineering" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label className="block text-xs font-medium text-zinc-700">Short name
                <input className={cn(inputClass, "mt-1")} value={draft.shortName} maxLength={40} placeholder="e.g. MSOE" onChange={(e) => setDraft({ ...draft, shortName: e.target.value })} />
              </label>
            </div>
            <label className="block text-xs font-medium text-zinc-700">Email domains
              <input className={cn(inputClass, "mt-1")} value={draft.domains} placeholder="e.g. msoe.edu" onChange={(e) => setDraft({ ...draft, domains: e.target.value })} />
              <span className="mt-1 block font-normal text-zinc-500">People who sign up with these email domains join this university straight away. Separate several with commas.</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-zinc-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {draft.preview ? <img src={draft.preview} alt="Logo preview" className="h-12 w-12 object-contain" /> : <Building2 className="h-6 w-6 text-zinc-300" aria-hidden="true" />}
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700">
                <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />{draft.preview ? "Change logo" : "Upload logo"}
              </button>
              {draft.preview && (
                <button type="button" onClick={() => setDraft({ ...draft, logo: null, preview: null })} className="focus-ring text-xs font-medium text-red-700 hover:underline">Remove logo</button>
              )}
              <span className="text-[11px] text-zinc-500">PNG, JPEG or WebP, up to 512 KB. A square logo works best.</span>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className="focus-ring rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700">Cancel</button>
              <button type="button" disabled={saving || draft.name.trim().length < 3} onClick={save} className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}{draft.id ? "Save changes" : "Add university"}
              </button>
            </div>
          </div>
        )}

        {!rows ? (
          <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-4 text-center text-sm text-zinc-500">No universities yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {row.logoUrl ? <img src={row.logoUrl} alt="" className="h-8 w-8 object-contain" /> : <Building2 className="h-5 w-5 text-zinc-300" aria-hidden="true" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{row.name} <span className="font-normal text-zinc-500">· {row.shortName}</span></p>
                  <p className="text-xs text-zinc-500">
                    {row.domains.length ? row.domains.map((d) => `@${d}`).join(", ") : "No email domain"} · {row.people} people{row.pending ? ` (${row.pending} waiting)` : ""} · {row.courses} courses
                  </p>
                </div>
                <button type="button" onClick={() => setDraft({ id: row.id, name: row.name, shortName: row.shortName === row.name ? "" : row.shortName, domains: row.domains.join(", "), logo: undefined, preview: row.logoUrl })} className="focus-ring inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700">
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit
                </button>
                <button type="button" onClick={() => remove(row)} className="focus-ring inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
