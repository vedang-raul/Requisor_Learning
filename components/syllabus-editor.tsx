"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Eye, FileText, Loader2, Pencil, Plus, ScrollText, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SyllabusView } from "@/components/syllabus-view";
import { MAX_RESOURCE_FILE_BYTES } from "@/lib/resource-files";
import { blankSyllabus, gradingShares, syllabusHasContent, type Syllabus, type SyllabusTemplate } from "@/lib/syllabus";
import type { Course } from "@/lib/types";

/**
 * The tutor's syllabus panel for a course. Two ways to provide one:
 *  - fill in the template (the sections of a standard university syllabus), or
 *  - upload their own Word or PDF document.
 * Either replaces the other; learners see whichever is saved.
 */

const input = "focus-ring w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400";
const area = `${input} min-h-[84px] leading-relaxed`;

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-2xl border border-border bg-white p-4">
      <legend className="px-1 text-sm font-semibold text-zinc-900">{title}</legend>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      {children}
    </fieldset>
  );
}
function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-zinc-600">{text}<div className="mt-1">{children}</div></label>;
}
function RemoveRow({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} aria-label={label} className="focus-ring shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>;
}
function AddRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"><Plus className="h-3.5 w-3.5" />{children}</button>;
}

/** A list of one-line entries (books, modules, program outcomes…). */
function Lines({ items, onChange, placeholder, add, numbered }: { items: string[]; onChange: (next: string[]) => void; placeholder: string; add: string; numbered?: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          {numbered && <span className="w-20 shrink-0 text-xs font-medium text-zinc-500">{numbered} {i + 1}</span>}
          <input className={input} value={item} maxLength={600} placeholder={placeholder} onChange={(e) => onChange(items.map((v, j) => (j === i ? e.target.value : v)))} />
          <RemoveRow onClick={() => onChange(items.filter((_, j) => j !== i))} label={`Remove ${numbered ?? "line"} ${i + 1}`} />
        </div>
      ))}
      <AddRow onClick={() => onChange([...items, ""])}>{add}</AddRow>
    </div>
  );
}

function TemplateForm({ draft, setDraft }: { draft: SyllabusTemplate; setDraft: (next: SyllabusTemplate) => void }) {
  const set = <K extends keyof SyllabusTemplate>(key: K, value: SyllabusTemplate[K]) => setDraft({ ...draft, [key]: value });
  const { total, shares } = gradingShares(draft.grading);
  return (
    <div className="space-y-4">
      <Group title="Course information">
        <div className="grid gap-3 sm:grid-cols-2">
          <Label text="Course number"><input className={input} value={draft.courseCode} maxLength={40} placeholder="e.g. BUS 6151" onChange={(e) => set("courseCode", e.target.value)} /></Label>
          <Label text="Credits"><input className={input} value={draft.credits} maxLength={20} placeholder="e.g. 3" onChange={(e) => set("credits", e.target.value)} /></Label>
        </div>
        <Label text="Course description"><textarea className={area} value={draft.description} maxLength={6000} placeholder="What students learn in this course, and why it matters." onChange={(e) => set("description", e.target.value)} /></Label>
        <Label text="Pre-requisite courses"><input className={input} value={draft.prerequisites} maxLength={600} placeholder="None" onChange={(e) => set("prerequisites", e.target.value)} /></Label>
      </Group>

      <Group title="Course outcomes" hint="What students will be able to do by the end, and how each outcome is assessed.">
        {draft.outcomes.map((row, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="grid flex-1 gap-2 sm:grid-cols-[3fr_2fr]">
              <input className={input} value={row.outcome} maxLength={600} placeholder="e.g. Select appropriate visualizations for diverse data and audiences." onChange={(e) => set("outcomes", draft.outcomes.map((r, j) => (j === i ? { ...r, outcome: e.target.value } : r)))} />
              <input className={input} value={row.assessments} maxLength={200} placeholder="Assessed by, e.g. Knowledge checks, assignments" onChange={(e) => set("outcomes", draft.outcomes.map((r, j) => (j === i ? { ...r, assessments: e.target.value } : r)))} />
            </div>
            <RemoveRow onClick={() => set("outcomes", draft.outcomes.filter((_, j) => j !== i))} label={`Remove outcome ${i + 1}`} />
          </div>
        ))}
        <AddRow onClick={() => set("outcomes", [...draft.outcomes, { outcome: "", assessments: "" }])}>Add an outcome</AddRow>
        <p className="pt-1 text-xs font-medium text-zinc-600">Program outcomes (optional)</p>
        <Lines items={draft.programOutcomes} onChange={(next) => set("programOutcomes", next)} placeholder="An outcome of the wider program this course supports" add="Add a program outcome" />
      </Group>

      <Group title="Text and resource list">
        <p className="text-xs font-medium text-zinc-600">Required books</p>
        <Lines items={draft.requiredTexts} onChange={(next) => set("requiredTexts", next)} placeholder="Author (year). Title. Publisher." add="Add a book" />
        <Label text="Additional required resources"><textarea className={area} value={draft.additionalResources} maxLength={6000} placeholder="Articles, videos, tools or software students need." onChange={(e) => set("additionalResources", e.target.value)} /></Label>
      </Group>

      <Group title="Course structure" hint="The pattern each module follows.">
        <Lines items={draft.structure} onChange={(next) => set("structure", next)} placeholder="e.g. Readings: relevant texts to deepen knowledge." add="Add a step" />
      </Group>

      <Group title="Outline of course" hint="One line per module or week, in order. Started from your course's sections and lessons.">
        <Lines items={draft.outline} onChange={(next) => set("outline", next)} placeholder="Module title" add="Add a module" numbered="Module" />
      </Group>

      <Group title="Grading" hint="Points for each kind of work. The percentage is worked out for you.">
        {draft.grading.map((row, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <input className={input} value={row.type} maxLength={200} placeholder="Assignment type, e.g. Discussions" onChange={(e) => set("grading", draft.grading.map((r, j) => (j === i ? { ...r, type: e.target.value } : r)))} />
              <input className={`${input} w-24 text-right tabular-nums`} type="number" min={0} aria-label={`Points for ${row.type || "this type"}`} placeholder="Points" value={row.points || ""} onChange={(e) => set("grading", draft.grading.map((r, j) => (j === i ? { ...r, points: Math.max(0, Number(e.target.value) || 0) } : r)))} />
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-zinc-500">{shares[i]}</span>
              <RemoveRow onClick={() => set("grading", draft.grading.filter((_, j) => j !== i))} label={`Remove ${row.type || "grading row"}`} />
            </div>
            <textarea className={`${input} min-h-[56px]`} value={row.description} maxLength={6000} placeholder="What this kind of work involves (optional)" onChange={(e) => set("grading", draft.grading.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)))} />
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AddRow onClick={() => set("grading", [...draft.grading, { type: "", points: 0, description: "" }])}>Add an assignment type</AddRow>
          <span className="text-sm font-semibold tabular-nums text-zinc-800">Total: {total} points</span>
        </div>
        <p className="pt-1 text-xs font-medium text-zinc-600">Grading scale</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {draft.gradingScale.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={`${input} w-16`} value={row.letter} maxLength={10} aria-label={`Letter ${i + 1}`} placeholder="A" onChange={(e) => set("gradingScale", draft.gradingScale.map((r, j) => (j === i ? { ...r, letter: e.target.value } : r)))} />
              <input className={input} value={row.range} maxLength={60} aria-label={`Range for ${row.letter || "letter"}`} placeholder="93% +" onChange={(e) => set("gradingScale", draft.gradingScale.map((r, j) => (j === i ? { ...r, range: e.target.value } : r)))} />
              <RemoveRow onClick={() => set("gradingScale", draft.gradingScale.filter((_, j) => j !== i))} label={`Remove grade ${row.letter}`} />
            </div>
          ))}
        </div>
        <AddRow onClick={() => set("gradingScale", [...draft.gradingScale, { letter: "", range: "" }])}>Add a grade</AddRow>
      </Group>

      <Group title="Policies and support" hint="Write your own or paste your institution's wording. Sections left empty are not shown to students.">
        {draft.policies.map((row, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <input className={`${input} font-medium`} value={row.title} maxLength={200} placeholder="Policy title" onChange={(e) => set("policies", draft.policies.map((r, j) => (j === i ? { ...r, title: e.target.value } : r)))} />
              <RemoveRow onClick={() => set("policies", draft.policies.filter((_, j) => j !== i))} label={`Remove ${row.title || "policy"}`} />
            </div>
            <textarea className={area} value={row.text} maxLength={6000} placeholder="The policy, in your words." onChange={(e) => set("policies", draft.policies.map((r, j) => (j === i ? { ...r, text: e.target.value } : r)))} />
          </div>
        ))}
        <AddRow onClick={() => set("policies", [...draft.policies, { title: "", text: "" }])}>Add a policy</AddRow>
      </Group>
    </div>
  );
}

/** Keeps the starter headings (empty policies, grading rows) available when re-opening a saved template. */
function draftFrom(course: Course): SyllabusTemplate {
  const blank = blankSyllabus(course);
  const saved = course.syllabus?.kind === "template" ? course.syllabus : null;
  if (!saved) return blank;
  const have = new Set(saved.policies.map((policy) => policy.title.toLowerCase()));
  return { ...saved, policies: [...saved.policies, ...blank.policies.filter((policy) => !have.has(policy.title.toLowerCase()))] };
}

export function SyllabusPanel({ course, onSaved }: { course: Course; onSaved: (syllabus: Syllabus | null) => void }) {
  const syllabus = course.syllabus ?? null;
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState<SyllabusTemplate>(() => draftFrom(course));
  const [busy, setBusy] = useState<false | "save" | "upload" | "remove">(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const unsaved = course.revision == null; // a brand-new course has no row to attach a syllabus to yet

  async function save(next: Syllabus | null, kind: "save" | "upload" | "remove"): Promise<boolean> {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch("/api/tutor/courses/syllabus", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: course.slug, syllabus: next }) });
      const data = (await res.json().catch(() => ({}))) as { syllabus?: Syllabus | null; error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't save the syllabus.");
      onSaved(data.syllabus ?? null);
      setSavedNote(kind === "remove" ? "Syllabus removed." : "Syllabus saved. Students can open it from the course page.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the syllabus.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError(null);
    setSavedNote(null);
    if (!/\.(pdf|docx)$/i.test(file.name)) { setError("Choose a PDF or Word (.docx) file."); return; }
    if (file.size > MAX_RESOURCE_FILE_BYTES) { setError("The syllabus file can be up to 10 MB."); return; }
    if (syllabus?.kind === "template" && !window.confirm("Replace the filled-in syllabus with this file? Students will see the file instead.")) return;
    setBusy("upload");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the file."));
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/tutor/resources-files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, dataUrl }) });
      const data = (await res.json().catch(() => ({}))) as { url?: string; filename?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't upload the file.");
      await save({ kind: "file", fileUrl: data.url, fileName: data.filename ?? file.name, updatedAt: new Date().toISOString() }, "upload");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload the file.");
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (syllabus?.kind === "file" && !window.confirm("Replace the uploaded syllabus file with this filled-in one? Students will see this instead.")) return;
    if (await save(draft, "save")) { setEditing(false); setPreview(false); }
  }

  const has = syllabusHasContent(syllabus);
  const updated = syllabus ? new Date(syllabus.updatedAt).toLocaleDateString() : null;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><ScrollText className="h-4 w-4 text-primary" />Syllabus</p>
        {has
          ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{syllabus?.kind === "file" ? `File: ${syllabus.fileName}` : "Filled in"} · {updated}</span>
          : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">No syllabus yet</span>}
      </div>
      <p className="text-sm text-zinc-600">Every course should have a syllabus. Fill in the template, or upload your own as a PDF or Word file. Students open it from the course page.</p>

      {unsaved ? (
        <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600">Save the course first, then add its syllabus.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => { setDraft(draftFrom(course)); setSavedNote(null); setError(null); setEditing(true); }} disabled={Boolean(busy)}>
            <Pencil className="h-3.5 w-3.5" />{syllabus?.kind === "template" ? "Edit the syllabus" : "Fill in the template"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
            {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{syllabus?.kind === "file" ? "Replace the file" : "Upload a PDF or Word file"}
          </Button>
          <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
          {has && <Button type="button" size="sm" variant="ghost" onClick={() => setPreview(true)}><Eye className="h-3.5 w-3.5" />View as a student</Button>}
          {syllabus && <Button type="button" size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Remove this course's syllabus?")) void save(null, "remove"); }}><Trash2 className="h-3.5 w-3.5 text-red-600" />Remove</Button>}
        </div>
      )}
      {error && !editing && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {savedNote && !editing && <p role="status" className="text-sm text-emerald-700">{savedNote}</p>}

      {/* student view of what is saved */}
      {preview && !editing && syllabus && (
        <div role="dialog" aria-modal="true" aria-label="Syllabus preview" className="fixed inset-0 z-[90] overflow-y-auto bg-black/40 p-3 sm:p-6" onClick={() => setPreview(false)}>
          <div className="mx-auto max-w-3xl rounded-2xl bg-white p-5 shadow-xl sm:p-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex justify-end"><Button type="button" size="sm" variant="outline" onClick={() => setPreview(false)}><X className="h-4 w-4" />Close</Button></div>
            <SyllabusView syllabus={syllabus} courseTitle={course.title} />
          </div>
        </div>
      )}

      {/* the template, over the page */}
      {editing && (
        <div role="dialog" aria-modal="true" aria-label="Fill in the syllabus" className="fixed inset-0 z-[90] overflow-y-auto bg-background">
          <div className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-900"><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">Syllabus · {course.title}</span></p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setPreview((on) => !on)}><Eye className="h-3.5 w-3.5" />{preview ? "Back to editing" : "Preview"}</Button>
                <Button type="button" size="sm" onClick={() => void saveTemplate()} disabled={Boolean(busy)}>{busy === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save syllabus</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setPreview(false); setError(null); }}><X className="h-4 w-4" />Close</Button>
              </div>
            </div>
          </div>
          <div className="mx-auto max-w-4xl space-y-4 px-4 py-5">
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {preview
              ? <div className="rounded-2xl border border-border bg-white p-5 sm:p-8"><SyllabusView syllabus={{ ...draft, outcomes: draft.outcomes.filter((r) => r.outcome.trim()), policies: draft.policies.filter((r) => r.title.trim() && r.text.trim()), grading: draft.grading.filter((r) => r.type.trim()), programOutcomes: draft.programOutcomes.filter(Boolean), requiredTexts: draft.requiredTexts.filter(Boolean), structure: draft.structure.filter(Boolean), outline: draft.outline.filter(Boolean), gradingScale: draft.gradingScale.filter((r) => r.letter.trim() && r.range.trim()) }} courseTitle={course.title} /></div>
              : <TemplateForm draft={draft} setDraft={setDraft} />}
          </div>
        </div>
      )}
    </div>
  );
}
