/**
 * A course's syllabus. A tutor either fills in a template (the sections of a
 * standard university syllabus: course information, outcomes, texts, structure,
 * grading, policies) or uploads their own Word/PDF document.
 *
 * Stored as JSON on the course (courses.syllabus) and saved through its own
 * endpoint, /api/tutor/courses/syllabus, not with the rest of the course.
 */

import { isResourceFileUrl } from "@/lib/resource-files";

export type SyllabusTemplate = {
  kind: "template";
  /** e.g. "BUS 6151". */
  courseCode: string;
  credits: string;
  description: string;
  prerequisites: string;
  /** What students will be able to do, and how each outcome is assessed. */
  outcomes: Array<{ outcome: string; assessments: string }>;
  /** The wider programme's outcomes this course contributes to, if any. */
  programOutcomes: string[];
  requiredTexts: string[];
  additionalResources: string;
  /** The pattern every module follows (Overview, Readings, …). */
  structure: string[];
  /** Module / week titles, in order. */
  outline: string[];
  grading: Array<{ type: string; points: number; description: string }>;
  gradingScale: Array<{ letter: string; range: string }>;
  /** Late work, communication, integrity, accessibility and anything else. */
  policies: Array<{ title: string; text: string }>;
  updatedAt: string;
};

export type SyllabusFile = { kind: "file"; fileUrl: string; fileName: string; updatedAt: string };
export type Syllabus = SyllabusTemplate | SyllabusFile;

/** The module pattern and section headings a new template starts with. All of it is editable. */
const DEFAULT_STRUCTURE = [
  "Overview: an introduction to the module's content.",
  "Readings: relevant texts to deepen knowledge.",
  "Instructional content: conceptual fundamentals and real-world applications.",
  "Knowledge check: test your understanding of the module's concepts.",
  "Assignment or discussion: apply skills to solve real-world problems.",
  "Summary: a recap of key takeaways and sources to explore further.",
];
const DEFAULT_GRADING = ["Knowledge Checks", "Discussions", "Assignments", "Community Forums"];
const DEFAULT_SCALE: Array<[string, string]> = [
  ["A", "93% +"], ["AB", "89–92.9%"], ["B", "85–88.9%"], ["BC", "81–84.9%"],
  ["C", "77–80.9%"], ["CD", "74–76.9%"], ["D", "70–73.9%"], ["F", "69.9% or less"],
];
const DEFAULT_POLICIES = [
  "Late assignment policy", "Communication and feedback", "Citation expectations",
  "Academic integrity", "Accessibility and accommodation",
];

/** A template pre-filled with what the course already says about itself. */
export function blankSyllabus(course: { tagline?: string; lessons: Array<{ title: string; section?: string }> }): SyllabusTemplate {
  const sections = [...new Set(course.lessons.map((lesson) => lesson.section?.trim()).filter((s): s is string => Boolean(s)))];
  const outline = (sections.length ? sections : course.lessons.map((lesson) => lesson.title)).slice(0, LIMITS.rows);
  return {
    kind: "template",
    courseCode: "", credits: "", description: course.tagline?.trim() ?? "", prerequisites: "None",
    outcomes: [{ outcome: "", assessments: "" }],
    programOutcomes: [],
    requiredTexts: [],
    additionalResources: "",
    structure: [...DEFAULT_STRUCTURE],
    outline,
    grading: DEFAULT_GRADING.map((type) => ({ type, points: 0, description: "" })),
    gradingScale: DEFAULT_SCALE.map(([letter, range]) => ({ letter, range })),
    policies: DEFAULT_POLICIES.map((title) => ({ title, text: "" })),
    updatedAt: new Date().toISOString(),
  };
}

const LIMITS = { short: 200, medium: 600, long: 6000, rows: 40 };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "");
const rows = (value: unknown) => (Array.isArray(value) ? value.slice(0, LIMITS.rows) : []);
const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/**
 * Cleans a syllabus coming from the browser. Returns null when it isn't a
 * syllabus at all; otherwise a tidy copy with blank rows dropped and every
 * field cut to a sensible length. Whether a file belongs to this tutor is
 * checked separately by the route.
 */
export function cleanSyllabus(value: unknown): Syllabus | null {
  const raw = record(value);
  const updatedAt = new Date().toISOString();

  if (raw.kind === "file") {
    const fileUrl = text(raw.fileUrl, 200);
    const fileName = text(raw.fileName, 200);
    if (!isResourceFileUrl(fileUrl) || !/\.(pdf|docx)$/i.test(fileName)) return null;
    return { kind: "file", fileUrl, fileName, updatedAt };
  }
  if (raw.kind !== "template") return null;

  const strings = (list: unknown, max: number) => rows(list).map((item) => text(item, max)).filter(Boolean);
  return {
    kind: "template",
    courseCode: text(raw.courseCode, 40),
    credits: text(raw.credits, 20),
    description: text(raw.description, LIMITS.long),
    prerequisites: text(raw.prerequisites, LIMITS.medium),
    outcomes: rows(raw.outcomes)
      .map((item) => ({ outcome: text(record(item).outcome, LIMITS.medium), assessments: text(record(item).assessments, LIMITS.short) }))
      .filter((item) => item.outcome),
    programOutcomes: strings(raw.programOutcomes, LIMITS.medium),
    requiredTexts: strings(raw.requiredTexts, LIMITS.medium),
    additionalResources: text(raw.additionalResources, LIMITS.long),
    structure: strings(raw.structure, LIMITS.medium),
    outline: strings(raw.outline, LIMITS.short),
    grading: rows(raw.grading)
      .map((item) => {
        const points = Number(record(item).points);
        return {
          type: text(record(item).type, LIMITS.short),
          points: Number.isFinite(points) && points > 0 ? Math.min(100000, Math.round(points * 10) / 10) : 0,
          description: text(record(item).description, LIMITS.long),
        };
      })
      .filter((item) => item.type),
    gradingScale: rows(raw.gradingScale)
      .map((item) => ({ letter: text(record(item).letter, 10), range: text(record(item).range, 60) }))
      .filter((item) => item.letter && item.range),
    policies: rows(raw.policies)
      .map((item) => ({ title: text(record(item).title, LIMITS.short), text: text(record(item).text, LIMITS.long) }))
      .filter((item) => item.title && item.text),
    updatedAt,
  };
}

/** Each grading row's share of the total, as shown in the syllabus ("22.5%"). */
export function gradingShares(grading: SyllabusTemplate["grading"]): { total: number; shares: string[] } {
  const total = grading.reduce((sum, row) => sum + row.points, 0);
  return { total, shares: grading.map((row) => (total > 0 ? `${Math.round((row.points / total) * 1000) / 10}%` : "—")) };
}

/** A template with nothing a student could usefully read isn't a syllabus yet. */
export function syllabusHasContent(syllabus: Syllabus | null | undefined): boolean {
  if (!syllabus) return false;
  if (syllabus.kind === "file") return true;
  return Boolean(syllabus.description || syllabus.outcomes.length || syllabus.outline.length || syllabus.grading.some((row) => row.points > 0) || syllabus.policies.length);
}
