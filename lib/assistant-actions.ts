import type { Course, Lesson } from "@/lib/types";

/**
 * Actions the AI assistant can *propose* in chat. The model never changes
 * data itself: the server validates a proposal and streams it to the chat
 * panel, which shows it as a confirmation card. Only when the user clicks
 * Confirm does the panel call the same authorized API the regular screens use.
 */
export type AssistantAction =
  // learners
  | { kind: "generate_assignment"; id: string; lessonId: string; lessonTitle: string; courseSlug: string }
  | { kind: "open_quiz"; id: string; lessonId: string; lessonTitle: string; courseSlug: string }
  // navigation (any role)
  | { kind: "open_page"; id: string; href: string; label: string }
  // tutors / admins
  | { kind: "grade_submission"; id: string; submissionId: number; studentName: string; lessonTitle: string; points: number; maxPoints: number; /** "None", "Late", "Missing" or "Excused". */ status: string }
  | { kind: "set_course_published"; id: string; courseSlug: string; courseTitle: string; published: boolean }
  | { kind: "create_lesson"; id: string; courseSlug: string; courseTitle: string; lesson: Lesson }
  /** A whole new course, with any drafted lessons. Always starts as a private draft. */
  | { kind: "create_course"; id: string; course: Course }
  /** Changed course details only; lessons are untouched. */
  | { kind: "update_course"; id: string; courseSlug: string; courseTitle: string; changes: Partial<Pick<Course, "title" | "tagline" | "category" | "level" | "tags" | "baseAssessment" | "cover">>; summary: string[] }
  /** An existing lesson with edits applied (same id). */
  | { kind: "update_lesson"; id: string; courseSlug: string; courseTitle: string; lesson: Lesson; summary: string[] }
  | { kind: "set_lesson_published"; id: string; courseSlug: string; courseTitle: string; lessonId: string; lessonTitle: string; published: boolean; /** Scheduled launch (ISO); absent = right away. */ publishAt?: string };

/** ASCII record separator: frames an action inside the streamed reply. Model
 *  text is stripped of this character, so only the server can emit a frame. */
export const ACTION_FRAME = "\u001e";

export function encodeActionFrame(action: AssistantAction): string {
  return `${ACTION_FRAME}${JSON.stringify(action)}${ACTION_FRAME}`;
}

const KINDS = new Set<AssistantAction["kind"]>([
  "generate_assignment", "open_quiz", "open_page", "grade_submission",
  "set_course_published", "create_lesson", "set_lesson_published", "create_course", "update_course", "update_lesson",
]);

/**
 * Splits streamed text into visible text and complete action frames. An
 * unfinished frame at the end is held back (`pending`) until more arrives.
 */
export function splitActionFrames(raw: string): { text: string; actions: AssistantAction[]; pending: string } {
  const actions: AssistantAction[] = [];
  let text = "";
  let rest = raw;
  while (true) {
    const start = rest.indexOf(ACTION_FRAME);
    if (start < 0) { text += rest; return { text, actions, pending: "" }; }
    text += rest.slice(0, start);
    const end = rest.indexOf(ACTION_FRAME, start + 1);
    if (end < 0) return { text, actions, pending: rest.slice(start) };
    try {
      const parsed = JSON.parse(rest.slice(start + 1, end)) as AssistantAction;
      if (parsed && typeof parsed === "object" && KINDS.has(parsed.kind)) actions.push(parsed);
    } catch {
      // Malformed frame: drop it rather than show raw JSON.
    }
    rest = rest.slice(end + 1);
  }
}
