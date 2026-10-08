export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { SemaphoreFullError } from "@/lib/ai-semaphore";
import { readAssignmentAi } from "@/lib/assignment-ai";
import { assignmentPrompt, generateAssignment } from "@/lib/assignment-generate";
import { buildLearnerPersonaLine, cleanLessonText, lessonHasEnoughContent, type AiLesson } from "@/lib/personalized-learning";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";

/**
 * Lets a tutor see what their guardrails produce before saving the lesson:
 * writes one sample assignment for a made-up learner, from the lesson details
 * in the form. Nothing is stored, and no real learner's data is used.
 */
const MAX_REQUEST_BYTES = 24 * 1024;
const previewLimiter = createRateLimiter(6, 60_000);

/** Two invented learners, so a second preview shows how much the assignment changes between people. */
const SAMPLE_LEARNERS = [
  { label: "a marketing coordinator at a retail company who wants to move into a data role", position: "Marketing coordinator", qualification: "BA in Communications, 3 years in retail marketing", learningGoal: "Move into a data-focused role", weakConcepts: ["choosing the right metric"] },
  { label: "a nurse who wants to lead digital projects on their ward", position: "Registered nurse", qualification: "Nursing degree, 6 years on a hospital ward", learningGoal: "Lead digital improvement projects at work", weakConcepts: ["writing clear requirements"] },
];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin" && session.user.role !== "tutor") return Response.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await readJsonBody(req, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return Response.json({ error: "Request body too large." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return Response.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ai = readAssignmentAi(body.assignmentAi);
  if (!ai) return Response.json({ error: "Write your guardrails first (at least a sentence)." }, { status: 400 });

  const lesson: AiLesson = {
    id: "preview",
    title: cleanLessonText(body.title, 200),
    description: cleanLessonText(body.description, 1200),
    keyTakeaways: Array.isArray(body.keyTakeaways) ? body.keyTakeaways.map((t) => cleanLessonText(t, 180)).filter(Boolean).slice(0, 8) : [],
    assignment: cleanLessonText(body.assignment, 1200) || undefined,
    tutorAuthored: true,
  };
  if (!lesson.title) return Response.json({ error: "Add a lesson title in step 1 first." }, { status: 400 });
  // The guardrails count as content: they say what the assignment is about.
  if (!lessonHasEnoughContent({ ...lesson, assignment: `${lesson.assignment ?? ""} ${ai.guardrails}` })) {
    return Response.json({ error: "Add a little more about the lesson (description or key takeaways) so the assignment has something to build on." }, { status: 422 });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return Response.json({ error: "Assignment generation isn't set up on this server." }, { status: 503 });
  const { limited, retryAfterMs } = previewLimiter.check(String(session.user.id));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  const sample = SAMPLE_LEARNERS[body.sample === 1 ? 1 : 0];
  const personaLine = buildLearnerPersonaLine({
    position: ai.use.includes("background") ? sample.position : null,
    qualification: ai.use.includes("background") ? sample.qualification : null,
    learningGoal: ai.use.includes("goal") ? sample.learningGoal : null,
    dateOfBirth: null,
    weakConcepts: ai.use.includes("quiz") ? sample.weakConcepts : [],
  });
  try {
    const assignment = await generateAssignment(apiKey, assignmentPrompt({ lesson, personaLine, ai, seed: body.sample === 1 ? 7204 : 3518 }), { userId: session.user.id, preview: true });
    return Response.json({ assignment: JSON.stringify(assignment), sampleLearner: sample.label });
  } catch (error) {
    if (error instanceof SemaphoreFullError) return Response.json({ error: "The assignment service is busy. Try again in a moment." }, { status: 503 });
    return Response.json({ error: "Couldn't write a sample right now. Try again." }, { status: 502 });
  }
}
