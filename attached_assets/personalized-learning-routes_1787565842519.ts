// ============================================================================
// Requisor University — Personalized Learning Routes
// Three routes in one file for review; split into separate route files:
//   1. app/api/lessons/[lessonId]/assignment/route.ts
//   2. app/api/lessons/[lessonId]/quiz/route.ts
//   3. app/api/lessons/[lessonId]/quiz/grade/route.ts
//
// Key changes vs. original:
//   - Lesson content loaded server-side by lessonId (no prompt injection,
//     no generating for lessons the user can't access)
//   - Generated artifacts persisted per (user, lesson) — stable + cheap
//   - Quiz answers stored server-side only; grading happens on the server
//   - Quiz results feed a mastery table → next generation adapts (the loop)
//   - Coarse age band instead of exact age (less PII to third party)
//   - AbortController timeout on upstream calls
// ============================================================================

export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db, type DbUser } from "@/lib/db";

const BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-3-mini";
const UPSTREAM_TIMEOUT_MS = 30_000;

// ----------------------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------------------

type LearnerContext = {
  userId: string;
  qualification: string | null;
  learningGoal: string | null;
  ageBand: string | null;
  weakConcepts: string[]; // from mastery table — drives adaptation
};

function ageBandFromDob(dob: Date | null): string | null {
  if (!dob) return null;
  const years = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
  if (years < 18) return "under 18";
  if (years < 25) return "18-24";
  if (years < 40) return "25-39";
  if (years < 60) return "40-59";
  return "60+";
}

function buildPersonaLine(ctx: LearnerContext): string {
  const parts: string[] = [];
  if (ctx.qualification) parts.push(`background: ${ctx.qualification}`);
  if (ctx.ageBand) parts.push(`age group: ${ctx.ageBand}`);
  if (ctx.learningGoal) parts.push(`learning goal: ${ctx.learningGoal}`);
  if (!parts.length) return "";
  let line = `The learner has the following profile — ${parts.join(", ")}.`;
  if (ctx.weakConcepts.length) {
    line += ` Recent quiz performance shows they struggle with: ${ctx.weakConcepts.join(", ")}. Reinforce these.`;
  }
  return line;
}

async function requireSession(): Promise<{ email: string } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return { email: session.user.email.toLowerCase() };
}

async function loadLearnerContext(email: string): Promise<LearnerContext | null> {
  const { rows } = await db.query<DbUser & { id: string }>(
    "SELECT id, date_of_birth, qualification, learning_goal FROM users WHERE email = $1",
    [email]
  );
  const user = rows[0];
  if (!user) return null;

  // Weakest concepts from graded quiz history (see learner_mastery below)
  const { rows: weak } = await db.query<{ concept: string }>(
    `SELECT concept FROM learner_mastery
     WHERE user_id = $1 AND mastery_score < 0.6
     ORDER BY mastery_score ASC LIMIT 3`,
    [user.id]
  );

  return {
    userId: user.id,
    qualification: user.qualification ?? null,
    learningGoal: user.learning_goal ?? null,
    ageBand: ageBandFromDob(user.date_of_birth ? new Date(user.date_of_birth) : null),
    weakConcepts: weak.map((w) => w.concept),
  };
}

type Lesson = {
  id: string;
  title: string;
  description: string | null;
  key_takeaways: string[] | null;
  base_assignment: string | null;
  concepts: string[] | null; // tagged concepts, used for mastery tracking
};

// Server-side lookup — the client only ever sends a lessonId.
async function loadLesson(lessonId: string): Promise<Lesson | null> {
  const { rows } = await db.query<Lesson>(
    "SELECT id, title, description, key_takeaways, base_assignment, concepts FROM lessons WHERE id = $1",
    [lessonId]
  );
  return rows[0] ?? null;
}

async function callModel(prompt: string, opts?: { json?: boolean; maxTokens?: number }): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: opts?.maxTokens ?? 300,
        temperature: 0.7,
        ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`xAI API error: ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("Empty model response");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 1. ASSIGNMENT — POST /api/lessons/[lessonId]/assignment
//    Body: { regenerate?: boolean }
// ============================================================================

export async function POST_assignment(req: Request, { params }: { params: { lessonId: string } }) {
  const auth = await requireSession();
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await loadLearnerContext(auth.email);
  if (!ctx) return Response.json({ error: "Profile not found" }, { status: 404 });

  const lesson = await loadLesson(params.lessonId);
  if (!lesson) return Response.json({ error: "Lesson not found" }, { status: 404 });

  const { regenerate = false } = await req.json().catch(() => ({}));

  // Return the persisted assignment unless explicitly regenerating
  if (!regenerate) {
    const { rows } = await db.query<{ content: string }>(
      "SELECT content FROM generated_assignments WHERE user_id = $1 AND lesson_id = $2",
      [ctx.userId, lesson.id]
    );
    if (rows[0]) return Response.json({ assignment: rows[0].content, cached: true });
  }

  const personaLine = buildPersonaLine(ctx);
  const prompt = [
    "You are generating a personalised practical assignment for a learner after they watch a lesson.",
    personaLine
      ? `${personaLine} Adapt the assignment's framing, examples, and complexity to their background and goal.`
      : "",
    "",
    `Lesson title: ${lesson.title}`,
    lesson.description ? `Lesson description: ${lesson.description}` : "",
    lesson.key_takeaways?.length ? `Key takeaways: ${lesson.key_takeaways.join("; ")}` : "",
    lesson.base_assignment ? `Original assignment (use as a base, but personalise it): ${lesson.base_assignment}` : "",
    "",
    "Write a single practical assignment instruction in 2-4 sentences. Be specific, actionable, and relevant to the learner's context.",
    "Do NOT include a title, heading, bullet points, or any markdown. Just return the plain assignment text.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const text = await callModel(prompt);
    await db.query(
      `INSERT INTO generated_assignments (user_id, lesson_id, content, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET content = $3, created_at = NOW()`,
      [ctx.userId, lesson.id, text]
    );
    return Response.json({ assignment: text, cached: false });
  } catch (err) {
    console.error("[assignment] Error:", err);
    return Response.json({ error: "Couldn't generate assignment right now." }, { status: 500 });
  }
}

// ============================================================================
// 2. QUIZ GENERATION — POST /api/lessons/[lessonId]/quiz
//    Returns questions WITHOUT correct answers. Answers live server-side only.
// ============================================================================

type QuizQuestion = {
  id: string;
  concept: string;
  question: string;
  options: string[]; // 4 options
  correctIndex: number; // stored server-side, stripped before sending to client
  explanation: string;
};

export async function POST_quiz(_req: Request, { params }: { params: { lessonId: string } }) {
  const auth = await requireSession();
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await loadLearnerContext(auth.email);
  if (!ctx) return Response.json({ error: "Profile not found" }, { status: 404 });

  const lesson = await loadLesson(params.lessonId);
  if (!lesson) return Response.json({ error: "Lesson not found" }, { status: 404 });

  const personaLine = buildPersonaLine(ctx);
  const prompt = [
    "Generate a 5-question multiple-choice quiz for this lesson.",
    personaLine
      ? `${personaLine} Frame questions and answer options using scenarios from the learner's background where natural. If weak concepts are listed, weight 2 of the 5 questions toward those.`
      : "",
    "",
    `Lesson title: ${lesson.title}`,
    lesson.description ? `Lesson description: ${lesson.description}` : "",
    lesson.key_takeaways?.length ? `Key takeaways: ${lesson.key_takeaways.join("; ")}` : "",
    lesson.concepts?.length ? `Concepts covered (tag each question with exactly one): ${lesson.concepts.join(", ")}` : "",
    "",
    `Respond with ONLY a JSON object, no markdown fences, in this exact shape:`,
    `{"questions":[{"concept":"...","question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}`,
    "Each question has exactly 4 options and one correct answer. Explanations are 1-2 sentences.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await callModel(prompt, { json: true, maxTokens: 2000 });
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as { questions: Omit<QuizQuestion, "id">[] };

    // Validate shape before trusting it
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) throw new Error("Bad quiz shape");
    for (const q of parsed.questions) {
      if (!q.question || !Array.isArray(q.options) || q.options.length !== 4) throw new Error("Bad question shape");
      if (typeof q.correctIndex !== "number" || q.correctIndex < 0 || q.correctIndex > 3) throw new Error("Bad correctIndex");
    }

    const questions: QuizQuestion[] = parsed.questions.map((q, i) => ({ ...q, id: `q${i + 1}` }));

    // Persist full quiz (with answers) server-side
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO generated_quizzes (user_id, lesson_id, questions, created_at)
       VALUES ($1, $2, $3, NOW()) RETURNING id`,
      [ctx.userId, lesson.id, JSON.stringify(questions)]
    );

    // Client gets questions with answers stripped
    const clientQuestions = questions.map(({ correctIndex, explanation, ...rest }) => rest);
    return Response.json({ quizId: rows[0].id, questions: clientQuestions });
  } catch (err) {
    console.error("[quiz] Error:", err);
    return Response.json({ error: "Couldn't generate quiz right now." }, { status: 500 });
  }
}

// ============================================================================
// 3. QUIZ GRADING — POST /api/lessons/[lessonId]/quiz/grade
//    Body: { quizId: string, answers: { [questionId: string]: number } }
//    Grades server-side, updates mastery, returns results + explanations.
// ============================================================================

export async function POST_grade(req: Request) {
  const auth = await requireSession();
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await loadLearnerContext(auth.email);
  if (!ctx) return Response.json({ error: "Profile not found" }, { status: 404 });

  let body: { quizId?: string; answers?: Record<string, number> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.quizId || !body.answers) {
    return Response.json({ error: "Missing quizId or answers." }, { status: 400 });
  }

  // Ownership check: quiz must belong to this user
  const { rows } = await db.query<{ questions: QuizQuestion[]; lesson_id: string }>(
    "SELECT questions, lesson_id FROM generated_quizzes WHERE id = $1 AND user_id = $2",
    [body.quizId, ctx.userId]
  );
  const quiz = rows[0];
  if (!quiz) return Response.json({ error: "Quiz not found." }, { status: 404 });

  const questions: QuizQuestion[] = typeof quiz.questions === "string" ? JSON.parse(quiz.questions) : quiz.questions;

  const results = questions.map((q) => {
    const given = body.answers![q.id];
    const correct = given === q.correctIndex;
    return { id: q.id, concept: q.concept, correct, correctIndex: q.correctIndex, explanation: q.explanation };
  });

  // Update mastery per concept with an exponential moving average —
  // this is what makes the NEXT quiz/assignment adaptive.
  const byConcept = new Map<string, { total: number; correct: number }>();
  for (const r of results) {
    const c = byConcept.get(r.concept) ?? { total: 0, correct: 0 };
    c.total += 1;
    if (r.correct) c.correct += 1;
    byConcept.set(r.concept, c);
  }
  for (const [concept, { total, correct }] of byConcept) {
    const score = correct / total;
    await db.query(
      `INSERT INTO learner_mastery (user_id, concept, mastery_score, attempts, updated_at)
       VALUES ($1, $2, $3, 1, NOW())
       ON CONFLICT (user_id, concept)
       DO UPDATE SET mastery_score = learner_mastery.mastery_score * 0.7 + $3 * 0.3,
                     attempts = learner_mastery.attempts + 1,
                     updated_at = NOW()`,
      [ctx.userId, concept, score]
    );
  }

  const scorePct = Math.round((results.filter((r) => r.correct).length / results.length) * 100);
  return Response.json({ score: scorePct, results });
}

// ============================================================================
// Schema (migrations to add)
// ============================================================================
/*
CREATE TABLE generated_assignments (
  user_id    UUID NOT NULL REFERENCES users(id),
  lesson_id  UUID NOT NULL REFERENCES lessons(id),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE generated_quizzes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  lesson_id  UUID NOT NULL REFERENCES lessons(id),
  questions  JSONB NOT NULL,          -- includes correctIndex; never sent raw to client
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE learner_mastery (
  user_id       UUID NOT NULL REFERENCES users(id),
  concept       TEXT NOT NULL,
  mastery_score REAL NOT NULL,        -- 0..1, EMA of quiz performance
  attempts      INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, concept)
);

-- lessons table needs: concepts TEXT[] (tag each lesson's 3-6 core concepts)
*/
