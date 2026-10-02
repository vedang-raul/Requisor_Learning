/**
 * Structured practice-assignment format. Shared by the generation route (which
 * validates the model's JSON and stores it) and the lesson UI (which renders it).
 * Older rows in generated_assignments hold plain text; parseAssignment returns
 * null for those so callers can fall back to rendering the text as-is.
 */

/** Error code the assignment and quiz APIs return (HTTP 422) when a lesson is
 *  too thin to generate from — retrying won't help until the tutor adds content. */
export const INSUFFICIENT_CONTENT_CODE = "insufficient_lesson_content";

export const ASSIGNMENT_DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"] as const;
export type AssignmentDifficulty = (typeof ASSIGNMENT_DIFFICULTIES)[number];

export type AssignmentStep = { title: string; detail: string };

/** The learner-profile facts the assignment was tailored to. Filled in by the
 *  server from the learner's saved profile — never from model output — so the
 *  "tailored to" chips are always accurate. */
export type AssignmentTailoring = {
  background?: string;
  goal?: string;
  reinforces?: string[];
};

export type StructuredAssignment = {
  v: 1;
  title: string;
  /** Model-written note to the learner on why this task is useful for them.
   *  Empty on assignments generated before this field existed. */
  whyForYou: string;
  tailoredTo?: AssignmentTailoring;
  scenario: string;
  objective: string;
  steps: AssignmentStep[];
  deliverables: string[];
  successCriteria: string[];
  tip: string;
  estimatedMinutes: number;
  difficulty: AssignmentDifficulty;
};

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-*•#>\d.)\s]+/, "") // strip stray markdown bullets / numbering
    .replace(/\*\*|__|`/g, "")
    .trim()
    .slice(0, max);
}

function cleanList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, maxLen)).filter(Boolean).slice(0, maxItems);
}

/** Keeps only non-empty, length-capped tailoring facts; undefined if none remain. */
export function cleanTailoring(raw: Record<string, unknown>): AssignmentTailoring | undefined {
  const background = cleanText(raw.background, 80);
  const goal = cleanText(raw.goal, 120);
  const reinforces = cleanList(raw.reinforces, 3, 80);
  const tailoring: AssignmentTailoring = {
    ...(background ? { background } : {}),
    ...(goal ? { goal } : {}),
    ...(reinforces.length ? { reinforces } : {}),
  };
  return Object.keys(tailoring).length ? tailoring : undefined;
}

/** Validates untrusted model output (object or JSON string) into a StructuredAssignment. */
export function toStructuredAssignment(raw: unknown): StructuredAssignment | null {
  let value = raw;
  if (typeof value === "string") {
    // Models sometimes wrap JSON in a code fence despite instructions.
    const text = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
    try {
      value = JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;

  const steps = Array.isArray(obj.steps)
    ? obj.steps
        .map((step) => {
          if (typeof step === "string") return { title: cleanText(step, 90), detail: "" };
          if (!step || typeof step !== "object") return null;
          const s = step as Record<string, unknown>;
          return { title: cleanText(s.title, 90), detail: cleanText(s.detail, 400) };
        })
        .filter((s): s is AssignmentStep => Boolean(s && s.title))
        .slice(0, 6)
    : [];

  const title = cleanText(obj.title, 100);
  const objective = cleanText(obj.objective, 300);
  if (!title || !objective || steps.length < 2) return null;

  const minutes = Math.round(Number(obj.estimatedMinutes));
  const difficulty = ASSIGNMENT_DIFFICULTIES.find(
    (d) => d.toLowerCase() === String(obj.difficulty ?? "").trim().toLowerCase()
  );

  const tailoring = obj.tailoredTo && typeof obj.tailoredTo === "object" && !Array.isArray(obj.tailoredTo)
    ? cleanTailoring(obj.tailoredTo as Record<string, unknown>)
    : undefined;

  return {
    v: 1,
    title,
    whyForYou: cleanText(obj.whyForYou, 400),
    ...(tailoring ? { tailoredTo: tailoring } : {}),
    scenario: cleanText(obj.scenario, 500),
    objective,
    steps,
    deliverables: cleanList(obj.deliverables, 5, 200),
    successCriteria: cleanList(obj.successCriteria, 5, 200),
    tip: cleanText(obj.tip, 250),
    estimatedMinutes: Number.isFinite(minutes) ? Math.min(Math.max(minutes, 10), 480) : 45,
    difficulty: difficulty ?? "Intermediate",
  };
}

/** Parses stored assignment content; null means legacy plain text. */
export function parseAssignment(content: string): StructuredAssignment | null {
  if (!content.trimStart().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(content) as { v?: unknown };
    return parsed?.v === 1 ? toStructuredAssignment(parsed) : null;
  } catch {
    return null;
  }
}

/** One-paragraph plain-text summary, for places that show a short brief. */
export function assignmentSummary(content: string): string {
  const a = parseAssignment(content);
  return a ? `${a.title}: ${a.objective}` : content;
}
