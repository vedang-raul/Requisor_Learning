/**
 * Which kind of assignment a learner's submission answers (stored in
 * assignment_submissions.source):
 *  - "tutor": the lesson's own assignment, set by its tutor (requires_submission)
 *  - "ai":    the learner's personalized, AI-generated practice assignment
 */
export type SubmissionSource = "tutor" | "ai";

export const SUBMISSION_SOURCE_LABEL: Record<SubmissionSource, string> = {
  tutor: "Tutor assignment",
  ai: "AI practice",
};

export function toSubmissionSource(value: unknown): SubmissionSource {
  return value === "ai" ? "ai" : "tutor";
}
