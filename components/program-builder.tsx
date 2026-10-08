"use client";

import { createElement, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, Printer, RotateCcw, Send, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  analyzeTranscript, buildProposal, composeCurriculum, EMPTY_DISCOVERY, FORMATS, INDUSTRIES, LEVELS, MODULE_COUNTS,
  REQI_GREETING, reqiReply, sampleDiscovery,
  type Curriculum, type Discovery, type Industry, type Level, type Proposal, type ReqiSay, type ReqiState, type ReqiTurn,
} from "@/lib/program-builder";

/**
 * Program Builder: employer need → curriculum → priced proposal.
 *   1. Discovery   paste a discovery-call transcript or fill the fields
 *   2. Curriculum  generated in the standard shape; every line is click-to-edit
 *   3. Proposal    assembled from the curriculum as edited; fill in pricing and export as PDF
 * Reqi, the design agent, can run all three steps from a conversation.
 */
type Step = 1 | 2 | 3;
type Notice = { kind: "ok" | "warn"; text: string } | null;

const selectClass = "focus-ring h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-zinc-900 transition-colors hover:border-zinc-300";
const DRAFT_KEY = "requisor-program-builder";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Text that can be edited in place. The change is kept when the field loses focus. */
function Editable({ value, onChange, as = "span", className, label, multiline = false }: {
  value: string; onChange: (next: string) => void; as?: "span" | "p" | "h1" | "h4" | "div" | "li" | "td" | "b";
  className?: string; label: string; multiline?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  // Follow changes made elsewhere (a regenerate, Reqi) unless the user is typing here.
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

/** Reqi's words: `**bold**` and line breaks only. */
function ReqiText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <span key={i} className="block">
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith("**") ? <b key={j}>{part.slice(2, -2)}</b> : <span key={j}>{part}</span>))}
        </span>
      ))}
    </>
  );
}

// ── The proposal document, as shown on screen (editable) and as printed ─────
function ProposalDocument({ proposal, onChange, printing = false }: { proposal: Proposal; onChange?: (next: Proposal) => void; printing?: boolean }) {
  const set = <K extends keyof Proposal>(key: K, value: Proposal[K]) => onChange?.({ ...proposal, [key]: value });
  // On screen every line is editable; the printed copy is the same text, plain.
  const E = ({ value, onEdit, as = "span", className, label, multiline }: { value: string; onEdit: (next: string) => void; as?: "span" | "p" | "h4" | "div" | "li" | "td" | "b"; className?: string; label: string; multiline?: boolean }) =>
    printing ? createElement(as, { className }, value) : <Editable value={value} onChange={onEdit} as={as} className={className} label={label} multiline={multiline} />;
  const heading = "mb-2 mt-6 text-[15px] font-semibold text-primary";

  return (
    <article id={printing ? undefined : "program-proposal"} className={cn("bg-white text-zinc-900", printing ? "p-2" : "mx-auto max-w-[860px] rounded border border-zinc-200 px-6 py-10 shadow-soft sm:px-14 sm:py-12")}>
      <header className="mb-6 flex flex-col gap-4 border-b-[3px] border-primary pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] text-primary">CUSTOM TRAINING PROPOSAL</p>
          <h1 className="mt-1 text-2xl font-bold">{proposal.title}</h1>
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
            {E({ value: module.title, onEdit: (v) => set("modules", proposal.modules.map((m, j) => (j === i ? { ...m, title: v } : m))), as: "h4", className: "text-sm font-semibold", label: `Module ${i + 1} title` })}
            {E({ value: module.summary, onEdit: (v) => set("modules", proposal.modules.map((m, j) => (j === i ? { ...m, summary: v } : m))), as: "div", className: "text-[13px] text-zinc-600", label: `Module ${i + 1} contents`, multiline: true })}
          </div>
        ))}
      </div>

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
        <span>Generated with the Requisor Learning Program Builder</span>
        <span>{proposal.date}</span>
      </footer>
    </article>
  );
}

type ReqiMessage = { id: number; role: "agent" | "user"; text: string; actions?: string[]; typing?: boolean };

export function ProgramBuilder() {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<Discovery>(EMPTY_DISCOVERY);
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [useAi, setUseAi] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [analyzeNote, setAnalyzeNote] = useState<Notice>(null);
  const [genNote, setGenNote] = useState<Notice>(null);
  const curriculumRef = useRef<HTMLDivElement>(null);
  // The latest values, for Reqi's replies, which run across several awaits.
  const formRef = useRef(form); formRef.current = form;
  const curriculumState = useRef(curriculum); curriculumState.current = curriculum;
  const useAiRef = useRef(useAi); useAiRef.current = useAi;

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
  const generate = useCallback(async (from?: Discovery) => {
    const source = from ?? formRef.current;
    const base = composeCurriculum(source);
    const show = (next: Curriculum) => {
      setCurriculum(next);
      setProposal(null);
      setStep(2);
      requestAnimationFrame(() => curriculumRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    if (!useAiRef.current) { show(base); setGenNote(null); return; }
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
    } catch {
      show(base);
      setGenNote({ kind: "warn", text: "AI unavailable. Composed with the built-in engine instead." });
    } finally {
      setGenerating(false);
    }
  }, []);

  const editCurriculum = (change: Partial<Curriculum>) => setCurriculum((current) => (current ? { ...current, ...change } : current));
  const editModule = (index: number, change: Partial<Curriculum["modules"][number]>) =>
    setCurriculum((current) => (current ? { ...current, modules: current.modules.map((m, i) => (i === index ? { ...m, ...change } : m)) } : current));

  // ── Step 3 ────────────────────────────────────────────────────────────────
  const createProposal = useCallback(() => {
    const current = curriculumState.current;
    if (!current) return;
    setProposal(buildProposal(current, formRef.current.employer, new Date()));
    setStep(3);
    window.scrollTo({ top: 0 });
    document.querySelector("main")?.scrollTo?.({ top: 0 });
  }, []);

  // Work in progress survives switching tabs or reloading the page (this browser tab only).
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  // Saving waits until the saved draft has been read back in, so an empty first render can't overwrite it.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    setOverlayRoot(document.body);
    try {
      const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as { form?: Discovery; curriculum?: Curriculum | null; proposal?: Proposal | null; step?: Step } | null;
      if (saved?.form && typeof saved.form === "object") {
        setForm({ ...EMPTY_DISCOVERY, ...saved.form });
        if (saved.curriculum?.modules) setCurriculum(saved.curriculum);
        if (saved.proposal?.pricing) setProposal(saved.proposal);
        if (saved.step === 2 && saved.curriculum) setStep(2);
        if (saved.step === 3 && saved.proposal) setStep(3);
      }
    } catch { /* nothing saved, or storage is unavailable */ }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ form, curriculum, proposal, step })); } catch { /* storage is unavailable */ }
  }, [restored, form, curriculum, proposal, step]);
  function startOver() {
    setForm(EMPTY_DISCOVERY); setCurriculum(null); setProposal(null); setStep(1); setAnalyzeNote(null); setGenNote(null);
    setMessages([]); setQuick([]); setReqiState("idle");
  }

  // Printing shows only the proposal: it is copied into a print-only layer directly under <body>.
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const root = document.createElement("div");
    root.className = "program-print-root";
    document.body.appendChild(root);
    setPrintRoot(root);
    return () => { root.remove(); document.body.classList.remove("print-program-proposal"); };
  }, []);
  useEffect(() => {
    document.body.classList.toggle("print-program-proposal", step === 3 && proposal !== null);
  }, [step, proposal]);

  // ── Reqi ──────────────────────────────────────────────────────────────────
  const [reqiOpen, setReqiOpen] = useState(false);
  const [reqiState, setReqiState] = useState<ReqiState>("idle");
  const [messages, setMessages] = useState<ReqiMessage[]>([]);
  const [quick, setQuick] = useState<string[]>([]);
  const [reqiInput, setReqiInput] = useState("");
  const [reqiBusy, setReqiBusy] = useState(false);
  const reqiStateRef = useRef(reqiState); reqiStateRef.current = reqiState;
  const nextId = useRef(1);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const reqiInputRef = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { messagesEnd.current?.scrollIntoView({ block: "end" }); }, [messages]);

  /** Shows the typing dots, then the message. */
  async function agentSay(say: ReqiSay, delay: number) {
    const id = nextId.current++;
    setMessages((all) => [...all, { id, role: "agent", text: "", typing: true }]);
    await wait(delay);
    if (!alive.current) return;
    setMessages((all) => all.map((m) => (m.id === id ? { id, role: "agent", text: say.text, actions: say.actions } : m)));
  }

  async function playTurn(turn: ReqiTurn) {
    setReqiBusy(true);
    setQuick([]);
    setReqiState(turn.state);
    let filled = formRef.current;
    if (turn.form) { filled = { ...filled, ...turn.form }; formRef.current = filled; setForm(filled); }
    const [first, ...rest] = turn.say;
    if (first) await agentSay(first, 550);
    // Reqi does the work between announcing it and reporting back.
    if (turn.effect === "build") await generate(filled);
    else if (turn.effect === "proposal") createProposal();
    else if (turn.effect === "curriculum") setStep(2);
    for (const say of rest) await agentSay(say, 800);
    if (!alive.current) return;
    setQuick(turn.quick ?? []);
    setReqiBusy(false);
  }

  function openReqi() {
    setReqiOpen(true);
    setTimeout(() => reqiInputRef.current?.focus(), 50);
    if (reqiStateRef.current === "idle" && messages.length === 0) void playTurn(REQI_GREETING);
  }

  function reqiSend(raw: string) {
    const message = raw.trim();
    if (!message || reqiBusy) return;
    setReqiInput("");
    setMessages((all) => [...all, { id: nextId.current++, role: "user", text: message }]);
    void playTurn(reqiReply(reqiStateRef.current, message, formRef.current, curriculumState.current !== null));
  }

  const steps: [Step, string][] = [[1, "Discovery"], [2, "Curriculum"], [3, "Proposal"]];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Program Builder</h2>
          <p className="text-sm text-zinc-600">From an employer&apos;s need to a priced proposal.{" "}
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

      {step < 3 && (
        <div className="grid items-start gap-5 lg:grid-cols-[400px_1fr]">
          {/* Intake */}
          <Card className="p-5">
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
                  <span className="mb-2 inline-block rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-[11.5px] font-bold tracking-wide text-primary">DRAFT — FOR PROGRAM TEAM REVIEW</span>
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
                  <Button type="button" onClick={createProposal}>Create employer proposal<ArrowRight className="h-4 w-4" /></Button>
                  <Button type="button" variant="outline" onClick={() => void generate()} disabled={generating}>
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Regenerate
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {step === 3 && proposal && (
        <div>
          <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur">
            <p className="text-[13px] text-zinc-600">Click any line to edit it. Fill in the investment amounts before exporting.</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-3.5 w-3.5" />Back to curriculum</Button>
              <Button type="button" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" />Export PDF / Print</Button>
            </div>
          </div>
          <ProposalDocument proposal={proposal} onChange={setProposal} />
        </div>
      )}
      {printRoot && proposal && createPortal(<ProposalDocument proposal={proposal} printing />, printRoot)}

      {/* Reqi sits above the page's own assistant button. Drawn under <body>, since the tab's enter animation would re-anchor a fixed element. */}
      {overlayRoot && createPortal(<>
      {!reqiOpen && (
        <button type="button" onClick={openReqi} className="focus-ring fixed bottom-24 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-95 print:hidden">
          <span className="h-2 w-2 rounded-full bg-emerald-200 shadow-[0_0_8px] shadow-emerald-200" aria-hidden="true" />Ask Reqi
        </button>
      )}
      {reqiOpen && (
        <section aria-label="Reqi, program design agent" className="fixed bottom-24 right-6 z-40 flex h-[min(540px,calc(100vh-8rem))] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl print:hidden">
          <header className="flex items-center gap-2.5 bg-primary px-4 py-3 text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-extrabold text-primary" aria-hidden="true">R</span>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">Reqi — Program Design Agent</p>
              <p className="flex items-center gap-1.5 text-[11.5px] opacity-90"><span className="h-1.5 w-1.5 rounded-full bg-emerald-200" aria-hidden="true" />builds while you talk</p>
            </div>
            <button type="button" onClick={() => setReqiOpen(false)} aria-label="Close Reqi" className="focus-ring ml-auto rounded-lg p-1 opacity-90 hover:opacity-100"><X className="h-4 w-4" /></button>
          </header>
          <div className="flex-1 space-y-2.5 overflow-y-auto bg-zinc-50 px-3.5 py-4" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={cn(
                "max-w-[86%] rounded-xl px-3 py-2 text-[13.5px] leading-normal",
                message.role === "agent" ? "rounded-tl-sm border border-zinc-200 bg-white text-zinc-800" : "ml-auto rounded-tr-sm bg-primary text-white"
              )}>
                {message.typing ? (
                  <span className="inline-flex gap-1" aria-label="Reqi is typing">
                    {[0, 150, 300].map((delay) => <i key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${delay}ms` }} />)}
                  </span>
                ) : (
                  <>
                    <ReqiText text={message.text} />
                    {message.actions && message.actions.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {message.actions.map((action) => (
                          <span key={action} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11.5px] font-bold text-primary"><Check className="h-3 w-3" aria-hidden="true" />{action}</span>
                        ))}
                      </span>
                    )}
                  </>
                )}
              </div>
            ))}
            <div ref={messagesEnd} />
          </div>
          {quick.length > 0 && (
            <div className="flex flex-wrap gap-1.5 bg-zinc-50 px-3.5 pb-2">
              {quick.map((option) => (
                <button key={option} type="button" disabled={reqiBusy} onClick={() => reqiSend(option)} className="focus-ring rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:border-primary disabled:opacity-50">{option}</button>
              ))}
            </div>
          )}
          <form className="flex gap-2 border-t border-zinc-200 bg-white px-3.5 py-3" onSubmit={(e) => { e.preventDefault(); reqiSend(reqiInput); }}>
            <textarea
              ref={reqiInputRef}
              value={reqiInput}
              onChange={(e) => setReqiInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); reqiSend(reqiInput); } }}
              maxLength={6000}
              placeholder="Describe the program, or paste a transcript…"
              aria-label="Message Reqi"
              className="focus-ring h-[42px] flex-1 resize-none rounded-xl border border-zinc-200 px-3 py-2 text-[13.5px] text-zinc-900"
            />
            <Button type="submit" size="sm" disabled={reqiBusy || !reqiInput.trim()} aria-label="Send to Reqi" className="h-[42px]"><Send className="h-4 w-4" /></Button>
          </form>
        </section>
      )}
      </>, overlayRoot)}
    </div>
  );
}
