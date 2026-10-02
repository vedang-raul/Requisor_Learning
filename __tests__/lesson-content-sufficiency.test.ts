jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({ check: () => ({ limited: false, retryAfterMs: 0 }) }),
  rateLimitResponse: () => new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }),
}));
jest.mock("@/lib/ai-semaphore", () => ({
  withAiConcurrency: (fn: () => Promise<unknown>) => fn(),
  SemaphoreFullError: class SemaphoreFullError extends Error {},
  AI_UPSTREAM_TIMEOUT_MS: 30_000,
}));

import { lessonHasEnoughContent } from "@/lib/personalized-learning";
import { INSUFFICIENT_CONTENT_CODE } from "@/lib/assignment-format";
import { seedCourses } from "@/lib/data";
import { POST as assignmentPOST } from "@/app/api/assignment/route";
import { POST as quizPOST } from "@/app/api/quiz/route";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";

const mockedDbQuery = db.query as jest.Mock;

/** The placeholder lesson a tutor actually created while testing. */
const DEMO_ROW = {
  id: "demo-course-1", title: "demo demo",
  description: "demo dmeo demom This is just a demo lesson made to test the ai generated assignments",
  key_takeaways: ["demo key", "demo takeaway"], assignment: "1. demo dmo\n2. demo demo",
};

describe("lessonHasEnoughContent", () => {
  it("accepts every built-in lesson, including the shortest real ones", () => {
    const thin = seedCourses
      .flatMap((course) => course.lessons)
      .filter((lesson) => !lessonHasEnoughContent({ ...lesson, assignment: lesson.assignment }))
      .map((lesson) => lesson.id);
    expect(thin).toEqual([]);
  });

  it("accepts a short but real lesson", () => {
    expect(lessonHasEnoughContent({
      title: "What Are Tableau Extracts?",
      description: "Data extracts explained: what they are and when to use them.",
      keyTakeaways: ["Extracts vs live connections", "Refresh schedules"],
    })).toBe(true);
  });

  it("rejects placeholder text, including typos of filler words", () => {
    expect(lessonHasEnoughContent({
      title: DEMO_ROW.title, description: DEMO_ROW.description,
      keyTakeaways: DEMO_ROW.key_takeaways, assignment: DEMO_ROW.assignment,
    })).toBe(false);
    expect(lessonHasEnoughContent({ title: "Test lesson", description: "tset tst lorem ipsum", keyTakeaways: ["TBD"] })).toBe(false);
  });

  it("requires a real topic in the title, not just a padded description", () => {
    expect(lessonHasEnoughContent({
      title: "Lesson 1",
      description: "Pivot tables summarise spreadsheets, filter rows, group categories and compute totals quickly.",
      keyTakeaways: [],
    })).toBe(false);
  });
});

describe("thin lessons never reach the model", () => {
  const request = (url: string) =>
    new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId: "demo-course-1" }) });

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.XAI_API_KEY = "test-key";
    (getServerSession as jest.Mock).mockResolvedValue({ user: { email: "learner@example.com" } });
    mockedDbQuery.mockResolvedValueOnce({ rows: [DEMO_ROW] }); // published tutor lesson lookup
    global.fetch = jest.fn() as jest.Mock;
  });
  afterAll(() => { delete process.env.XAI_API_KEY; });

  it.each([
    ["assignment", assignmentPOST, "http://localhost/api/assignment"],
    ["quiz", quizPOST, "http://localhost/api/quiz"],
  ] as const)("%s: returns 422 with a no-retry code, no profile read, no API call", async (_name, POST, url) => {
    const response = await POST(request(url));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code: INSUFFICIENT_CONTENT_CODE });
    expect(mockedDbQuery).toHaveBeenCalledTimes(1); // only the lesson lookup
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
