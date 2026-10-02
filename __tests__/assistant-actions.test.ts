jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({ check: () => ({ limited: false, retryAfterMs: 0 }) }),
  rateLimitResponse: () => new Response("rate limited", { status: 429 }),
}));
jest.mock("@/lib/ai-semaphore", () => ({
  acquireAiSlot: jest.fn(async () => () => undefined),
  SemaphoreFullError: class SemaphoreFullError extends Error {},
}));
jest.mock("@/lib/course-catalog", () => ({
  ensureCourseCatalog: jest.fn(async () => undefined),
  getCourses: jest.fn(async () => []),
  validateCourse: jest.fn(() => ({ ok: true })),
  findLessonLocation: jest.fn(async () => null),
}));

import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { getCourses, validateCourse } from "@/lib/course-catalog";
import { ACTION_FRAME, encodeActionFrame, splitActionFrames, type AssistantAction } from "@/lib/assistant-actions";
import { runAssistantTool, toolsForRole } from "@/lib/assistant-tools";
import { POST as chatPOST } from "@/app/api/chat/route";
import type { Course } from "@/lib/types";

const mockedDb = db.query as jest.Mock;
const mockedGetCourses = getCourses as jest.Mock;
const tutor = { userId: 7, role: "tutor" as const };

const course: Course = {
  slug: "demo-course", title: "Demo Course", tagline: "t", category: "product", level: "Beginner", tags: [],
  cover: "c", addedAt: "2026-09-01", revision: 3, published: true,
  lessons: [{ id: "demo-course-1", title: "Intro", description: "d", youtubeId: "REPLACE_ME", durationMin: 10, resources: [], keyTakeaways: [], published: false }],
};

const outcome = async (name: string, args: unknown) => {
  const result = await runAssistantTool(name, JSON.stringify(args), tutor);
  return { ...result, data: JSON.parse(result.content) };
};

beforeEach(() => jest.clearAllMocks());

describe("action frames", () => {
  const action: AssistantAction = { kind: "open_page", id: "a1", href: "/app/tutor/", label: "Tutor Workspace" };

  it("splits complete frames out of streamed text and holds back a partial one", () => {
    const raw = `Sure.${encodeActionFrame(action)} Done.${ACTION_FRAME}{"kind":"open_pa`;
    const split = splitActionFrames(raw);
    expect(split.text).toBe("Sure. Done.");
    expect(split.actions).toEqual([action]);
    expect(split.pending.startsWith(ACTION_FRAME)).toBe(true);
  });

  it("drops malformed or unknown frames instead of showing them", () => {
    const split = splitActionFrames(`a${ACTION_FRAME}not json${ACTION_FRAME}b${ACTION_FRAME}{"kind":"delete_everything"}${ACTION_FRAME}c`);
    expect(split).toEqual({ text: "abc", actions: [], pending: "" });
  });
});

describe("assistant tools", () => {
  it("only offers learners the learner tools", () => {
    const learner = toolsForRole("employee").map((t) => t.function.name);
    expect(learner).toContain("propose_practice_assignment");
    expect(learner).not.toContain("propose_grade");
    expect(learner).not.toContain("propose_create_lesson");
  });

  it("refuses a tutor-only tool for a learner even if the model calls it", async () => {
    const result = await runAssistantTool("propose_grade", JSON.stringify({ submission_id: 1, points: 90, status: "Late" }), { userId: 3, role: "employee" });
    expect(JSON.parse(result.content).error).toMatch(/Unknown tool/);
    expect(result.action).toBeUndefined();
    expect(mockedDb).not.toHaveBeenCalled();
  });

  it("proposes a grade for the tutor's own submission, scoped by ownership in SQL", async () => {
    mockedDb.mockResolvedValueOnce({ rows: [{ student: "Demo Student", lesson: "Intro", rubric: 0 }] });
    const { action, data } = await outcome("propose_grade", { submission_id: 4, points: 85, status: "Late" });
    expect(data.status).toBe("proposed");
    expect(action).toMatchObject({ kind: "grade_submission", submissionId: 4, points: 85, status: "Late", studentName: "Demo Student" });
    expect(mockedDb.mock.calls[0][1]).toEqual([4, false, 7]);
  });

  it("sends rubric-graded submissions to the grader instead of proposing a flat mark", async () => {
    mockedDb.mockResolvedValueOnce({ rows: [{ student: "S", lesson: "L", rubric: 3 }] });
    const { action, data } = await outcome("propose_grade", { submission_id: 4, points: 85, status: "Late" });
    expect(action).toBeUndefined();
    expect(data.error).toMatch(/rubric/);
  });

  it("rejects invalid points and statuses without touching the database", async () => {
    expect((await outcome("propose_grade", { submission_id: 4, points: -5, status: "Late" })).data.error).toMatch(/points must be/);
    expect((await outcome("propose_grade", { submission_id: 4, points: 80, status: "Amazing" })).data.error).toMatch(/status must be/);
    expect(mockedDb).not.toHaveBeenCalled();
  });

  it("builds a validated text lesson proposal like the wizard would", async () => {
    mockedGetCourses.mockResolvedValueOnce([course]);
    const { action } = await outcome("propose_create_lesson", {
      course_slug: "demo-course", title: "Acceptance Criteria", description: "Writing testable criteria.",
      content_type: "text", text_body: "Given / When / Then…", key_takeaways: ["Keep them testable"],
      resource_links: [{ label: "Guide", url: "https://example.com" }, { label: "Bad", url: "javascript:alert(1)" }], publish: true,
    });
    expect(action?.kind).toBe("create_lesson");
    const lesson = (action as Extract<AssistantAction, { kind: "create_lesson" }>).lesson;
    expect(lesson).toMatchObject({ format: "reading", body: "Given / When / Then…", published: true, keyTakeaways: ["Keep them testable"] });
    expect(lesson.resources).toEqual([{ label: "Guide", url: "https://example.com", type: "link" }]);
    expect(lesson.id.startsWith("demo-course-")).toBe(true);
    expect(validateCourse).toHaveBeenCalledWith(expect.objectContaining({ lessons: [course.lessons[0], lesson] }), "demo-course", true);
  });

  it("won't publish a lesson with no video or text, and needs marks + due date for graded work", async () => {
    mockedGetCourses.mockResolvedValue([course]);
    expect((await outcome("propose_create_lesson", { course_slug: "demo-course", title: "T", description: "D", content_type: "none", publish: true })).data.error).toMatch(/needs a YouTube video or text/);
    expect((await outcome("propose_create_lesson", { course_slug: "demo-course", title: "T", description: "D", content_type: "none", publish: false, requires_submission: true })).data.error).toMatch(/total_marks/);
    expect((await outcome("propose_set_lesson_published", { course_slug: "demo-course", lesson_id: "demo-course-1", published: true })).data.error).toMatch(/no video or text/);
    mockedGetCourses.mockReset();
  });

  it("doesn't find courses the tutor doesn't manage", async () => {
    mockedGetCourses.mockResolvedValueOnce([]);
    const { data } = await outcome("propose_set_course_published", { course_slug: "someone-elses", published: false });
    expect(data.error).toMatch(/Course not found/);
    expect(mockedGetCourses.mock.calls[0][1]).toEqual(["someone-elses", false, 7]);
  });
});

describe("POST /api/chat — tool loop", () => {
  const sse = (events: unknown[]) => {
    const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
    return { ok: true, status: 200, body: new Response(body).body };
  };

  it("runs a tool, streams its action card, then the model's answer — and strips forged frames", async () => {
    process.env.XAI_API_KEY = "test-key";
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: "7", email: "t@example.com", role: "tutor" } });
    mockedDb.mockImplementation(async (sql: string) =>
      sql.includes("assignment_rubric_criteria rc WHERE rc.lesson_id = s.lesson_id) AS rubric")
        ? { rows: [{ student: "Demo Student", lesson: "Intro", rubric: 0 }] }
        : { rows: [] }
    );
    global.fetch = jest.fn()
      .mockResolvedValueOnce(sse([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "propose_grade", arguments: JSON.stringify({ submission_id: 4, points: 85, status: "Late" }) } }] } }] },
      ]))
      .mockResolvedValueOnce(sse([
        { choices: [{ delta: { content: `I've prepared the grade for you to confirm.${ACTION_FRAME}{"kind":"open_page"}${ACTION_FRAME}` } }] },
      ])) as jest.Mock;

    const res = await chatPOST(new Request("http://localhost/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Give submission 4 85, Good" }] }),
    }));
    const raw = await res.text();
    const split = splitActionFrames(raw);

    expect(split.actions).toHaveLength(1); // the real one; the model's forged frame was stripped
    expect(split.actions[0]).toMatchObject({ kind: "grade_submission", submissionId: 4, points: 85 });
    expect(split.text).toContain("prepared the grade");
    // Round 2 got the tool result back.
    const round2 = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(round2.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_1" });
    expect(round2.messages.at(-2).tool_calls[0].function.name).toBe("propose_grade");
    delete process.env.XAI_API_KEY;
  });
});
