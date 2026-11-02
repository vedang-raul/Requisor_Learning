"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, BookOpenCheck, Check, ChevronDown, ChevronUp, Copy, Download, FileText, Link2, Loader2, MessagesSquare, Plus, Printer, RotateCcw, Sparkles, Wand2, X } from "lucide-react";
import { DATA_CHANGED_EVENT } from "@/components/assistant/assistant-action-card";
import { DEFAULT_COURSE_ICON, getCategoryCover } from "@/components/course/category-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import type { Course } from "@/lib/types";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { isPreviewUrl, PREVIEW_LINK_DAYS, previewModuleChoices } from "@/lib/courses/preview-modules";
import type { MyPreviewLink, PreviewLinkSummary } from "@/lib/courses/preview-links";
import { DEFAULT_PROGRAM_DOC_STYLE, DOC_THEMES, loadDocStyle, logoSources, MAX_DOC_LOGOS, MAX_LOGO_BYTES, saveDocStyle, type ProgramDocStyle } from "@/lib/courses/program-doc-style";
import {
  analyzeTranscript, BLUEPRINT_LABEL, blueprintSlug, buildProposal, composeCurriculum, courseChoiceGroups, CURRICULUM_FACTS, CURRICULUM_LABELS, CURRICULUM_SECTIONS, curriculumFromCourse, curriculumToCourse,
  docHide, docLabel, docRelabel, docShow, docShown, EMPTY_DISCOVERY, FORMATS, INDUSTRIES, LEVELS, MODULE_COUNTS, moveAt,
  curriculumGate, PROGRAM_COMMAND_EVENT, PROGRAM_DRAFT_KEY, PROGRAM_STATE_EVENT, programStorageKey, proposalGate, PROPOSAL_LABELS, PROPOSAL_SECTIONS, refreshProposal, removeAt, renumberModules, sampleDiscovery, stepOpen, takeProgramCommand, withCustom,
  type Curriculum, type Discovery, type Industry, type Level, type Proposal,
} from "@/lib/courses/program-builder";
import { askConfirm } from "@/components/ui/confirm-dialog";

/**
 * Program Builder: employer need → curriculum → priced proposal, one step on screen at a time, in
 * order: the proposal is created only from the end of step 2, by the tutor or at their request.
 *   1. Start       pick one of the tutor's courses, or paste a discovery-call transcript or fill the fields
 *   2. Curriculum  from the course or generated in the standard shape; every line is click-to-edit.
 *                  A generated one is saved as a draft "Curriculum Blueprint" course in the tutor's
 *                  courses. Logos and colour can be changed here, and it downloads as PDF or Word
 *   3. Proposal    assembled from the curriculum as edited; logos and colour again, fill in pricing and export
 * The AI assistant can drive all three steps: it sends commands (see src/lib/courses/program-builder.ts)
 * that fill the discovery fields, generate the curriculum and assemble the proposal.
 */
type Step = 1 | 2 | 3;
/** Where a program starts from, chosen on step 1. */
type Origin = "course" | "discovery";
const ORIGINS = [
  { key: "course", title: "An existing course", detail: "Offer a course you already teach: its modules and lessons become the curriculum.", Icon: BookOpenCheck },
  { key: "discovery", title: "A new discovery call", detail: "Paste the call's transcript or notes, and generate a curriculum for this employer.", Icon: MessagesSquare },
] as const;
type Notice = { kind: "ok" | "warn"; text: string } | null;

const selectClass = "focus-ring h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-zinc-900 transition-colors hover:border-zinc-300";

/**
 * Text that can be edited in place. The change is kept when the field loses focus.
 * Cleared, it calls onEmpty if given (a list line removes itself); a `required`
 * field goes back to what it said. Anything else stays empty, with `label` as a hint.
 */
function Editable({ value, onChange, as = "span", className, label, multiline = false, onEmpty, required = false, autoFocus = false }: {
  value: string; onChange: (next: string) => void; as?: "span" | "p" | "h1" | "h2" | "h4" | "div" | "li" | "td" | "th" | "b";
  className?: string; label: string; multiline?: boolean; onEmpty?: () => void; required?: boolean; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  // Follow changes made elsewhere (a regenerate, the assistant) unless the user is typing here.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) el.textContent = value;
  }, [value]);
  // A line just added opens ready to type in.
  useEffect(() => {
    if (autoFocus && !value) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createElement(as, {
    ref,
    contentEditable: true,
    suppressContentEditableWarning: true,
    role: "textbox",
    "aria-label": label,
    "aria-multiline": multiline,
    "data-placeholder": label,
    spellCheck: true,
    onBlur: (event: { currentTarget: HTMLElement }) => {
      const el = event.currentTarget;
      const next = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!next) {
        if (required) { el.textContent = value; return; }
        el.textContent = ""; // browsers leave a stray line break behind
        if (onEmpty) { onEmpty(); return; }
      }
      if (next !== value) onChange(next);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" && !(multiline && event.shiftKey)) { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Backspace" && onEmpty && !event.currentTarget.textContent?.trim()) { event.preventDefault(); event.currentTarget.blur(); }
    },
    onPaste: (event: React.ClipboardEvent<HTMLElement>) => {
      // Keep pasted text plain.
      event.preventDefault();
      document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    },
    className: cn("rounded-sm outline-none outline-offset-2 transition hover:outline-dashed hover:outline-1 hover:outline-primary/50 focus:bg-primary/5 focus:outline focus:outline-2 focus:outline-primary", as !== "td" && as !== "th" && "empty:inline-block empty:min-w-[6rem]", "empty:before:font-normal empty:before:text-zinc-400 empty:before:content-[attr(data-placeholder)]", className),
  }, value);
}

/** Shown on hover or while editing the row (and always on touch screens). */
const showControls = "opacity-0 transition focus-within:opacity-100 [@media(hover:none)]:opacity-100";
const rowControls = cn(showControls, "group-focus-within/item:opacity-100 group-hover/item:opacity-100");
const moduleControls = cn(showControls, "group-focus-within/module:opacity-100 group-hover/module:opacity-100");
const sectionControls = cn(showControls, "group-hover/section:opacity-100");
const controlButton = "focus-ring flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30";

/** Move up, move down and remove, for a row of a list. The row needs "group/item relative" (or group/module, with moduleControls). */
function ItemControls({ noun, index, count, onMove, onRemove, visibility = rowControls }: { noun: string; index: number; count: number; onMove: (by: -1 | 1) => void; onRemove: () => void; visibility?: string }) {
  return (
    <span className={cn("absolute right-0 top-0 flex rounded-md bg-white/90", visibility)}>
      <button type="button" className={controlButton} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${noun} ${index + 1} up`} title="Move up"><ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /></button>
      <button type="button" className={controlButton} disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${noun} ${index + 1} down`} title="Move down"><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></button>
      <button type="button" className={cn(controlButton, "hover:text-red-600")} onClick={onRemove} aria-label={`Remove ${noun} ${index + 1}`} title="Remove"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
    </span>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="focus-ring mt-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-primary hover:bg-primary/5">
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />{children}
    </button>
  );
}

/** A list of one-line items: edit, reorder, remove, add. Clearing a line removes it. */
function BulletList({ items, onChange, noun, listClass, itemClass }: { items: string[]; onChange: (next: string[]) => void; noun: string; listClass: string; itemClass?: string }) {
  return (
    <>
      <ul className={listClass}>
        {items.map((item, i) => (
          <li key={i} className={cn("group/item relative pr-[4.75rem]", itemClass)}>
            <Editable value={item} onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} onEmpty={() => onChange(removeAt(items, i))} label={`${noun} ${i + 1}`} multiline autoFocus />
            <ItemControls noun={noun.toLowerCase()} index={i} count={items.length} onMove={(by) => onChange(moveAt(items, i, by))} onRemove={() => onChange(removeAt(items, i))} />
          </li>
        ))}
      </ul>
      <AddButton onClick={() => onChange([...items, ""])}>Add {noun.toLowerCase()}</AddButton>
    </>
  );
}

/** Removes a section; the section needs "group/section relative". */
function RemoveSection({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <button type="button" onClick={onRemove} aria-label={`Remove the section ${name}`} title="Remove section"
      className={cn(controlButton, sectionControls, "absolute right-0 top-0 hover:text-red-600")}>
      <X className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

/** The tutor's own sections, after the standard ones. */
function ExtraSections({ extras, onChange, printing = false, heading }: { extras: { title: string; body: string }[]; onChange?: (next: { title: string; body: string }[]) => void; printing?: boolean; heading: string }) {
  if (printing) {
    return <>{extras.filter((x) => x.title || x.body).map((x, i) => (
      <div key={i}>{x.title && <h2 className={heading}>{x.title}</h2>}{x.body && <p className="text-sm leading-relaxed">{x.body}</p>}</div>
    ))}</>;
  }
  const edit = (i: number, change: Partial<{ title: string; body: string }>) => onChange?.(extras.map((x, j) => (j === i ? { ...x, ...change } : x)));
  return <>{extras.map((x, i) => (
    <div key={i} className="group/section relative">
      <Editable as="h2" value={x.title} onChange={(v) => edit(i, { title: v })} className={cn(heading, "block pr-8")} label="Section heading" autoFocus />
      <RemoveSection name={x.title || "new section"} onRemove={() => onChange?.(removeAt(extras, i))} />
      <Editable as="p" value={x.body} onChange={(v) => edit(i, { body: v })} className="block text-sm leading-relaxed" label="Section text" multiline />
    </div>
  ))}</>;
}

/** Add a section of your own, or put back one that was removed. */
function SectionsBar({ removed, onRestore, onAdd }: { removed: { key: string; label: string }[]; onRestore: (key: string) => void; onAdd: () => void }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-2 border-t border-dashed border-zinc-200 pt-2.5">
      <AddButton onClick={onAdd}>Add section</AddButton>
      {removed.map((r) => <AddButton key={r.key} onClick={() => onRestore(r.key)}>Put back: {r.label}</AddButton>)}
    </div>
  );
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
/** How the downloaded documents look: the accent colour and the logos, left to right. */
type DocLook = { accent: string; logos: string[] };
const lookStyle = (look: DocLook) => ({ "--doc-accent": look.accent }) as React.CSSProperties;
/** The printed copy: a band in the theme colour repeats at the top of every page. */
function PrintFrame({ look, children }: { look: DocLook; children: ReactNode }) {
  return (
    <table className="program-print-frame" style={lookStyle(look)}>
      <thead><tr><th><span aria-hidden="true" className="program-print-band" /></th></tr></thead>
      <tbody><tr><td>{children}</td></tr></tbody>
    </table>
  );
}

function DocLogo({ look }: { look: DocLook }) {
  if (!look.logos.length) return null;
  return (
    <div className="mb-4 flex items-center gap-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {look.logos.map((src, i) => <img key={i} src={src} alt="" className="max-h-12 min-w-0 max-w-[11rem] object-contain" />)}
    </div>
  );
}

function ProposalDocument({ proposal, onChange, printing = false, look }: { proposal: Proposal; onChange?: (next: Proposal) => void; printing?: boolean; look: DocLook }) {
  const set = <K extends keyof Proposal>(key: K, value: Proposal[K]) => onChange?.({ ...proposal, [key]: value });
  // On screen every line is editable; the printed copy is the same text, plain, without what's blank.
  const E = ({ value, onEdit, as = "span", className, label, multiline, required }: { value: string; onEdit: (next: string) => void; as?: "span" | "p" | "h2" | "h4" | "div" | "li" | "td" | "th" | "b"; className?: string; label: string; multiline?: boolean; required?: boolean }) =>
    printing ? (value || as === "td" || as === "th" ? createElement(as, { className }, value) : null) : <Editable value={value} onChange={onEdit} as={as} className={className} label={label} multiline={multiline} required={required} />;
  const heading = "mb-2 mt-6 break-after-avoid text-[15px] font-semibold text-[color:var(--doc-accent)]";
  const label = (key: string) => docLabel(proposal, key, PROPOSAL_LABELS);
  const L = (key: string, as: "p" | "h2" | "td" | "th" | "span", className: string) =>
    E({ value: label(key), onEdit: (v) => onChange?.(docRelabel(proposal, key, v)), as, className, label: `${PROPOSAL_LABELS[key]} (label)`, required: true });
  const section = (key: string, empty: boolean, body: ReactNode) => (!docShown(proposal, key) || (printing && empty) ? null : (
    <div className="group/section relative">
      {L(key, "h2", cn(heading, "pr-8"))}
      {!printing && <RemoveSection name={label(key)} onRemove={() => onChange?.(docHide(proposal, key))} />}
      {body}
    </div>
  ));
  const showTotal = docShown(proposal, "total");
  const extras = proposal.custom?.extras ?? [];

  return (
    <article id={printing ? undefined : "program-proposal"} style={lookStyle(look)} className={cn("bg-white text-zinc-900", printing ? "p-2" : "mx-auto max-w-[860px] rounded border border-zinc-200 px-6 py-10 shadow-soft sm:px-14 sm:py-12")}>
      <DocLogo look={look} />
      <header className="mb-6 flex flex-col gap-4 border-b-[3px] border-[color:var(--doc-accent)] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {L("kicker", "p", "text-xs font-bold tracking-[0.08em] text-[color:var(--doc-accent)]")}
          {printing ? <h1 className="mt-1 text-2xl font-bold text-zinc-900">{proposal.title}</h1> : <Editable as="h1" value={proposal.title} onChange={(v) => set("title", v)} className="mt-1 block text-2xl font-bold text-zinc-900" label="Proposal title" required />}
        </div>
        <div className="text-[12.5px] text-zinc-600 sm:text-right">
          {(!printing || proposal.employer) && <span className="block">Prepared for {E({ value: proposal.employer, onEdit: (v) => set("employer", v), as: "b", className: "text-zinc-900", label: "Employer" })}</span>}
          {E({ value: proposal.date, onEdit: (v) => set("date", v), className: "block", label: "Date" })}
          {E({ value: proposal.preparedBy, onEdit: (v) => set("preparedBy", v), className: "block", label: "Prepared by" })}
          {E({ value: proposal.platform, onEdit: (v) => set("platform", v), className: "block", label: "Platform line" })}
        </div>
      </header>

      {section("need", !proposal.need, E({ value: proposal.need, onEdit: (v) => set("need", v), as: "p", className: "text-sm leading-relaxed", label: "Need identified", multiline: true }))}

      {section("description", !proposal.description, E({ value: proposal.description, onEdit: (v) => set("description", v), as: "p", className: "text-sm leading-relaxed", label: "Program description", multiline: true }))}

      {section("outcomes", !proposal.outcomes.length, printing
        ? <ul className="ml-5 list-disc space-y-1 text-sm">{proposal.outcomes.map((outcome, i) => <li key={i}>{outcome}</li>)}</ul>
        : <BulletList items={proposal.outcomes} onChange={(next) => set("outcomes", next)} noun="Outcome" listClass="ml-5 list-disc space-y-1 text-sm" />)}

      {section("modules", !proposal.modules.length, (
        <>
          <div className="space-y-3">
            {proposal.modules.map((module, i) => {
              const replace = (next: Proposal["modules"]) => set("modules", renumberModules(next));
              return (
                <div key={i} className={cn("break-inside-avoid", !printing && "group/item relative")}>
                  {E({ value: module.title, onEdit: (v) => set("modules", proposal.modules.map((m, j) => (j === i ? { ...m, title: v } : m))), as: "h4", className: "pr-[4.75rem] text-sm font-semibold text-[color:var(--doc-accent)]", label: `Module ${i + 1} title`, required: true })}
                  {E({ value: module.summary, onEdit: (v) => set("modules", proposal.modules.map((m, j) => (j === i ? { ...m, summary: v } : m))), as: "div", className: "text-[13px] text-zinc-600", label: `Module ${i + 1} contents`, multiline: true })}
                  {!printing && <ItemControls noun="module" index={i} count={proposal.modules.length} onMove={(by) => replace(moveAt(proposal.modules, i, by))} onRemove={() => replace(removeAt(proposal.modules, i))} />}
                </div>
              );
            })}
          </div>
          {!printing && <AddButton onClick={() => set("modules", [...proposal.modules, { title: `Module ${proposal.modules.length + 1}: New module`, summary: "" }])}>Add module</AddButton>}
        </>
      ))}

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

      {section("delivery", !proposal.delivery && !proposal.deliveryPoints.length, (
        <>
          {E({ value: proposal.delivery, onEdit: (v) => set("delivery", v), as: "p", className: "text-sm leading-relaxed", label: "Delivery", multiline: true })}
          {printing
            ? <ul className="ml-5 mt-2 list-disc space-y-1 text-sm">{proposal.deliveryPoints.map((point, i) => <li key={i}>{point}</li>)}</ul>
            : <BulletList items={proposal.deliveryPoints} onChange={(next) => set("deliveryPoints", next)} noun="Delivery point" listClass="ml-5 mt-2 list-disc space-y-1 text-sm" />}
        </>
      ))}

      {section("investment", !proposal.pricing.length && !showTotal && !proposal.pricingNote, (
        <>
          {(!printing || proposal.pricing.length > 0 || showTotal) && (
            <table className="mt-2 w-full break-inside-avoid border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-[color:var(--doc-accent)] text-left text-xs tracking-wide text-zinc-600">
                  {L("item", "th", "w-[55%] px-2.5 py-2 font-semibold")}
                  {L("basis", "th", "px-2.5 py-2 font-semibold")}
                  {L("amount", "th", "px-2.5 py-2 text-right font-semibold")}
                  {!printing && <th className="w-[4.75rem]" />}
                </tr>
              </thead>
              <tbody>
                {proposal.pricing.map((row, i) => {
                  const edit = (key: "item" | "basis" | "amount") => (v: string) => set("pricing", proposal.pricing.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
                  return (
                    <tr key={i} className="group/item border-b border-zinc-200">
                      {E({ value: row.item, onEdit: edit("item"), as: "td", className: "px-2.5 py-2", label: `Pricing item ${i + 1}` })}
                      {E({ value: row.basis, onEdit: edit("basis"), as: "td", className: "px-2.5 py-2", label: `Pricing basis ${i + 1}` })}
                      {E({ value: row.amount, onEdit: edit("amount"), as: "td", className: "px-2.5 py-2 text-right", label: `Pricing amount ${i + 1}` })}
                      {!printing && (
                        <td className="relative">
                          <ItemControls noun="pricing row" index={i} count={proposal.pricing.length} onMove={(by) => set("pricing", moveAt(proposal.pricing, i, by))} onRemove={() => set("pricing", removeAt(proposal.pricing, i))} />
                        </td>
                      )}
                    </tr>
                  );
                })}
                {showTotal && (
                  <tr className="group/section border-t-2 border-[color:var(--doc-accent)] font-bold">
                    {L("total", "td", "px-2.5 py-2")}
                    <td />
                    {E({ value: proposal.total, onEdit: (v) => set("total", v), as: "td", className: "px-2.5 py-2 text-right", label: "Total amount" })}
                    {!printing && <td className="relative"><RemoveSection name={label("total")} onRemove={() => onChange?.(docHide(proposal, "total"))} /></td>}
                  </tr>
                )}
              </tbody>
            </table>
          )}
          {!printing && <AddButton onClick={() => set("pricing", [...proposal.pricing, { item: "", basis: "", amount: "$ —" }])}>Add pricing row</AddButton>}
          {E({ value: proposal.pricingNote, onEdit: (v) => set("pricingNote", v), as: "p", className: "mt-2 text-xs text-zinc-600", label: "Pricing note", multiline: true })}
        </>
      ))}

      <ExtraSections extras={extras} printing={printing} heading={heading} onChange={(next) => onChange?.(withCustom(proposal, { extras: next }))} />

      {docShown(proposal, "footer") && (
        <footer className="group/section relative mt-8 flex break-before-avoid justify-between gap-4 border-t border-zinc-200 pt-4 text-xs text-zinc-600">
          {L("footer", "span", "")}
          <span className={printing ? undefined : "pr-8"}>{proposal.date}</span>
          {!printing && <span className="absolute right-0 top-3"><RemoveSection name="the footer" onRemove={() => onChange?.(docHide(proposal, "footer"))} /></span>}
        </footer>
      )}

      {!printing && (
        <SectionsBar
          removed={PROPOSAL_SECTIONS.filter((key) => !docShown(proposal, key)).map((key) => ({ key, label: key === "footer" ? "Footer" : label(key) }))}
          onRestore={(key) => onChange?.(docShow(proposal, key))}
          onAdd={() => onChange?.(withCustom(proposal, { extras: [...extras, { title: "", body: "" }] }))}
        />
      )}
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
      trackEvent("preview_link_created");
      onChange({ ...proposal, preview: { id: data.link.id, url: `${window.location.origin}/p/${data.token}`, until: fmtDate(data.link.expiresAt) } });
      setNote({ kind: "ok", text: "Link made and added to the proposal. Copy it now: for safety it can't be shown again later." });
      linksChanged();
    } catch {
      setNote({ kind: "warn", text: "Couldn't make the link. Check your connection and try again." });
    } finally { setBusy(false); }
  }

  async function revoke(id: number) {
    if (!(await askConfirm("Turn this link off? Anyone who has it will no longer be able to open the preview.", { confirmLabel: "Turn off", danger: true }))) return;
    const res = await fetch(`${api}&id=${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { setNote({ kind: "warn", text: "Couldn't turn the link off. Try again." }); return; }
    trackEvent("preview_link_revoked");
    if (proposal.preview?.id === id) onChange({ ...proposal, preview: undefined });
    setNote({ kind: "ok", text: "Link turned off." });
    linksChanged();
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      trackEvent("preview_link_copied");
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the link is selectable */ }
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
    if (!(await askConfirm(`Turn off the link for ${link.label || "this proposal"}? Anyone who has it will no longer be able to open the preview.`, { confirmLabel: "Turn off", danger: true }))) return;
    const res = await fetch(`/api/tutor/preview-links?id=${link.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { setNote({ kind: "warn", text: "Couldn't turn the link off. Try again." }); return; }
    trackEvent("preview_link_revoked");
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
  const heading = "mb-2 mt-6 break-after-avoid text-[15px] font-semibold text-[color:var(--doc-accent)]";
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const label = (key: string) => docLabel(curriculum, key, CURRICULUM_LABELS);
  const shown = (key: string, filled: boolean) => docShown(curriculum, key) && filled;
  const facts = CURRICULUM_FACTS.filter((key) => docShown(curriculum, key));
  return (
    <article style={lookStyle(look)} className="bg-white p-2 text-zinc-900">
      <DocLogo look={look} />
      <header className="mb-5 border-b-[3px] border-[color:var(--doc-accent)] pb-4">
        <p className="text-xs font-bold tracking-[0.08em] text-[color:var(--doc-accent)]">{label("kicker")}</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">{curriculum.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">{curriculum.description}</p>
        {employer.trim() && <p className="mt-2 text-[12.5px] text-zinc-600">Prepared for <b className="text-zinc-900">{employer.trim()}</b></p>}
      </header>
      {facts.length > 0 && (
        <dl className="grid gap-2 text-sm" style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}>
          {facts.map((key) => (
            <div key={key} className="rounded border border-zinc-200 px-2.5 py-2">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label(key)}</dt>
              <dd className="font-semibold">{curriculum[key]}</dd>
            </div>
          ))}
        </dl>
      )}

      {shown("outcomes", curriculum.outcomes.length > 0) && (
        <>
          <h2 className={heading}>{label("outcomes")}</h2>
          <ul className="ml-5 list-disc space-y-1 text-sm">{curriculum.outcomes.map((outcome, i) => <li key={i}>{outcome}</li>)}</ul>
        </>
      )}

      {shown("modules", curriculum.modules.length > 0) && (
        <>
          <h2 className={heading}>{label("modules")}</h2>
          <div className="space-y-4">
            {curriculum.modules.map((module, i) => (
              <section key={i} className="break-inside-avoid rounded border border-zinc-200 px-4 py-3">
                <h3 className="text-[15px] font-semibold text-[color:var(--doc-accent)]">Module {i + 1}: {module.title}</h3>
                {module.description && <p className="mt-1 text-[13px] text-zinc-600">{module.description}</p>}
                <div className="mt-2 grid grid-cols-2 gap-4 text-[13px]">
                  {module.submodules.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase text-[color:var(--doc-accent)]">{label("submodules")}</p>
                      <ul className="ml-4 list-disc space-y-0.5">{module.submodules.map((sub, j) => <li key={j}>{sub}</li>)}</ul>
                    </div>
                  )}
                  {module.activities.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase text-[color:var(--doc-accent)]">{label("activities")}</p>
                      <ul className="ml-4 list-disc space-y-0.5">{module.activities.map((activity, j) => <li key={j}>{activity}</li>)}</ul>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {shown("assessment", Boolean(curriculum.assessment)) && (
        <>
          <h2 className={heading}>{label("assessment")}</h2>
          <p className="text-sm leading-relaxed">{curriculum.assessment}</p>
        </>
      )}

      <ExtraSections extras={curriculum.custom?.extras ?? []} printing heading={heading} />

      {docShown(curriculum, "footer") && (
        <footer className="mt-8 flex justify-between border-t border-zinc-200 pt-4 text-xs text-zinc-600">
          <span>{label("footer")}</span>
          <span>{date}</span>
        </footer>
      )}
    </article>
  );
}

/** The curriculum on screen, as it will look: every line, heading and list can be changed. */
function CurriculumEditor({ curriculum, onChange, look, badge }: { curriculum: Curriculum; onChange: (next: Curriculum) => void; look: DocLook; badge: string }) {
  const edit = (change: Partial<Curriculum>) => onChange({ ...curriculum, ...change });
  const editModule = (index: number, change: Partial<Curriculum["modules"][number]>) => edit({ modules: curriculum.modules.map((m, i) => (i === index ? { ...m, ...change } : m)) });
  const label = (key: string) => docLabel(curriculum, key, CURRICULUM_LABELS);
  const L = (key: string, as: "p" | "h4" | "span", className: string) => (
    <Editable as={as} value={label(key)} onChange={(v) => onChange(docRelabel(curriculum, key, v))} className={className} label={`${CURRICULUM_LABELS[key]} (label)`} required />
  );
  const hide = (key: string) => onChange(docHide(curriculum, key));
  const sectionHeading = (key: string) => (
    <>
      {L(key, "h4", "mb-2.5 mt-6 block border-b border-zinc-200 pb-1.5 pr-8 text-[15px] font-semibold text-[color:var(--doc-accent)]")}
      <RemoveSection name={label(key)} onRemove={() => hide(key)} />
    </>
  );
  const extras = curriculum.custom?.extras ?? [];
  const facts = CURRICULUM_FACTS.filter((key) => docShown(curriculum, key));
  return (
    <Card className="p-5" style={lookStyle(look)}>
      <DocLogo look={look} />
      <div className="mb-4 border-b-[3px] border-[color:var(--doc-accent)] pb-4">
        <span className="mb-2 inline-block rounded-full border border-[color:var(--doc-accent)] px-2.5 py-0.5 text-[11.5px] font-bold tracking-wide text-[color:var(--doc-accent)]">{badge}</span>
        {L("kicker", "p", "block text-xs font-bold tracking-[0.08em] text-[color:var(--doc-accent)]")}
        <Editable as="h1" value={curriculum.title} onChange={(v) => edit({ title: v })} className="mt-1 block text-2xl font-bold text-zinc-900" label="Program title" required />
        <Editable as="p" value={curriculum.description} onChange={(v) => edit({ description: v })} className="mt-2 block max-w-[72ch] text-sm text-zinc-600" label="Program description" multiline />
      </div>
      {facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {facts.map((key) => (
            <div key={key} className="group/section relative rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
              <dt>{L(key, "span", "block pr-6 text-[11px] font-bold uppercase tracking-wide text-zinc-500")}</dt>
              <dd><Editable value={curriculum[key]} onChange={(v) => edit({ [key]: v })} className="block text-sm font-semibold text-zinc-900" label={CURRICULUM_LABELS[key]} /></dd>
              <RemoveSection name={label(key)} onRemove={() => hide(key)} />
            </div>
          ))}
        </dl>
      )}

      {docShown(curriculum, "outcomes") && (
        <div className="group/section relative">
          {sectionHeading("outcomes")}
          <BulletList items={curriculum.outcomes} onChange={(outcomes) => edit({ outcomes })} noun="Outcome" listClass="ml-5 list-disc space-y-2 text-sm text-zinc-800" />
        </div>
      )}

      {docShown(curriculum, "modules") && (
        <div className="group/section relative">
          {sectionHeading("modules")}
          <div className="space-y-3">
            {curriculum.modules.map((module, i) => (
              <section key={i} className="group/module relative rounded-xl border border-zinc-200 bg-white px-4 py-3.5">
                <h5 className="pr-[4.75rem] text-[15.5px] font-semibold text-zinc-900">
                  Module {i + 1}: <Editable value={module.title} onChange={(v) => editModule(i, { title: v })} label={`Module ${i + 1} title`} required />
                </h5>
                <span className="absolute right-2 top-2 block h-6 w-[4.5rem]"><ItemControls noun="module" index={i} count={curriculum.modules.length} onMove={(by) => edit({ modules: moveAt(curriculum.modules, i, by) })} onRemove={() => edit({ modules: removeAt(curriculum.modules, i) })} visibility={moduleControls} /></span>
                <Editable as="div" value={module.description} onChange={(v) => editModule(i, { description: v })} className="mb-2.5 block text-[13.5px] text-zinc-600" label={`Module ${i + 1} description`} multiline />
                <div className="grid gap-3.5 md:grid-cols-2">
                  <div>
                    {L("submodules", "p", "mb-1.5 block text-xs font-bold uppercase text-[color:var(--doc-accent)]")}
                    <BulletList items={module.submodules} onChange={(submodules) => editModule(i, { submodules })} noun="Submodule" listClass="space-y-1 text-[13.5px] text-zinc-800"
                      itemClass="pl-4 before:absolute before:left-0.5 before:top-[9px] before:h-1.5 before:w-1.5 before:rounded-sm before:bg-[color:var(--doc-accent)]" />
                  </div>
                  <div>
                    {L("activities", "p", "mb-1.5 block text-xs font-bold uppercase text-[color:var(--doc-accent)]")}
                    <BulletList items={module.activities} onChange={(activities) => editModule(i, { activities })} noun="Activity" listClass="space-y-1 text-[13.5px] text-zinc-800"
                      itemClass="pl-4 before:absolute before:left-0.5 before:top-[9px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-zinc-500" />
                  </div>
                </div>
              </section>
            ))}
          </div>
          <AddButton onClick={() => edit({ modules: [...curriculum.modules, { title: "New module", description: "", submodules: [], activities: [] }] })}>Add module</AddButton>
        </div>
      )}

      {docShown(curriculum, "assessment") && (
        <div className="group/section relative">
          {sectionHeading("assessment")}
          <Editable as="p" value={curriculum.assessment} onChange={(v) => edit({ assessment: v })} className="block text-sm text-zinc-800" label="Assessment and evidence" multiline />
        </div>
      )}

      <ExtraSections extras={extras} heading="mb-2 mt-6 text-[15px] font-semibold text-[color:var(--doc-accent)]" onChange={(next) => onChange(withCustom(curriculum, { extras: next }))} />

      {docShown(curriculum, "footer") && (
        <div className="group/section relative mt-8 border-t border-zinc-200 pt-4 text-xs text-zinc-600">
          {L("footer", "span", "")}
          <span className="absolute right-0 top-3"><RemoveSection name="the footer" onRemove={() => hide("footer")} /></span>
        </div>
      )}

      <SectionsBar
        removed={CURRICULUM_SECTIONS.filter((key) => !docShown(curriculum, key)).map((key) => ({ key, label: key === "footer" ? "Footer" : label(key) }))}
        onRestore={(key) => onChange(docShow(curriculum, key))}
        onAdd={() => onChange(withCustom(curriculum, { extras: [...extras, { title: "", body: "" }] }))}
      />
    </Card>
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
  // A logo that can't be read (for example, blocked from another site) is left out.
  const logos = (await Promise.all(look.logos.map((src) => logoAsPng(src).catch(() => null)))).filter((l) => l !== null);
  await downloadDocx("proposal" in doc ? proposalBlocks(doc.proposal) : blueprintBlocks(doc.curriculum, doc.employer, date), fileName, { accent: look.accent, logos });
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

/** An uploaded logo, shrunk to at most 600 px wide: several full-size images wouldn't fit in browser storage. */
async function shrinkLogo(dataUrl: string): Promise<string> {
  const { png } = await logoAsPng(dataUrl);
  return `data:image/png;base64,${btoa(Array.from(png, (b) => String.fromCharCode(b)).join(""))}`;
}

/** Logos and colour for the downloaded PDF and Word files. */
function DocumentStyleControls({ style, onChange, defaultLogo }: { style: ProgramDocStyle; onChange: (next: ProgramDocStyle) => void; defaultLogo: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const logos = logoSources(style, defaultLogo);
  const canAdd = logos.length < MAX_DOC_LOGOS;
  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { setError("Choose a PNG, JPG, WebP or SVG image."); return; }
    if (file.size > MAX_LOGO_BYTES) { setError("That logo is larger than 1 MB."); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("read")); reader.readAsDataURL(file); }).catch(() => null);
    if (!dataUrl) { setError("Couldn't read that image."); return; }
    if (inputRef.current) inputRef.current.value = "";
    try { onChange({ ...style, customLogos: [...style.customLogos, await shrinkLogo(dataUrl)] }); }
    catch { setError("Couldn't read that image."); }
  }
  const custom = !DOC_THEMES.some((t) => t.accent.toLowerCase() === style.accent.toLowerCase());
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <p className="text-sm font-semibold text-zinc-900">Document style</p>
      <p className="text-xs text-zinc-500">Shown below and on the PDF and Word files.</p>
      <div className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-3">
        <div>
          <p className="text-xs font-medium text-zinc-700">Logos</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {logos.map((src, i) => {
              const isPlatform = style.platformLogo && Boolean(defaultLogo) && i === 0;
              const remove = () => onChange(isPlatform ? { ...style, platformLogo: false } : { ...style, customLogos: style.customLogos.filter((_, j) => j !== i - (style.platformLogo && defaultLogo ? 1 : 0)) });
              return (
                <div key={i} className="relative flex h-12 w-24 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={isPlatform ? "Platform logo" : `Your logo ${i + 1}`} className="max-h-10 max-w-full object-contain" />
                  <button type="button" onClick={remove} aria-label={isPlatform ? "Remove the platform logo" : `Remove logo ${i + 1}`} title="Remove"
                    className="focus-ring absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm hover:text-red-600">
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
            {canAdd && (
              <button type="button" onClick={() => inputRef.current?.click()}
                className="focus-ring flex h-12 w-24 items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 bg-white text-xs font-semibold text-primary hover:border-primary/50">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />Add logo
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">
            {logos.length ? "Side by side at the top, in this order. " : "Documents without a logo. "}Up to {MAX_DOC_LOGOS}, kept in this browser.
            {!style.platformLogo && defaultLogo && canAdd && <>{" "}<button type="button" onClick={() => onChange({ ...style, platformLogo: true })} className="font-semibold text-primary hover:underline">Add the platform logo</button></>}
          </p>
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
/** What the proposal is written from: the curriculum's own headings and sections aren't part of it. */
const basisOf = (curriculum: Curriculum, employer: string) => JSON.stringify([{ ...curriculum, custom: undefined }, employer]);

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
  const look: DocLook = { accent: docStyle.accent, logos: logoSources(docStyle, platformLogo) };
  const draftKey = programStorageKey(PROGRAM_DRAFT_KEY, owner);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<Discovery>(EMPTY_DISCOVERY);
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  // What the proposal was last built from, so returning to it keeps it unless that has changed since.
  const [proposalBasis, setProposalBasis] = useState("");
  const [proposalNote, setProposalNote] = useState<Notice>(null);
  const [showLinks, setShowLinks] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [analyzeNote, setAnalyzeNote] = useState<Notice>(null);
  const [genNote, setGenNote] = useState<Notice>(null);
  // The latest values, for commands from the assistant, which run across several awaits.
  const formRef = useRef(form); formRef.current = form;
  const curriculumState = useRef(curriculum); curriculumState.current = curriculum;
  const stepRef = useRef(step); stepRef.current = step;
  const proposalState = useRef(proposal); proposalState.current = proposal;
  const proposalBasisRef = useRef(proposalBasis); proposalBasisRef.current = proposalBasis;
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
  async function updateBlueprint() {
    if (!curriculum) return;
    if (blueprint && !(await askConfirm(`Update "${blueprint.title}" to match this curriculum? Its lessons are replaced, including any videos or text added to them since.`, { confirmLabel: "Update", danger: true }))) return;
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
    trackEvent("program_generation_started");
    const source = from ?? formRef.current;
    const base = composeCurriculum(source);
    const show = (next: Curriculum) => {
      setCurriculum(next);
      proposalState.current = null;
      setProposal(null);
      setSourceCourse(null);
      setOrigin("discovery");
      setStep(2);
      void saveBlueprint(next, "auto");
    };
    if (!useAiRef.current) {
      show(base); setGenNote(null);
      trackEvent("program_curriculum_composed");
      return base;
    }
    setGenerating(true);
    setGenNote({ kind: "warn", text: "Writing the curriculum with AI…" });
    try {
      const res = await fetch("/api/tutor/program-builder/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ form: source }) });
      const data = (await res.json().catch(() => ({}))) as { curriculum?: Curriculum; source?: string; reason?: string };
      if (!res.ok || !data.curriculum) throw new Error("unavailable");
      show(data.curriculum);
      trackEvent("program_ai_generation_finished", { success: data.source === "ai" });
      setGenNote(data.source === "ai"
        ? { kind: "ok", text: "Written with AI from your discovery notes. Review every line before it goes to the employer." }
        : { kind: "warn", text: `Composed with the built-in engine instead (${data.reason ?? "AI unavailable"}).` });
      return data.curriculum;
    } catch {
      show(base);
      trackEvent("program_ai_generation_finished", { success: false });
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
    trackEvent("program_built_from_course");
    setCurriculum(next);
    proposalState.current = null;
    setProposal(null);
    setSourceCourse({ slug: course.slug, title: course.title });
    setGenNote(null);
    setCourseNote(null);
    setStep(2);
  }

  /** Starting again would throw away edits, so it checks first. */
  const confirmReplace = async () => !curriculum || askConfirm("Replace your current curriculum and proposal? Your edits to them will be lost.", { confirmLabel: "Replace", danger: true });
  async function continueWithCourse() {
    if (curriculum && sourceCourse?.slug === pickedCourse) { setStep(2); return; } // the same course: carry on with the work so far
    if (await confirmReplace()) applyCourse();
  }
  async function generateFromForm() {
    if (curriculumGate({ topic: form.topic, hasTranscript: Boolean(form.transcript.trim()) })) { setGenNote({ kind: "warn", text: "Paste the discovery call notes or enter a training topic first." }); return; }
    if (await confirmReplace()) void generate();
  }
  async function rebuild() {
    if (!(await confirmReplace())) return;
    if (sourceCourse) applyCourse(sourceCourse.slug); else void generate();
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────
  const createProposal = useCallback((from?: Curriculum) => {
    const current = from ?? curriculumState.current;
    if (!current) return;
    const employer = formRef.current.employer;
    const basis = basisOf(current, employer);
    const previous = proposalState.current;
    setProposalNote(null);
    if (!previous) {
      setProposal(buildProposal(current, employer, new Date()));
      trackEvent("program_proposal_created");
    } else if (basis !== proposalBasisRef.current) {
      setProposal(refreshProposal(previous, current, employer, new Date()));
      setProposalNote({ kind: "ok", text: "Updated from your curriculum. Your pricing, delivery details and preview link are kept." });
    }
    setProposalBasis(basis);
    setStep(3);
  }, []);

  function goToStep(next: Step) {
    setShowLinks(false);
    if (next === 3 && step !== 3) createProposal();
    else setStep(next);
  }
  // One step at a time: each opens at its top.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.querySelector("main")?.scrollTo?.({ top: 0 });
  }, [step, showLinks]);

  // Work in progress survives switching tabs or reloading the page (this browser tab only).
  // Saving waits until the saved draft has been read back in, so an empty first render can't overwrite it.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!draftKey) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as { form?: Discovery; curriculum?: Curriculum | null; proposal?: Proposal | null; step?: Step; blueprint?: Blueprint | null; sourceCourse?: { slug?: unknown; title?: unknown } | null; origin?: Origin | null; proposalBasis?: string } | null;
      if (saved?.form && typeof saved.form === "object") {
        setForm({ ...EMPTY_DISCOVERY, ...saved.form });
        if (saved.curriculum?.modules) setCurriculum(saved.curriculum);
        if (typeof saved.blueprint?.slug === "string" && typeof saved.blueprint.title === "string") setBlueprint({ slug: saved.blueprint.slug, title: saved.blueprint.title });
        if (typeof saved.sourceCourse?.slug === "string" && typeof saved.sourceCourse.title === "string") { setSourceCourse({ slug: saved.sourceCourse.slug, title: saved.sourceCourse.title }); setPickedCourse(saved.sourceCourse.slug); }
        // Drafts from before step 1 had a choice: work it out from what they hold.
        setOrigin(saved.origin ?? (saved.sourceCourse ? "course" : saved.curriculum || saved.form.transcript || saved.form.topic ? "discovery" : null));
        if (saved.proposal?.pricing) setProposal(saved.proposal);
        if (saved.proposal?.pricing && saved.curriculum) setProposalBasis(saved.proposalBasis ?? basisOf(saved.curriculum, saved.form.employer ?? ""));
        if (saved.step === 2 && saved.curriculum) setStep(2);
        if (saved.step === 3 && saved.proposal) setStep(3);
      }
    } catch { /* nothing saved, or storage is unavailable */ }
    setRestored(true);
  }, [draftKey]);
  useEffect(() => {
    if (!restored || !draftKey) return;
    try { sessionStorage.setItem(draftKey, JSON.stringify({ form, curriculum, proposal, step, blueprint, sourceCourse, origin, proposalBasis })); window.dispatchEvent(new Event(PROGRAM_STATE_EVENT)); } catch { /* storage is unavailable */ }
  }, [restored, form, curriculum, proposal, step, blueprint, sourceCourse, origin, proposalBasis, draftKey]);
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
    setOrigin(null); setProposalBasis(""); setProposalNote(null); setShowLinks(false);
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
    setShowLinks(false);
    // Only fields that really differ count: the assistant often repeats what is already there,
    // and that must not throw away a curriculum the tutor has been editing.
    const changed = (Object.keys(command.form) as (keyof Discovery)[]).filter((key) => command.form[key] !== before[key]).length;
    if (command.run === "fill") {
      // The fields are on step 1: go there when there's something new to check.
      if (changed) { setOrigin("discovery"); setStep(1); } else setStep((current) => (current === 3 ? 2 : current));
      setAssistantNote(changed ? "The assistant filled in the discovery fields. Check them, then generate." : null);
      return;
    }
    if (command.run === "open-curriculum") { setStep(curriculumState.current ? 2 : 1); setAssistantNote(null); return; }
    // A new or rewritten curriculum always stops at step 2, even when the proposal was asked for: it gets reviewed first.
    const rewrite = command.run === "generate" || !curriculumState.current || changed > 0;
    const built = rewrite ? await generate(filled) : curriculumState.current;
    if (command.run !== "proposal") { setAssistantNote("The assistant built this curriculum. Every line is click-to-edit."); return; }
    if (!rewrite && !proposalGate({ hasCurriculum: true, step: stepRef.current })) {
      createProposal(built ?? undefined);
      setAssistantNote("The assistant assembled this proposal. Fill in the investment amounts before exporting.");
      return;
    }
    setStep(2);
    setAssistantNote("Review this curriculum first. When it's right, use Create proposal at the end of this page.");
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
  const printing = showLinks ? null : step === 3 && proposal ? "proposal" : step === 2 && curriculum ? "blueprint" : null;
  // Preview links are for programs built on one of the tutor's own courses.
  const previewCourse = sourceCourse ? myCourses?.find((c) => c.slug === sourceCourse.slug) ?? null : null;
  useEffect(() => {
    document.body.classList.toggle("print-program-document", printing !== null);
  }, [printing]);

  const steps: [Step, string][] = [[1, "Start"], [2, "Curriculum"], [3, "Proposal"]];

  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Program Builder</h2>
            <p className="text-sm text-zinc-600">From an employer&apos;s need to a priced proposal. You can also ask the AI assistant to build one for you.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" aria-pressed={showLinks} onClick={() => setShowLinks((now) => !now)}><Link2 className="h-3.5 w-3.5" />Preview links</Button>
            {(curriculum || form.transcript || form.topic) && <Button type="button" size="sm" variant="outline" onClick={startOver}><Plus className="h-3.5 w-3.5" />New program</Button>}
          </div>
        </div>
        <ol className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Program Builder steps">
          {steps.map(([n, label]) => {
            const here = step === n && !showLinks;
            const open = stepOpen(n, Boolean(curriculum), Boolean(proposal));
            return (
              <li key={n}>
                <button type="button" disabled={!open} aria-current={here ? "step" : undefined} onClick={() => goToStep(n)} className={cn(
                  "focus-ring rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition disabled:cursor-not-allowed",
                  here ? "border-primary bg-primary text-white" : open ? "border-primary text-primary hover:bg-primary/5" : "border-zinc-200 bg-white text-zinc-500"
                )}>
                  {n} · {label}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {assistantNote && (
        <p role="status" className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-2 text-[13px] text-zinc-700">
          <span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />{assistantNote}</span>
          <button type="button" onClick={() => setAssistantNote(null)} className="shrink-0 font-medium text-primary hover:underline">Dismiss</button>
        </p>
      )}

      {showLinks && (
        <AllPreviewLinks onTurnedOff={(id) => setProposal((p) => (p?.preview?.id === id ? { ...p, preview: undefined } : p))} />
      )}

      {!showLinks && step < 3 && <NoticeBox notice={genNote} />}
      {!showLinks && step < 3 && <NoticeBox notice={courseNote} />}

      {!showLinks && step === 1 && (
        <div className="space-y-4">
          <div role="group" aria-label="How to start" className="grid gap-3 sm:grid-cols-2">
            {ORIGINS.map(({ key, title, detail, Icon }) => (
              <button key={key} type="button" aria-pressed={origin === key} onClick={() => setOrigin(key)} className={cn(
                "focus-ring rounded-xl border bg-white p-4 text-left transition",
                origin === key ? "border-primary ring-1 ring-primary" : "border-zinc-200 hover:border-primary/50"
              )}>
                <span className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><Icon className="h-4 w-4 text-primary" aria-hidden="true" />{title}</span>
                <span className="mt-1 block text-[13px] text-zinc-600">{detail}</span>
              </button>
            ))}
          </div>

          {origin === "course" && (
            <Card className="p-5">
              <FieldLabel htmlFor="pb-course">Your course</FieldLabel>
              <select id="pb-course" className={selectClass} value={pickedCourse} onChange={(e) => { setPickedCourse(e.target.value); setCourseNote(null); }} disabled={!myCourses?.length}>
                <option value="">{myCourses === null ? "Loading your courses…" : myCourses.length ? "Choose a course…" : "No courses with lessons yet"}</option>
                {courseChoiceGroups(myCourses ?? []).map((group) => (
                  <optgroup key={group.label} label={`${group.label} (${group.courses.length})`}>
                    {group.courses.map((c) => <option key={c.slug} value={c.slug}>{c.title} · {c.lessons.length} lesson{c.lessons.length === 1 ? "" : "s"}</option>)}
                  </optgroup>
                ))}
              </select>
              <FieldLabel htmlFor="pb-employer">Employer / organization</FieldLabel>
              <Input id="pb-employer" value={form.employer} onChange={(e) => update("employer", e.target.value)} maxLength={160} placeholder="e.g. Findorff Construction" />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={() => void continueWithCourse()} disabled={!pickedCourse}>Continue<ArrowRight className="h-4 w-4" /></Button>
              </div>
            </Card>
          )}

          {origin === "discovery" && (
            <Card className="p-5">
              <p className="text-[13px] text-zinc-600">Paste the transcript of the discovery call (for example from a Concap recording), or fill the fields directly. Everything extracted stays editable.</p>

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
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={() => void generateFromForm()} disabled={generating}>
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Generate curriculum
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {!showLinks && step === 2 && curriculum && (
        <div className="space-y-4">
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur">
            <p className="text-[13px] text-zinc-600">Click any line to edit it.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-3.5 w-3.5" />Back</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void rebuild()} disabled={generating}>
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}{sourceCourse ? "Rebuild from the course" : "Regenerate"}
              </Button>
              <WordButton size="sm" onDownload={() => downloadWord({ curriculum, employer: form.employer }, `${curriculum.title} — ${BLUEPRINT_LABEL}`, look)} />
              <Button type="button" size="sm" variant="outline" onClick={() => printAsPdf(`${curriculum.title} — ${BLUEPRINT_LABEL}`)}><Download className="h-3.5 w-3.5" />Download PDF</Button>
            </div>
          </div>
          <DocumentStyleControls style={docStyle} onChange={changeDocStyle} defaultLogo={platformLogo} />
          <CurriculumEditor curriculum={curriculum} onChange={setCurriculum} look={look} badge={sourceCourse ? `BASED ON YOUR COURSE: ${sourceCourse.title.toUpperCase()}` : "DRAFT — FOR PROGRAM TEAM REVIEW"} />
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
            <p className="text-[13px] text-zinc-700">Happy with the curriculum? The proposal is written from it as it stands now.</p>
            <Button type="button" onClick={() => createProposal()}>{proposal ? "Continue to proposal" : "Create proposal"}<ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {!showLinks && step === 3 && proposal && (
        <div className="space-y-4">
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur">
            <p className="text-[13px] text-zinc-600">Click any line to edit it. Fill in the investment amounts before exporting.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-3.5 w-3.5" />Back</Button>
              <WordButton size="sm" onDownload={() => downloadWord({ proposal }, `${proposal.title} — Proposal`, look)} />
              <Button type="button" size="sm" onClick={() => printAsPdf(`${proposal.title} — Proposal`)}><Printer className="h-3.5 w-3.5" />Export PDF / Print</Button>
            </div>
          </div>
          <NoticeBox notice={proposalNote} />
          <DocumentStyleControls style={docStyle} onChange={changeDocStyle} defaultLogo={platformLogo} />
          {previewCourse && <PreviewLinkPanel course={previewCourse} proposal={proposal} onChange={setProposal} label={form.employer.trim() || proposal.employer} />}
          <ProposalDocument proposal={proposal} onChange={setProposal} look={look} />
        </div>
      )}
      {printRoot && printing === "proposal" && proposal && createPortal(<PrintFrame look={look}><ProposalDocument proposal={proposal} printing look={look} /></PrintFrame>, printRoot)}
      {printRoot && printing === "blueprint" && curriculum && createPortal(<PrintFrame look={look}><BlueprintDocument curriculum={curriculum} employer={form.employer} look={look} /></PrintFrame>, printRoot)}

    </div>
  );
}
