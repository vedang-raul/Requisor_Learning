"use client";

import { useEffect, useState } from "react";
import { Download, FileText, ScrollText, X } from "lucide-react";
import { gradingShares, syllabusHasContent, type Syllabus, type SyllabusTemplate } from "@/lib/syllabus";

/**
 * A course syllabus as learners read it: either the filled-in template laid
 * out like a standard university syllabus, or the tutor's own PDF/Word file.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="border-b border-border pb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary">{title}</h2>
      {children}
    </section>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      <div className="text-sm leading-relaxed text-zinc-700">{children}</div>
    </div>
  );
}
const paragraphs = (text: string) => text.split(/\n{2,}/).map((part, i) => <p key={i} className="whitespace-pre-line [&+p]:mt-2">{part}</p>);
const cell = "border border-border px-3 py-2 align-top";

function TemplateSyllabus({ syllabus, courseTitle }: { syllabus: SyllabusTemplate; courseTitle: string }) {
  const { total, shares } = gradingShares(syllabus.grading);
  const described = syllabus.grading.filter((row) => row.description);
  return (
    <article className="space-y-7">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Syllabus</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">{[syllabus.courseCode, courseTitle].filter(Boolean).join(" ")}</h1>
      </header>

      <Section title="Course information">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold text-zinc-900">Course number and title</dt><dd className="text-zinc-700">{[syllabus.courseCode, courseTitle].filter(Boolean).join(" ")}</dd>
          {syllabus.credits && <><dt className="font-semibold text-zinc-900">Credits</dt><dd className="text-zinc-700">{syllabus.credits}</dd></>}
        </dl>
        {syllabus.description && <Block title="Course description">{paragraphs(syllabus.description)}</Block>}
        {syllabus.outcomes.length > 0 && (
          <Block title="Course outcomes">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead><tr className="bg-zinc-50"><th className={cell}>Course outcome</th><th className={cell}>Assessments</th></tr></thead>
                <tbody>{syllabus.outcomes.map((row, i) => <tr key={i}><td className={cell}>{row.outcome}</td><td className={cell}>{row.assessments || "—"}</td></tr>)}</tbody>
              </table>
            </div>
          </Block>
        )}
        {syllabus.programOutcomes.length > 0 && <Block title="Program outcomes"><ol className="list-decimal space-y-1 pl-5">{syllabus.programOutcomes.map((item, i) => <li key={i}>{item}</li>)}</ol></Block>}
        {syllabus.prerequisites && <Block title="Pre-requisite courses">{syllabus.prerequisites}</Block>}
      </Section>

      {(syllabus.requiredTexts.length > 0 || syllabus.additionalResources || syllabus.structure.length > 0 || syllabus.outline.length > 0) && (
        <Section title="Course details">
          {(syllabus.requiredTexts.length > 0 || syllabus.additionalResources) && (
            <Block title="Text and resource list">
              {syllabus.requiredTexts.length > 0 && <><p className="font-medium text-zinc-800">Required books</p><ul className="mt-1 list-disc space-y-1 pl-5">{syllabus.requiredTexts.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
              {syllabus.additionalResources && <div className="mt-2"><p className="font-medium text-zinc-800">Additional required resources</p><div className="mt-1">{paragraphs(syllabus.additionalResources)}</div></div>}
            </Block>
          )}
          {syllabus.structure.length > 0 && <Block title="Course structure"><ul className="list-disc space-y-1 pl-5">{syllabus.structure.map((item, i) => <li key={i}>{item}</li>)}</ul></Block>}
          {syllabus.outline.length > 0 && <Block title="Outline of course"><ol className="space-y-1">{syllabus.outline.map((item, i) => <li key={i}><span className="font-medium text-zinc-900">Module {i + 1}:</span> {item}</li>)}</ol></Block>}
        </Section>
      )}

      {(syllabus.grading.length > 0 || syllabus.gradingScale.length > 0) && (
        <Section title="Grading">
          {syllabus.grading.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full max-w-lg border-collapse text-left text-sm">
                <thead><tr className="bg-zinc-50"><th className={cell}>Assignment type</th><th className={`${cell} text-right`}>Points</th><th className={`${cell} text-right`}>Grade %</th></tr></thead>
                <tbody>
                  {syllabus.grading.map((row, i) => <tr key={i}><td className={cell}>{row.type}</td><td className={`${cell} text-right tabular-nums`}>{row.points || "—"}</td><td className={`${cell} text-right tabular-nums`}>{shares[i]}</td></tr>)}
                  {total > 0 && <tr className="font-semibold"><td className={cell}>Total</td><td className={`${cell} text-right tabular-nums`}>{total}</td><td className={`${cell} text-right`}>100%</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {described.length > 0 && <Block title="Assignment type descriptions"><div className="space-y-2">{described.map((row, i) => <p key={i}><span className="font-semibold text-zinc-900">{row.type}:</span> {row.description}</p>)}</div></Block>}
          {syllabus.gradingScale.length > 0 && (
            <Block title="Grading scale">
              <table className="border-collapse text-left text-sm">
                <thead><tr className="bg-zinc-50"><th className={cell}>Letter</th><th className={cell}>Range</th></tr></thead>
                <tbody>{syllabus.gradingScale.map((row, i) => <tr key={i}><td className={`${cell} font-medium`}>{row.letter}</td><td className={cell}>{row.range}</td></tr>)}</tbody>
              </table>
            </Block>
          )}
        </Section>
      )}

      {syllabus.policies.length > 0 && (
        <Section title="Policies and support">
          {syllabus.policies.map((policy, i) => <Block key={i} title={policy.title}>{paragraphs(policy.text)}</Block>)}
        </Section>
      )}
    </article>
  );
}

export function SyllabusView({ syllabus, courseTitle }: { syllabus: Syllabus; courseTitle: string }) {
  if (syllabus.kind === "template") return <TemplateSyllabus syllabus={syllabus} courseTitle={courseTitle} />;
  const isPdf = /\.pdf$/i.test(syllabus.fileName);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-zinc-900"><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{syllabus.fileName}</span></p>
        <a href={syllabus.fileUrl} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-white"><Download className="h-4 w-4" />{isPdf ? "Open the syllabus" : "Download the syllabus"}</a>
      </div>
      {isPdf
        ? <iframe src={syllabus.fileUrl} title={`${courseTitle} syllabus`} className="h-[70vh] w-full rounded-xl border border-border bg-white" />
        : <p className="rounded-xl border border-border bg-zinc-50 p-4 text-sm text-zinc-600">This syllabus is a Word document. Download it to read it.</p>}
    </div>
  );
}

/** A "Syllabus" button that opens the course syllabus over the page. Renders nothing when the course has none. */
export function SyllabusButton({ syllabus, courseTitle, className }: { syllabus: Syllabus | null | undefined; courseTitle: string; className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!syllabus || !syllabusHasContent(syllabus)) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? "focus-ring inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"}>
        <ScrollText className="h-4 w-4" />Syllabus
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={`${courseTitle} syllabus`} className="fixed inset-0 z-[90] overflow-y-auto bg-black/40 p-3 sm:p-6" onClick={() => setOpen(false)}>
          <div className="mx-auto max-w-3xl rounded-2xl bg-white p-5 shadow-xl sm:p-8" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"><X className="h-4 w-4" />Close</button>
            </div>
            <SyllabusView syllabus={syllabus} courseTitle={courseTitle} />
          </div>
        </div>
      )}
    </>
  );
}
