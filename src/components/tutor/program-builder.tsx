"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, BookOpenCheck, Check, Copy, Download, FileText, Link2, Loader2, Printer, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { DATA_CHANGED_EVENT } from "@/components/assistant/assistant-action-card";
import { DEFAULT_COURSE_ICON, getCategoryCover } from "@/components/course/category-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import type { Course } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isPreviewUrl, PREVIEW_LINK_DAYS, previewModuleChoices } from "@/lib/courses/preview-modules";
import type { MyPreviewLink, PreviewLinkSummary } from "@/lib/courses/preview-links";
import { DEFAULT_PROGRAM_DOC_STYLE, DOC_THEMES, loadDocStyle, logoSource, MAX_LOGO_BYTES, saveDocStyle, type ProgramDocStyle } from "@/lib/courses/program-doc-style";
import {
  analyzeTranscript, BLUEPRINT_LABEL, blueprintSlug, buildProposal, composeCurriculum, curriculumFromCourse, curriculumToCourse, EMPTY_DISCOVERY, FORMATS, INDUSTRIES, LEVELS, MODULE_COUNTS,
  PROGRAM_COMMAND_EVENT, PROGRAM_DRAFT_KEY, programStorageKey, sampleDiscovery, takeProgramCommand,
  type Curriculum, type Discovery, type Industry, type Level, type Proposal,
} from "@/lib/courses/program-builder";

/**
 * Program Builder: employer need → curriculum → priced proposal.
 *   1. Discovery   paste a discovery-call transcript or fill the fields
 *   2. Curriculum  generated in the standard shape; every line is click-to-edit. The first one
 *                  is saved as a draft "Curriculum Blueprint" course in the tutor's courses, and
 *                  can be downloaded as a PDF
 *   3. Proposal    assembled from the curriculum as edited; fill in pricing and export as PDF
 * The AI assistant can drive all three steps: it sends commands (see src/lib/courses/program-builder.ts)
 * that fill the discovery fields, generate the curriculum and assemble the proposal.
 */
type Step = 1 | 2 | 3;
type Notice = { kind: "ok" | "warn"; text: string } | null;

const selectClass = "focus-ring h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-zinc-900 transition-colors hover:border-zinc-300";

/** Text that can be edited in place. The change is kept when the field loses focus. */
function Editable({ value, onChange, as = "span", className, label, multiline = false }: {
  value: string; onChange: (next: string) => void; as?: "span" | "p" | "h1" | "h4" | "div" | "li" | "td" | "b";
  className?: string; label: string; multiline?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  // Follow changes made elsewhere (a regenerate, the assistant) unless the user is typing here.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) el.textContent = value;
  }, [value]);
  return createElement(as, {
    ref,
    contentEditable: true,
    suppressContentEditableWarning: true,
    role: "textbox",
    "aria-label": label,
    "aria-multiline": multiline,
    spellCheck: true,
    onBlur: (event: { currentTarget: HTMLElement }) => {
      const next = (event.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim();
      if (next !== value) onChange(next);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" && !(multiline && event.shiftKey)) { event.preventDefault(); event.currentTarget.blur(); }
    },
    onPaste: (event: React.ClipboardEvent<HTMLElement>) => {
      // Keep pasted text plain.
      event.preventDefault();
      document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    },
    className: cn("rounded-sm outline-none outline-offset-2 transition hover:outline-dashed hover:outline-1 hover:outline-primary/50 focus:bg-primary/5 focus:outline focus:outline-2 focus:outline-primary", className),
  }, value);
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="mb-1 mt-3 block text-xs font-semibold text-zinc-600">{children}</label>;
}

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p role="status" className={cn("mt-3 rounded-lg border px-3 py-2 text-[13px]", notice.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
      {notice.text}
    </p>
  );
}

// ── The proposal document, as shown on screen (editable) and as printed ─────
/** How the downloaded documents look: the accent colour and the logo (null for none). */
type DocLook = { accent: string; logo: string | null };
const lookStyle = (look: DocLook) => ({ "--doc-accent": look.accent }) as React.CSSProperties;
function DocLogo({ look }: { look: DocLook }) {
  // eslint-disable-next-line @next/next/no-img-element
  return look.logo ? <img src={look.logo} alt="" className="mb-4 max-h-12 max-w-[14rem] object-contain" /> : null;
}

function ProposalDocument({ proposal, onChange, printing = false, look }: { proposal: Proposal; onChange?: (next: Proposal) => void; printing?: boolean; look: DocLook }) {
  const set = <K extends keyof Proposal>(key: K, value: Proposal[K]) => onChange?.({ ...proposal, [key]: value });
  // On screen every line is editable; the printed copy is the same text, plain.
  const E = ({ value, onEdit, as = "span", className, label, multiline }: { value: string; onEdit: (next: string) => void; as?: "span" | "p" | "h4" | "div" | "li" | "td" | "b"; className?: string; label: string; multiline?: boolean }) =>
    printing ? createElement(as, { className }, value) : <Editable value={value} onChange={onEdit} as={as} className={className} label={label} multiline={multiline} />;
  const heading = "mb-2 mt-6 text-[15px] font-semibold text-[color:var(--doc-accent)]";

  return (
    <article id={printing ? undefined : "program-proposal"} style={lookStyle(look)} className={cn("bg-white text-zinc-900", printing ? "p-2" : "mx-auto max-w-[860px] rounded border border-zinc-200 px-6 py-10 shadow-soft sm:px-14 sm:py-12")}>
      <DocLogo look={look} />
      <header className="mb-6 flex flex-col gap-4 border-b-[3px] border-[color:var(--doc-accent)] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] text-[color:var(--doc-accent)]">CUSTOM TRAINING PROPOSAL</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">{proposal.title}</h1>
        </div>
        <div className="text-[12.5px] text-zinc-600 sm:text-right">
          <span className="block">Prepared for {E({ value: proposal.employer, onEdit: (v) => set("employer", v), as: "b", className: "text-zinc-900", label: "Employer" })}</span>
          {E({ value: proposal.date, onEdit: (v) => set("date", v), className: "block", label: "Date" })}
          {E({ value: proposal.preparedBy, onEdit: (v) => set("preparedBy", v), className: "block", label: "Prepared by" })}
          {E({ value: proposal.platform, onEdit: (v) => set("platform", v), className: "block", label: "Platform line" })}
        </div>
      </header>

      <h2 className={heading}>Need identified</h2>
      {E({ value: proposal.need, onEdit: (v) => set("need", v), as: "p", className: "text-sm leading-relaxed", label: "Need identified", multiline: true })}

      <h2 className={heading}>Program description</h2>
      {E({ value: proposal.description, onEdit: (v) => set("description", v), as: "p", className: "text-sm leading-relaxed", label: "Program description", multiline: true })}

      <h2 className={heading}>Learning outcomes</h2>
      <ul className="ml-5 list-disc space-y-1 text-sm">
        {proposal.outcomes.map((outcome, i) => (
          <li key={i}>{E({ value: outcome, onEdit: (v) => set("outcomes", proposal.outcomes.map((o, j) => (j === i ? v : o))), label: `Outcome ${i + 1}`, multiline: true })}</li>
        ))}
      </ul>

      <h2 className={heading}>Curriculum</h2>
      <div className="space-y-3">
        {proposal.modules.map((module, i) => (
          <div key={i}>
            {E({ value: module.title, onEdit: (v) => set("modules", proposal.modules.map((m, j) => (j === i ? { ...m, title: v } : m))), as: "h4", className: "text-sm font-semibold text-zinc-900", label: `Module ${i + 1} title` })}
            {E({ value: module.summary, onEdit: (v) => set("modules", proposal.modules.map((m, j) => (j === i ? { ...m, summary: v } : m))), as: "div", className: "text-[13px] text-zinc-600", label: `Module ${i + 1} contents`, multiline: true })}
          </div>
        ))}
      </div>

      {proposal.preview && isPreviewUrl(proposal.preview.url) && (
        <>
          <h2 className={heading}>Preview the course</h2>
          <p className="text-sm leading-relaxed">
            See the selected modules for yourself, no account needed:{" "}
            <a href={proposal.preview.url} className="break-all font-semibold text-[color:var(--doc-accent)] underline">{proposal.preview.url}</a>
          </p>
          <p className="mt-1 text-xs text-zinc-600">The link is available until {proposal.preview.until}.</p>
        </>
      )}

      <h2 className={heading}>Delivery &amp; measurement</h2>
      {E({ value: proposal.delivery, onEdit: (v) => set("delivery", v), as: "p", className: "text-sm leading-relaxed", label: "Delivery", multiline: true })}
      <ul className="ml-5 mt-2 list-disc space-y-1 text-sm">
        {proposal.deliveryPoints.map((point, i) => (
          <li key={i}>{E({ value: point, onEdit: (v) => set("deliveryPoints", proposal.deliveryPoints.map((p, j) => (j === i ? v : p))), label: `Delivery point ${i + 1}`, multiline: true })}</li>
        ))}
      </ul>

      <h2 className={heading}>Investment</h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-zinc-200 text-left text-xs tracking-wide text-zinc-600">
            <th className="w-[55%] px-2.5 py-2 font-semibold">Item</th>
            <th className="px-2.5 py-2 font-semibold">Basis</th>
            <th className="px-2.5 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {proposal.pricing.map((row, i) => {
            const edit = (key: "item" | "basis" | "amount") => (v: string) => set("pricing", proposal.pricing.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
            return (
              <tr key={i} className="border-b border-zinc-200">
                {E({ value: row.item, onEdit: edit("item"), as: "td", className: "px-2.5 py-2", label: `Pricing item ${i + 1}` })}
                {E({ value: row.basis, onEdit: edit("basis"), as: "td", className: "px-2.5 py-2", label: `Pricing basis ${i + 1}` })}
                {E({ value: row.amount, onEdit: edit("amount"), as: "td", className: "px-2.5 py-2 text-right", label: `Pricing amount ${i + 1}` })}
              </tr>
            );
          })}
          <tr className="border-t-2 border-zinc-900 font-bold">
            <td className="px-2.5 py-2">Total — first cohort</td>
            <td />
            {E({ value: proposal.total, onEdit: (v) => set("total", v), as: "td", className: "px-2.5 py-2 text-right", label: "Total amount" })}
          </tr>
        </tbody>
      </table>
      {E({ value: proposal.pricingNote, onEdit: (v) => set("pricingNote", v), as: "p", className: "mt-2 text-xs text-zinc-600", label: "Pricing note", multiline: true })}

      <footer className="mt-8 flex justify-between border-t border-zinc-200 pt-4 text-xs text-zinc-600">
        <span>Generated with the Alma 41 Program Builder</span>
        <span>{proposal.date}</span>
      </footer>
    </article>
  );
}

// ── Preview link for the proposal's readers ────────────────────────────────
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
/** Fired when a preview link is made or turned off, so every list on the page reloads. */
const LINKS_CHANGED = "program-builder:preview-links-changed";
const linksChanged = () => window.dispatchEvent(new Event(LINKS_CHANGED));

/**
 * The tutor picks modules of the course and gets a link (/p/<code>) that shows
 * only those, without signing in, for PREVIEW_LINK_DAYS days. The newest link
 * goes into the proposal; earlier ones are listed to revoke.
 */
function PreviewLinkPanel({ course, proposal, onChange, label }: { course: Course; proposal: Proposal; onChange: (next: Proposal) => void; label: string }) {
  const choices = useMemo(() => previewModuleChoices(course), [course]);
  const [picked, setPicked] = useState<string[]>(() => choices.slice(0, 1).map((c) => c.key));
  const [links, setLinks] = useState<PreviewLinkSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Notice>(null);
  const [copied, setCopied] = useState(false);
  const api = `/api/tutor/preview-links?course=${encodeURIComponent(course.slug)}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(api, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { links?: PreviewLinkSummary[] };
      setLinks(res.ok ? data.links ?? [] : []);
    } catch { setLinks([]); }
  }, [api]);
  useEffect(() => {
    void load();
    const reload = () => void load();
    window.addEventListener(LINKS_CHANGED, reload);
    return () => window.removeEventListener(LINKS_CHANGED, reload);
  }, [load]);

  const toggle = (key: string) => setPicked((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));

  async function create() {
    setBusy(true); setNote(null);
    try {
      const res = await fetch("/api/tutor/preview-links", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course: course.slug, modules: picked, label }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; link?: PreviewLinkSummary; error?: string };
      if (!res.ok || !data.token || !data.link) { setNote({ kind: "warn", text: data.error ?? "Couldn't make the link. Try again." }); return; }
      onChange({ ...proposal, preview: { id: data.link.id, url: `${window.location.origin}/p/${data.token}`, until: fmtDate(data.link.expiresAt) } });
      setNote({ kind: "ok", text: "Link made and added to the proposal. Copy it now: for safety it can't be shown again later." });
      linksChanged();
    } catch {
      setNote({ kind: "warn", text: "Couldn't make the link. Check your connection and try again." });
    } finally { setBusy(false); }
  }

  async function revoke(id: number) {
    if (!window.confirm("Turn this link off? Anyone who has it will no longer be able to open the preview.")) return;
    const res = await fetch(`${api}&id=${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { setNote({ kind: "warn", text: "Couldn't turn the link off. Try again." }); return; }
    if (proposal.preview?.id === id) onChange({ ...proposal, preview: undefined });
    setNote({ kind: "ok", text: "Link turned off." });
    linksChanged();
  }

  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: the link is selectable */ }
  }

  const current = proposal.preview && isPreviewUrl(proposal.preview.url) ? proposal.preview : null;
  return (
    <Card className="p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><Link2 className="h-4 w-4 text-primary" aria-hidden="true" />Preview link for the proposal&apos;s readers</p>
      <p className="mt-0.5 text-[13px] text-zinc-600">
        Readers open it without an account and see only the modules you tick (their published lessons); the other modules show as locked titles.
        Nothing else from your course or the site is shown. It works for {PREVIEW_LINK_DAYS} days, or until you turn it off.
      </p>
      {choices.length === 0 ? (
        <p className="mt-3 text-[13px] text-amber-700">This course has no published lessons yet, so there&apos;s nothing to preview.</p>
      ) : (
        <>
          <fieldset className="mt-3 grid gap-1.5 sm:grid-cols-2">
            <legend className="sr-only">Modules readers can open</legend>
            {choices.map((c, i) => (
              <label key={c.key} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[13px] transition", picked.includes(c.key) ? "border-primary/40 bg-primary/5" : "border-zinc-200 hover:border-zinc-300")}>
                <input type="checkbox" className="mt-0.5 accent-[color:var(--color-primary,#0f766e)]" checked={picked.includes(c.key)} onChange={() => toggle(c.key)} />
                <span><span className="font-semibold text-zinc-900">Module {i + 1}: {c.title}</span><span className="block text-zinc-500">{c.lessons} lesson{c.lessons === 1 ? "" : "s"}</span></span>
              </label>
            ))}
          </fieldset>
          <Button type="button" size="sm" className="mt-3" onClick={() => void create()} disabled={busy || picked.length === 0}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}{current ? "Make a new link" : "Make preview link"}
          </Button>
        </>
      )}
      {current && (
        <div className="mt-3 flex gap-2">
          <input readOnly value={current.url} aria-label="Preview link" onFocus={(e) => e.currentTarget.select()} className="focus-ring h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-[13px] text-zinc-700" />
          <Button type="button" size="sm" variant="outline" onClick={() => void copy(current.url)}>{copied ? <><Check className="h-3.5 w-3.5" />Copied</> : <><Copy className="h-3.5 w-3.5" />Copy</>}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...proposal, preview: undefined })}>Remove from proposal</Button>
        </div>
      )}
      <NoticeBox notice={note} />
      {links && links.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-zinc-700">Links for this course ({links.length})</summary>
          <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {links.map((l) => {
              const live = !l.revoked && !l.expired;
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
                  <span className="min-w-0">
                    <span className="block font-semibold text-zinc-900">{l.label || "Untitled"}{current?.id === l.id ? " · in this proposal" : ""}</span>
                    <span className="block text-zinc-500">{l.modules.join(", ")}</span>
                    <span className="block text-zinc-500">
                      {l.revoked ? "Turned off" : l.expired ? `Expired ${fmtDate(l.expiresAt)}` : `Open until ${fmtDate(l.expiresAt)}`} · {l.views} view{l.views === 1 ? "" : "s"}
                    </span>
                  </span>
                  {live && <Button type="button" size="sm" variant="outline" onClick={() => void revoke(l.id)}>Turn off</Button>}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </Card>
  );
}

/**
 * Every preview link the tutor has made, across all their courses and
 * programs: who it was for, what it opens, whether it still works and how often
 * it was opened, with Turn off. The addresses themselves aren't kept (only their
 * hash is stored), so they can't be shown again here.
 */
function AllPreviewLinks({ onTurnedOff }: { onTurnedOff: (id: number) => void }) {
  const [links, setLinks] = useState<MyPreviewLink[] | null>(null);
  const [show, setShow] = useState<"open" | "all">("open");
  const [course, setCourse] = useState("");
  const [note, setNote] = useState<Notice>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tutor/preview-links", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { links?: MyPreviewLink[] };
      setLinks(res.ok ? data.links ?? [] : []);
    } catch { setLinks([]); }
  }, []);
  useEffect(() => {
    void load();
    const reload = () => void load();
    window.addEventListener(LINKS_CHANGED, reload);
    return () => window.removeEventListener(LINKS_CHANGED, reload);
  }, [load]);

  async function turnOff(link: MyPreviewLink) {
    if (!window.confirm(`Turn off the link for ${link.label || "this proposal"}? Anyone who has it will no longer be able to open the preview.`)) return;
    const res = await fetch(`/api/tutor/preview-links?id=${link.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { setNote({ kind: "warn", text: "Couldn't turn the link off. Try again." }); return; }
    setNote({ kind: "ok", text: "Link turned off." });
    onTurnedOff(link.id);
    linksChanged();
  }

  const isOpen = (l: MyPreviewLink) => !l.revoked && !l.expired;
  const courses = [...new Map((links ?? []).map((l) => [l.course.slug, l.course.title])).entries()];
  const shown = (links ?? []).filter((l) => (show === "all" || isOpen(l)) && (!course || l.course.slug === course));
  const openCount = (links ?? []).filter(isOpen).length;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-semibold text-zinc-900"><Link2 className="h-4 w-4 text-primary" aria-hidden="true" />All your preview links</p>
          <p className="mt-0.5 text-[13px] text-zinc-600">
            Every link you&apos;ve made for proposals, across all your courses.{links ? ` ${openCount} open, ${links.length} in total.` : ""}
          </p>
        </div>
        {links && links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {courses.length > 1 && (
              <select aria-label="Course" className={cn(selectClass, "h-9 w-auto max-w-[16rem]")} value={course} onChange={(e) => setCourse(e.target.value)}>
                <option value="">All courses</option>
                {courses.map(([slug, title]) => <option key={slug} value={slug}>{title}</option>)}
              </select>
            )}
            <div role="group" aria-label="Which links" className="inline-flex rounded-xl border border-zinc-200 p-0.5">
              {(["open", "all"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={show === v} onClick={() => setShow(v)}
                  className={cn("focus-ring rounded-lg px-3 py-1 text-[13px] font-semibold transition", show === v ? "bg-primary text-white" : "text-zinc-600 hover:text-zinc-900")}>
                  {v === "open" ? "Open" : "All"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <NoticeBox notice={note} />
      {links === null ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Loading your links…</p>
      ) : links.length === 0 ? (
        <p className="mt-4 text-[13px] text-zinc-500">No links yet. Build a program from one of your courses, create the proposal, and make a preview link there.</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 text-[13px] text-zinc-500">{show === "open" ? "No open links here. Choose All to see expired and turned-off ones." : "No links for this course."}</p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200">
          {shown.map((l) => {
            const open = isOpen(l);
            return (
              <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-900">{l.label || "Untitled"}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", open ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500")}>
                      {l.revoked ? "Turned off" : l.expired ? "Expired" : "Open"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-zinc-700"><span className="text-zinc-500">Course:</span> {l.course.title}</p>
                  <p className="text-zinc-700"><span className="text-zinc-500">Opens:</span> {l.modules.join(", ") || "—"}</p>
                  <p className="mt-0.5 text-zinc-500">
                    Made {fmtDate(l.createdAt)} · {open ? `open until ${fmtDate(l.expiresAt)}` : l.revoked ? "turned off" : `expired ${fmtDate(l.expiresAt)}`} · {l.views} view{l.views === 1 ? "" : "s"}
                    {l.lastViewedAt ? ` · last opened ${fmtDate(l.lastViewedAt)}` : ""}
                  </p>
                </div>
                {open && <Button type="button" size="sm" variant="outline" onClick={() => void turnOff(l)}>Turn off</Button>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ── The curriculum blueprint, as printed (Download PDF) ────────────────────
function BlueprintDocument({ curriculum, employer, look }: { curriculum: Curriculum; employer: string; look: DocLook }) {
  const heading = "mb-2 mt-6 text-[15px] font-semibold text-[color:var(--doc-accent)]";
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return (
    <article style={lookStyle(look)} className="bg-white p-2 text-zinc-900">
      <DocLogo look={look} />
      <header className="mb-5 border-b-[3px] border-[color:var(--doc-accent)] pb-4">
        <p className="text-xs font-bold tracking-[0.08em] text-[color:var(--doc-accent)]">{BLUEPRINT_LABEL.toUpperCase()}</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">{curriculum.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">{curriculum.description}</p>
        {employer.trim() && <p className="mt-2 text-[12.5px] text-zinc-600">Prepared for <b className="text-zinc-900">{employer.trim()}</b></p>}
      </header>
      <dl className="grid grid-cols-4 gap-2 text-sm">
        {([["Audience", curriculum.audience], ["Level", curriculum.level], ["Format", curriculum.format], ["Duration", curriculum.duration]] as const).map(([label, value]) => (
          <div key={label} className="rounded border border-zinc-200 px-2.5 py-2">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <h2 className={heading}>Learning outcomes</h2>
      <ul className="ml-5 list-disc space-y-1 text-sm">{curriculum.outcomes.map((outcome, i) => <li key={i}>{outcome}</li>)}</ul>

      <h2 className={heading}>Modules</h2>
      <div className="space-y-4">
        {curriculum.modules.map((module, i) => (
          <section key={i} className="break-inside-avoid rounded border border-zinc-200 px-4 py-3">
            <h3 className="text-[15px] font-semibold text-zinc-900">Module {i + 1}: {module.title}</h3>
            {module.description && <p className="mt-1 text-[13px] text-zinc-600">{module.description}</p>}
            <div className="mt-2 grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <p className="mb-1 text-xs font-bold text-[color:var(--doc-accent)]">SUBMODULES</p>
                <ul className="ml-4 list-disc space-y-0.5">{module.submodules.map((sub, j) => <li key={j}>{sub}</li>)}</ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold text-[color:var(--doc-accent)]">LEARNING ACTIVITIES</p>
                <ul className="ml-4 list-disc space-y-0.5">{module.activities.map((activity, j) => <li key={j}>{activity}</li>)}</ul>
              </div>
            </div>
          </section>
        ))}
      </div>

      <h2 className={heading}>Assessment &amp; evidence</h2>
      <p className="text-sm leading-relaxed">{curriculum.assessment}</p>

      <footer className="mt-8 flex justify-between border-t border-zinc-200 pt-4 text-xs text-zinc-600">
        <span>Generated with the Alma 41 Program Builder</span>
        <span>{date}</span>
      </footer>
    </article>
  );
}

/** Opens the print dialog with a file name the "Save as PDF" option will use. */
function printAsPdf(fileName: string) {
  const previous = document.title;
  document.title = fileName.replace(/[\\/:*?"<>|]+/g, " ").trim();
  const restore = () => { document.title = previous; window.removeEventListener("afterprint", restore); };
  window.addEventListener("afterprint", restore);
  window.print();
}

/** Downloads the blueprint or the proposal as a Word file. The builder is loaded only when asked for. */
async function downloadWord(doc: { curriculum: Curriculum; employer: string } | { proposal: Proposal }, fileName: string, look: DocLook) {
  const { blueprintBlocks, downloadDocx, proposalBlocks } = await import("@/lib/courses/program-docx");
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  // A logo that can't be read (for example, blocked from another site) leaves the document without one.
  const logo = look.logo ? await logoAsPng(look.logo).catch(() => null) : null;
  await downloadDocx("proposal" in doc ? proposalBlocks(doc.proposal) : blueprintBlocks(doc.curriculum, doc.employer, date), fileName, { accent: look.accent, logo });
}

/** Any image the browser can show, redrawn as a PNG (at most 600 px wide) for the Word file. */
async function logoAsPng(src: string): Promise<{ png: Uint8Array; width: number; height: number }> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  const scale = Math.min(1, 600 / Math.max(1, img.naturalWidth));
  const width = Math.max(1, Math.round((img.naturalWidth || 300) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || 100) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't read the logo.");
  return { png: new Uint8Array(await blob.arrayBuffer()), width, height };
}

/** Logo and colour for the downloaded PDF and Word files. */
function DocumentStyleControls({ style, onChange, defaultLogo }: { style: ProgramDocStyle; onChange: (next: ProgramDocStyle) => void; defaultLogo: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const logo = logoSource(style, defaultLogo);
  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { setError("Choose a PNG, JPG, WebP or SVG image."); return; }
    if (file.size > MAX_LOGO_BYTES) { setError("That logo is larger than 1 MB."); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("read")); reader.readAsDataURL(file); }).catch(() => null);
    if (!dataUrl) { setError("Couldn't read that image."); return; }
    onChange({ ...style, logo: "custom", customLogo: dataUrl });
    if (inputRef.current) inputRef.current.value = "";
  }
  const custom = !DOC_THEMES.some((t) => t.accent.toLowerCase() === style.accent.toLowerCase());
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <p className="text-sm font-semibold text-zinc-900">Document style</p>
      <p className="text-xs text-zinc-500">For the PDF and Word files only.</p>
      <div className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-3">
        <div>
          <p className="text-xs font-medium text-zinc-700">Logo</p>
          <div className="mt-1.5 flex items-center gap-2.5">
            <div className="flex h-12 w-28 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-white px-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo ? <img src={logo} alt="Document logo" className="max-h-10 max-w-full object-contain" /> : <span className="text-[11px] text-zinc-400">No logo</span>}
            </div>
            <div className="flex flex-col items-start gap-0.5 text-xs">
              <button type="button" onClick={() => inputRef.current?.click()} className="font-semibold text-primary hover:underline">{style.logo === "custom" ? "Change logo" : "Use my own logo"}</button>
              {style.logo !== "default" && <button type="button" onClick={() => onChange({ ...style, logo: "default" })} className="text-zinc-600 hover:underline">Use the platform logo</button>}
              {style.logo !== "none" && <button type="button" onClick={() => onChange({ ...style, logo: "none" })} className="text-zinc-600 hover:underline">No logo</button>}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">{style.logo === "default" ? "The platform logo your admin set." : style.logo === "custom" ? "Your own logo, in this browser." : "Documents without a logo."}</p>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
          {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-700">Colour</p>
          <div role="radiogroup" aria-label="Document colour" className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {DOC_THEMES.map((t) => {
              const on = t.accent.toLowerCase() === style.accent.toLowerCase();
              return (
                <button key={t.key} type="button" role="radio" aria-checked={on} aria-label={t.label} title={t.label} onClick={() => onChange({ ...style, accent: t.accent })}
                  className={cn("focus-ring flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 transition", on ? "ring-2 ring-zinc-900" : "hover:scale-105")}
                  style={{ background: t.accent }}>
                  {on && <Check className="h-4 w-4 text-white" aria-hidden="true" />}
                </button>
              );
            })}
            <label title="Custom colour" className={cn("relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-zinc-300 bg-white ring-offset-2", custom && "ring-2 ring-zinc-900")}>
              <span className="sr-only">Custom colour</span>
              <span aria-hidden="true" className="h-5 w-5 rounded-full" style={{ background: custom ? style.accent : "conic-gradient(#ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)" }} />
              <input type="color" value={style.accent} onChange={(e) => onChange({ ...style, accent: e.target.value.toUpperCase() })} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function WordButton({ size, onDownload }: { size?: "sm"; onDownload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Button type="button" size={size} variant="outline" disabled={busy}
        onClick={() => { setBusy(true); setFailed(false); onDownload().catch(() => setFailed(true)).finally(() => setBusy(false)); }}>
        {busy ? <Loader2 className={cn(size ? "h-3.5 w-3.5" : "h-4 w-4", "animate-spin")} /> : <FileText className={size ? "h-3.5 w-3.5" : "h-4 w-4"} />}Download Word
      </Button>
      {failed && <span role="alert" className="self-center text-xs text-red-700">Couldn&apos;t make the Word file. Try again.</span>}
    </>
  );
}

type Blueprint = { slug: string; title: string };

export function ProgramBuilder({ owner, onOpenCourse }: { owner: string; onOpenCourse?: (slug: string) => void }) {
  const { upsertCourse } = useStore();
  const upsertRef = useRef(upsertCourse); upsertRef.current = upsertCourse;

  // How the downloaded documents look. The default logo is the platform's (set by a super admin), or Requisor's.
  const [docStyle, setDocStyle] = useState<ProgramDocStyle>(DEFAULT_PROGRAM_DOC_STYLE);
  useEffect(() => { setDocStyle(loadDocStyle(owner)); }, [owner]);
  const changeDocStyle = (next: ProgramDocStyle) => { setDocStyle(next); saveDocStyle(owner, next); };
  const [platformLogo, setPlatformLogo] = useState<string | null>("/requisor.png");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/branding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { partner?: { logoUrl?: string | null } | null } | null) => { if (!cancelled && data?.partner?.logoUrl) setPlatformLogo(data.partner.logoUrl); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const look: DocLook = { accent: docStyle.accent, logo: logoSource(docStyle, platformLogo) };
  const draftKey = programStorageKey(PROGRAM_DRAFT_KEY, owner);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<Discovery>(EMPTY_DISCOVERY);
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [useAi, setUseAi] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [analyzeNote, setAnalyzeNote] = useState<Notice>(null);
  const [genNote, setGenNote] = useState<Notice>(null);
  const curriculumRef = useRef<HTMLDivElement>(null);
  // The latest values, for commands from the assistant, which run across several awaits.
  const formRef = useRef(form); formRef.current = form;
  const curriculumState = useRef(curriculum); curriculumState.current = curriculum;
  const useAiRef = useRef(useAi); useAiRef.current = useAi;

  // ── The curriculum blueprint course ───────────────────────────────────────
  // The first curriculum of a program is saved as a draft course for this tutor. Later
  // changes reach it only when the tutor asks (Update draft course), so lessons they
  // have since filled in are never replaced behind their back.
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  // A program built on one of the tutor's existing courses: no blueprint course is made (the course exists).
  const [sourceCourse, setSourceCourse] = useState<{ slug: string; title: string } | null>(null);
  const [myCourses, setMyCourses] = useState<Course[] | null>(null);
  const [pickedCourse, setPickedCourse] = useState("");
  const [courseNote, setCourseNote] = useState<Notice>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/tutor/courses", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { courses?: { course: Course }[] } | null) => {
        if (cancelled) return;
        // Blueprint courses made by this builder aren't offered: they came from a program in the first place.
        setMyCourses((data?.courses ?? []).map((i) => i.course).filter((c) => c.lessons.length > 0 && !c.title.endsWith(`— ${BLUEPRINT_LABEL}`)));
      })
      .catch(() => { if (!cancelled) setMyCourses([]); });
    return () => { cancelled = true; };
  }, []);
  const blueprintRef = useRef(blueprint); blueprintRef.current = blueprint;
  const [blueprintBusy, setBlueprintBusy] = useState(false);
  const [blueprintNote, setBlueprintNote] = useState<Notice>(null);

  const saveBlueprint = useCallback(async (current: Curriculum, mode: "auto" | "update") => {
    const existing = blueprintRef.current;
    if (mode === "auto" && existing) {
      setBlueprintNote({ kind: "warn", text: `"${existing.title}" in My Courses still has the earlier version. Use Update draft course to bring it in line.` });
      return;
    }
    setBlueprintBusy(true);
    try {
      // The course as saved now (it may have been edited, or deleted, since).
      let saved: Course | undefined;
      if (existing) {
        const res = await fetch("/api/tutor/courses");
        const data = await res.json().catch(() => ({})) as { courses?: { course: Course }[] };
        if (!res.ok || !Array.isArray(data.courses)) throw new Error("Couldn't load your courses. Please try again.");
        saved = data.courses.find((item) => item.course.slug === existing.slug)?.course;
      }
      const draft = curriculumToCourse(current, {
        slug: saved?.slug ?? blueprintSlug(current.title),
        category: saved?.category ?? DEFAULT_COURSE_ICON,
        cover: saved?.cover ?? getCategoryCover(DEFAULT_COURSE_ICON),
        fallbackLevel: formRef.current.level,
        today: new Date(),
      });
      const course = saved
        ? await upsertRef.current({ ...draft, revision: saved.revision, published: saved.published, addedAt: saved.addedAt, tags: saved.tags })
        : await upsertRef.current(draft, { createNew: true });
      setBlueprint({ slug: course.slug, title: course.title });
      window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
      setBlueprintNote({ kind: "ok", text: saved ? `Updated "${course.title}" in My Courses.` : `Saved as a draft course, "${course.title}", in My Courses. Learners can't see it until you publish it.` });
    } catch (error) {
      setBlueprintNote({ kind: "warn", text: error instanceof Error ? error.message : "Couldn't save the draft course." });
    } finally {
      setBlueprintBusy(false);
    }
  }, []);
  /** The tutor's saved course for this blueprint; null when it has been deleted, undefined when the list can't be read. */
  const findBlueprintCourse = useCallback(async (slug: string): Promise<Course | null | undefined> => {
    try {
      const res = await fetch("/api/tutor/courses");
      const data = await res.json().catch(() => ({})) as { courses?: { course: Course }[] };
      if (!res.ok || !Array.isArray(data.courses)) return undefined;
      return data.courses.find((item) => item.course.slug === slug)?.course ?? null;
    } catch {
      return undefined;
    }
  }, []);
  const blueprintGone = useCallback(() => {
    setBlueprint(null);
    setBlueprintNote({ kind: "warn", text: "The draft course for this curriculum is no longer in My Courses (it was deleted). Use Save as draft course to make it again." });
  }, []);
  async function openBlueprint() {
    if (!blueprint || !onOpenCourse) return;
    setBlueprintBusy(true);
    const course = await findBlueprintCourse(blueprint.slug);
    setBlueprintBusy(false);
    if (course === null) { blueprintGone(); return; }
    if (course === undefined) { setBlueprintNote({ kind: "warn", text: "Couldn't load your courses. Please try again." }); return; }
    onOpenCourse(blueprint.slug);
  }
  function updateBlueprint() {
    if (!curriculum) return;
    if (blueprint && !confirm(`Update "${blueprint.title}" to match this curriculum? Its lessons are replaced, including any videos or text added to them since.`)) return;
    void saveBlueprint(curriculum, "update");
  }

  const update = <K extends keyof Discovery>(key: K, value: Discovery[K]) => setForm((current) => ({ ...current, [key]: value }));

  // ── Step 1 ────────────────────────────────────────────────────────────────
  function analyze() {
    if (!form.transcript.trim()) { setAnalyzeNote({ kind: "warn", text: "Paste a transcript first, or load the sample." }); return; }
    setForm((current) => ({ ...current, ...analyzeTranscript(current.transcript) }));
    setAnalyzeNote({ kind: "ok", text: "Extracted what it could. Review and correct the fields below, then generate." });
  }
  function loadSample() {
    setForm((current) => sampleDiscovery(current));
    setAnalyzeNote({ kind: "ok", text: "Sample discovery call loaded. Review the fields below, then generate." });
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────
  const generate = useCallback(async (from?: Discovery): Promise<Curriculum> => {
    const source = from ?? formRef.current;
    const base = composeCurriculum(source);
    const show = (next: Curriculum) => {
      setCurriculum(next);
      setProposal(null);
      setSourceCourse(null);
      setStep(2);
      setTimeout(() => curriculumRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); // after the card first renders
      void saveBlueprint(next, "auto");
    };
    if (!useAiRef.current) { show(base); setGenNote(null); return base; }
    setGenerating(true);
    setGenNote({ kind: "warn", text: "Writing the curriculum with AI…" });
    try {
      const res = await fetch("/api/tutor/program-builder/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ form: source }) });
      const data = (await res.json().catch(() => ({}))) as { curriculum?: Curriculum; source?: string; reason?: string };
      if (!res.ok || !data.curriculum) throw new Error("unavailable");
      show(data.curriculum);
      setGenNote(data.source === "ai"
        ? { kind: "ok", text: "Written with AI from your discovery notes. Review every line before it goes to the employer." }
        : { kind: "warn", text: `Composed with the built-in engine instead (${data.reason ?? "AI unavailable"}).` });
      return data.curriculum;
    } catch {
      show(base);
      setGenNote({ kind: "warn", text: "AI unavailable. Composed with the built-in engine instead." });
      return base;
    } finally {
      setGenerating(false);
    }
  }, [saveBlueprint]);

  function applyCourse(slug = pickedCourse) {
    const course = myCourses?.find((c) => c.slug === slug);
    if (!course) { setCourseNote({ kind: "warn", text: "Pick one of your courses first." }); return; }
    const next = curriculumFromCourse(course, formRef.current);
    setCurriculum(next);
    setProposal(null);
    setSourceCourse({ slug: course.slug, title: course.title });
    setGenNote(null);
    setCourseNote({ kind: "ok", text: `Built from "${course.title}". Add the employer above, then create the proposal.` });
    setStep(2);
    setTimeout(() => curriculumRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); // after the card first renders
  }

  const editCurriculum = (change: Partial<Curriculum>) => setCurriculum((current) => (current ? { ...current, ...change } : current));
  const editModule = (index: number, change: Partial<Curriculum["modules"][number]>) =>
    setCurriculum((current) => (current ? { ...current, modules: current.modules.map((m, i) => (i === index ? { ...m, ...change } : m)) } : current));

  // ── Step 3 ────────────────────────────────────────────────────────────────
  const createProposal = useCallback((from?: Curriculum) => {
    const current = from ?? curriculumState.current;
    if (!current) return;
    setProposal(buildProposal(current, formRef.current.employer, new Date()));
    setStep(3);
    window.scrollTo({ top: 0 });
    document.querySelector("main")?.scrollTo?.({ top: 0 });
  }, []);

  // Work in progress survives switching tabs or reloading the page (this browser tab only).
  // Saving waits until the saved draft has been read back in, so an empty first render can't overwrite it.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!draftKey) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as { form?: Discovery; curriculum?: Curriculum | null; proposal?: Proposal | null; step?: Step; blueprint?: Blueprint | null; sourceCourse?: { slug?: unknown; title?: unknown } | null } | null;
      if (saved?.form && typeof saved.form === "object") {
        setForm({ ...EMPTY_DISCOVERY, ...saved.form });
        if (saved.curriculum?.modules) setCurriculum(saved.curriculum);
        if (typeof saved.blueprint?.slug === "string" && typeof saved.blueprint.title === "string") setBlueprint({ slug: saved.blueprint.slug, title: saved.blueprint.title });
        if (typeof saved.sourceCourse?.slug === "string" && typeof saved.sourceCourse.title === "string") setSourceCourse({ slug: saved.sourceCourse.slug, title: saved.sourceCourse.title });
        if (saved.proposal?.pricing) setProposal(saved.proposal);
        if (saved.step === 2 && saved.curriculum) setStep(2);
        if (saved.step === 3 && saved.proposal) setStep(3);
      }
    } catch { /* nothing saved, or storage is unavailable */ }
    setRestored(true);
  }, [draftKey]);
  useEffect(() => {
    if (!restored || !draftKey) return;
    try { sessionStorage.setItem(draftKey, JSON.stringify({ form, curriculum, proposal, step, blueprint, sourceCourse })); } catch { /* storage is unavailable */ }
  }, [restored, form, curriculum, proposal, step, blueprint, sourceCourse, draftKey]);
  // A remembered draft course may have been deleted since (in My Courses, or elsewhere).
  const checkedBlueprint = useRef(false);
  useEffect(() => {
    if (!restored || checkedBlueprint.current) return;
    checkedBlueprint.current = true;
    const slug = blueprintRef.current?.slug;
    if (slug) void findBlueprintCourse(slug).then((course) => { if (course === null && blueprintRef.current?.slug === slug) blueprintGone(); });
  }, [restored, findBlueprintCourse, blueprintGone]);
  function startOver() {
    setForm(EMPTY_DISCOVERY); setCurriculum(null); setProposal(null); setStep(1); setAnalyzeNote(null); setGenNote(null);
    // The saved draft course stays in My Courses; the next program gets its own.
    setBlueprint(null); setBlueprintNote(null);
    setSourceCourse(null); setPickedCourse(""); setCourseNote(null);
  }

  // ── Commands from the AI assistant ────────────────────────────────────────
  // The assistant leaves a command (fields to fill, and what to do next); it is picked up
  // here, whether the builder was already open or has just been opened for it.
  const [assistantNote, setAssistantNote] = useState<string | null>(null);
  const runCommand = useCallback(async () => {
    const command = takeProgramCommand(owner);
    if (!command) return;
    const before = formRef.current;
    const filled: Discovery = { ...before, ...command.form };
    formRef.current = filled;
    setForm(filled);
    setAnalyzeNote(null);
    // Only fields that really differ count: the assistant often repeats what is already there,
    // and that must not throw away a curriculum the tutor has been editing.
    const changed = (Object.keys(command.form) as (keyof Discovery)[]).filter((key) => command.form[key] !== before[key]).length;
    if (command.run === "fill") {
      setStep((current) => (current === 3 ? 2 : current));
      setAssistantNote(changed ? "The assistant filled in the discovery fields. Check them, then generate." : null);
      return;
    }
    if (command.run === "open-curriculum") { setStep(curriculumState.current ? 2 : 1); setAssistantNote(null); return; }
    // A proposal needs a curriculum: build one first if there is none, or if the fields just changed.
    const built = command.run === "generate" || !curriculumState.current || changed > 0 ? await generate(filled) : curriculumState.current;
    if (command.run === "proposal") createProposal(built);
    setAssistantNote(command.run === "proposal" ? "The assistant assembled this proposal. Fill in the investment amounts before exporting." : "The assistant built this curriculum. Every line is click-to-edit.");
  }, [generate, createProposal, owner]);
  useEffect(() => {
    if (!restored) return;
    void runCommand();
    const onCommand = () => void runCommand();
    window.addEventListener(PROGRAM_COMMAND_EVENT, onCommand);
    return () => window.removeEventListener(PROGRAM_COMMAND_EVENT, onCommand);
  }, [restored, runCommand]);

  // Printing shows only the document on screen (the blueprint on step 2, the proposal on step 3):
  // it is copied into a print-only layer directly under <body>.
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const root = document.createElement("div");
    root.className = "program-print-root";
    document.body.appendChild(root);
    setPrintRoot(root);
    return () => { root.remove(); document.body.classList.remove("print-program-document"); };
  }, []);
  const printing = step === 3 && proposal ? "proposal" : step === 2 && curriculum ? "blueprint" : null;
  // Preview links are for programs built on one of the tutor's own courses.
  const previewCourse = sourceCourse ? myCourses?.find((c) => c.slug === sourceCourse.slug) ?? null : null;
  useEffect(() => {
    document.body.classList.toggle("print-program-document", printing !== null);
  }, [printing]);

  const steps: [Step, string][] = [[1, "Discovery"], [2, "Curriculum"], [3, "Proposal"]];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Program Builder</h2>
          <p className="text-sm text-zinc-600">From an employer&apos;s need to a priced proposal. You can also ask the AI assistant to build one for you.{" "}
            {(curriculum || form.transcript || form.topic) && <button type="button" onClick={startOver} className="font-medium text-primary hover:underline">Start a new program</button>}
          </p>
        </div>
        <ol className="flex flex-wrap gap-1.5" aria-label="Program Builder steps">
          {steps.map(([n, label]) => (
            <li key={n} aria-current={step === n ? "step" : undefined} className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold",
              step === n ? "border-primary bg-primary text-white" : n < step ? "border-primary text-primary" : "border-zinc-200 bg-white text-zinc-500"
            )}>
              {n} · {label}
            </li>
          ))}
        </ol>
      </div>

      {assistantNote && (
        <p role="status" className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-2 text-[13px] text-zinc-700">
          <span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />{assistantNote}</span>
          <button type="button" onClick={() => setAssistantNote(null)} className="shrink-0 font-medium text-primary hover:underline">Dismiss</button>
        </p>
      )}

      {step < 3 && (
        <div className="grid items-start gap-5 lg:grid-cols-[400px_1fr]">
          {/* Intake */}
          <Card className="p-5">
            <div className="mb-5 rounded-xl border border-primary/20 bg-primary/[0.03] p-3.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><BookOpenCheck className="h-4 w-4 text-primary" aria-hidden="true" />Start from one of your courses</p>
              <p className="mt-0.5 text-[13px] text-zinc-600">Offer a course you already teach: its modules and lessons become the program&apos;s curriculum, ready for a proposal.</p>
              <div className="mt-2.5 flex gap-2">
                <select aria-label="Your course" className={selectClass} value={pickedCourse} onChange={(e) => { setPickedCourse(e.target.value); setCourseNote(null); }} disabled={!myCourses?.length}>
                  <option value="">{myCourses === null ? "Loading your courses…" : myCourses.length ? "Choose a course…" : "No courses with lessons yet"}</option>
                  {myCourses?.map((c) => <option key={c.slug} value={c.slug}>{c.title}{c.published === false ? " (draft)" : ""}</option>)}
                </select>
                <Button type="button" onClick={() => applyCourse()} disabled={!pickedCourse} className="shrink-0">Use course</Button>
              </div>
              <NoticeBox notice={courseNote} />
            </div>

            <h3 className="text-base font-semibold text-zinc-900">Employer discovery</h3>
            <p className="mt-0.5 text-[13px] text-zinc-600">Paste the transcript of the discovery call (for example from a Concap recording), or fill the fields directly. Everything extracted stays editable.</p>

            <FieldLabel htmlFor="pb-transcript">Discovery transcript / notes</FieldLabel>
            <Textarea id="pb-transcript" rows={7} value={form.transcript} onChange={(e) => update("transcript", e.target.value)} maxLength={6000} placeholder="Paste the meeting transcript or rough notes here…" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={analyze}><Wand2 className="h-3.5 w-3.5" />Analyze transcript</Button>
              <Button type="button" size="sm" variant="outline" onClick={loadSample}>Load sample (pre-construction)</Button>
            </div>
            <NoticeBox notice={analyzeNote} />

            <FieldLabel htmlFor="pb-employer">Employer / organization</FieldLabel>
            <Input id="pb-employer" value={form.employer} onChange={(e) => update("employer", e.target.value)} maxLength={160} placeholder="e.g. Findorff Construction" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="pb-industry">Industry</FieldLabel>
                <select id="pb-industry" className={selectClass} value={form.industry} onChange={(e) => update("industry", e.target.value as Industry)}>
                  {INDUSTRIES.map((industry) => <option key={industry.key} value={industry.key}>{industry.label}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="pb-level">Level</FieldLabel>
                <select id="pb-level" className={selectClass} value={form.level} onChange={(e) => update("level", e.target.value as Level)}>
                  {LEVELS.map((level) => <option key={level}>{level}</option>)}
                </select>
              </div>
            </div>
            <FieldLabel htmlFor="pb-audience">Audience</FieldLabel>
            <Input id="pb-audience" value={form.audience} onChange={(e) => update("audience", e.target.value)} maxLength={160} placeholder="e.g. construction managers" />
            <FieldLabel htmlFor="pb-topic">Training topic</FieldLabel>
            <Input id="pb-topic" value={form.topic} onChange={(e) => update("topic", e.target.value)} maxLength={200} placeholder="e.g. AI applications in pre-construction" />
            <FieldLabel htmlFor="pb-pains">Pains / goals the employer named (one per line)</FieldLabel>
            <Textarea id="pb-pains" rows={3} value={form.pains} onChange={(e) => update("pains", e.target.value)} maxLength={1200} placeholder={"e.g. estimates take too long\nbid decisions rely on gut feel"} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="pb-modules">Modules</FieldLabel>
                <select id="pb-modules" className={selectClass} value={form.modules} onChange={(e) => update("modules", Number(e.target.value))}>
                  {MODULE_COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="pb-format">Format</FieldLabel>
                <select id="pb-format" className={selectClass} value={form.format} onChange={(e) => update("format", e.target.value)}>
                  {FORMATS.map((format) => <option key={format}>{format}</option>)}
                </select>
              </div>
            </div>

            <label className="mt-4 flex items-start gap-2 text-[13px] text-zinc-700">
              <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-primary" />
              <span><span className="font-medium text-zinc-900">Write it with AI</span> so every line is tailored to the transcript. Untick to compose from the built-in curriculum engine, which works without AI.</span>
            </label>
            <div className="mt-4">
              <Button type="button" onClick={() => void generate()} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Generate curriculum
              </Button>
            </div>
            <NoticeBox notice={genNote} />
          </Card>

          {/* Curriculum */}
          <div ref={curriculumRef} className="scroll-mt-4">
            {!curriculum ? (
              <Card className="p-5">
                <h3 className="text-base font-semibold text-zinc-900">Curriculum</h3>
                <p className="mt-0.5 text-[13px] text-zinc-600">The generated program appears here in the standard shape: title, description, learning outcomes, modules and submodules, learning activities. Every line is click-to-edit, so instructional judgment stays with the program team.</p>
              </Card>
            ) : (
              <Card className="p-5">
                <div className="mb-4 border-b-2 border-primary pb-4">
                  <span className="mb-2 inline-block rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-[11.5px] font-bold tracking-wide text-primary">{sourceCourse ? `BASED ON YOUR COURSE: ${sourceCourse.title.toUpperCase()}` : "DRAFT — FOR PROGRAM TEAM REVIEW"}</span>
                  <Editable as="h1" value={curriculum.title} onChange={(v) => editCurriculum({ title: v })} className="block text-2xl font-bold text-zinc-900" label="Program title" />
                  <Editable as="p" value={curriculum.description} onChange={(v) => editCurriculum({ description: v })} className="mt-2 block max-w-[72ch] text-sm text-zinc-600" label="Program description" multiline />
                </div>
                <dl className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                  {([["AUDIENCE", "audience"], ["LEVEL", "level"], ["FORMAT", "format"], ["DURATION", "duration"]] as const).map(([label, key]) => (
                    <div key={key} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                      <dt className="text-[11px] font-bold tracking-wide text-zinc-500">{label}</dt>
                      <dd><Editable value={curriculum[key]} onChange={(v) => editCurriculum({ [key]: v })} className="block text-sm font-semibold text-zinc-900" label={label.toLowerCase()} /></dd>
                    </div>
                  ))}
                </dl>

                <h4 className="mb-2.5 mt-6 border-b border-zinc-200 pb-1.5 text-[15px] font-semibold text-primary">Learning outcomes</h4>
                <ul className="ml-5 list-disc space-y-2 text-sm text-zinc-800">
                  {curriculum.outcomes.map((outcome, i) => (
                    <li key={i}><Editable value={outcome} onChange={(v) => editCurriculum({ outcomes: curriculum.outcomes.map((o, j) => (j === i ? v : o)) })} label={`Outcome ${i + 1}`} multiline /></li>
                  ))}
                </ul>

                <h4 className="mb-2.5 mt-6 border-b border-zinc-200 pb-1.5 text-[15px] font-semibold text-primary">Modules</h4>
                <div className="space-y-3">
                  {curriculum.modules.map((module, i) => (
                    <section key={i} className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5">
                      <h5 className="text-[15.5px] font-semibold text-zinc-900">
                        Module {i + 1}: <Editable value={module.title} onChange={(v) => editModule(i, { title: v })} label={`Module ${i + 1} title`} />
                      </h5>
                      <Editable as="div" value={module.description} onChange={(v) => editModule(i, { description: v })} className="mb-2.5 block text-[13.5px] text-zinc-600" label={`Module ${i + 1} description`} multiline />
                      <div className="grid gap-3.5 md:grid-cols-2">
                        <div>
                          <p className="mb-1.5 text-xs font-bold text-primary">SUBMODULES</p>
                          <ul className="space-y-1 text-[13.5px] text-zinc-800">
                            {module.submodules.map((sub, j) => (
                              <li key={j} className="relative pl-4 before:absolute before:left-0.5 before:top-[9px] before:h-1.5 before:w-1.5 before:rounded-sm before:bg-primary">
                                <Editable value={sub} onChange={(v) => editModule(i, { submodules: module.submodules.map((s, k) => (k === j ? v : s)) })} label={`Module ${i + 1} submodule ${j + 1}`} multiline />
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="mb-1.5 text-xs font-bold text-primary">LEARNING ACTIVITIES</p>
                          <ul className="space-y-1 text-[13.5px] text-zinc-800">
                            {module.activities.map((activity, j) => (
                              <li key={j} className="relative pl-4 before:absolute before:left-0.5 before:top-[9px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-zinc-500">
                                <Editable value={activity} onChange={(v) => editModule(i, { activities: module.activities.map((a, k) => (k === j ? v : a)) })} label={`Module ${i + 1} activity ${j + 1}`} multiline />
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </section>
                  ))}
                </div>

                <h4 className="mb-2.5 mt-6 border-b border-zinc-200 pb-1.5 text-[15px] font-semibold text-primary">Assessment &amp; evidence</h4>
                <Editable as="p" value={curriculum.assessment} onChange={(v) => editCurriculum({ assessment: v })} className="block text-sm text-zinc-800" label="Assessment and evidence" multiline />

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button type="button" onClick={() => createProposal()}>Create employer proposal<ArrowRight className="h-4 w-4" /></Button>
                  <Button type="button" variant="outline" onClick={() => printAsPdf(`${curriculum.title} — ${BLUEPRINT_LABEL}`)}>
                    <Download className="h-4 w-4" />Download PDF
                  </Button>
                  <WordButton onDownload={() => downloadWord({ curriculum, employer: form.employer }, `${curriculum.title} — ${BLUEPRINT_LABEL}`, look)} />
                  <Button type="button" variant="outline" onClick={() => (sourceCourse ? applyCourse(sourceCourse.slug) : void generate())} disabled={generating}>
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{sourceCourse ? "Rebuild from the course" : "Regenerate"}
                  </Button>
                </div>

                <div className="mt-4">
                  <DocumentStyleControls style={docStyle} onChange={changeDocStyle} defaultLogo={platformLogo} />
                </div>

                {sourceCourse ? (
                <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><BookOpenCheck className="h-4 w-4 text-primary" aria-hidden="true" />Based on your course</p>
                  <p className="mt-0.5 text-[13px] text-zinc-600"><b className="font-semibold text-zinc-800">{sourceCourse.title}</b>. No new draft course is made: the program is this course. Edits here change the proposal only, not the course.</p>
                  {onOpenCourse && <Button type="button" size="sm" variant="outline" className="mt-2.5" onClick={() => onOpenCourse(sourceCourse.slug)}>Open in My Courses</Button>}
                </div>
                ) : (
                <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                    <BookOpenCheck className="h-4 w-4 text-primary" aria-hidden="true" />{BLUEPRINT_LABEL} course
                  </p>
                  <p className="mt-0.5 text-[13px] text-zinc-600">
                    {blueprint
                      ? <>Saved in My Courses as a draft: <b className="font-semibold text-zinc-800">{blueprint.title}</b>. Each module comes across with its description and a draft lesson per submodule, ready for your videos or text.</>
                      : blueprintBusy ? "Saving it as a draft course in My Courses…" : "Save this curriculum as a draft course in My Courses, with a draft lesson per submodule."}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {blueprint && onOpenCourse && (
                      <Button type="button" size="sm" variant="outline" onClick={() => void openBlueprint()} disabled={blueprintBusy}>Open in My Courses</Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={updateBlueprint} disabled={blueprintBusy}>
                      {blueprintBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{blueprint ? "Update draft course" : "Save as draft course"}
                    </Button>
                  </div>
                  <NoticeBox notice={blueprintNote} />
                </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      {step === 3 && proposal && (
        <div>
          <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur">
            <p className="text-[13px] text-zinc-600">Click any line to edit it. Fill in the investment amounts before exporting.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-3.5 w-3.5" />Back to curriculum</Button>
              <WordButton size="sm" onDownload={() => downloadWord({ proposal }, `${proposal.title} — Proposal`, look)} />
              <Button type="button" size="sm" onClick={() => printAsPdf(`${proposal.title} — Proposal`)}><Printer className="h-3.5 w-3.5" />Export PDF / Print</Button>
            </div>
          </div>
          <div className="mx-auto mb-4 max-w-[860px]">
            <DocumentStyleControls style={docStyle} onChange={changeDocStyle} defaultLogo={platformLogo} />
          </div>
          {previewCourse && (
            <div className="mx-auto mb-4 max-w-[860px]">
              <PreviewLinkPanel course={previewCourse} proposal={proposal} onChange={setProposal} label={form.employer.trim() || proposal.employer} />
            </div>
          )}
          <ProposalDocument proposal={proposal} onChange={setProposal} look={look} />
        </div>
      )}
      {printRoot && printing === "proposal" && proposal && createPortal(<ProposalDocument proposal={proposal} printing look={look} />, printRoot)}
      {printRoot && printing === "blueprint" && curriculum && createPortal(<BlueprintDocument curriculum={curriculum} employer={form.employer} look={look} />, printRoot)}

      {/* Lined up with the content above: the curriculum column in steps 1–2, the proposal's width in step 3. */}
      <div className={step === 3 && proposal ? "mx-auto max-w-[860px]" : "grid gap-5 lg:grid-cols-[400px_1fr]"}>
        <div className={step === 3 && proposal ? undefined : "min-w-0 lg:col-start-2"}>
          <AllPreviewLinks onTurnedOff={(id) => setProposal((p) => (p?.preview?.id === id ? { ...p, preview: undefined } : p))} />
        </div>
      </div>

    </div>
  );
}
