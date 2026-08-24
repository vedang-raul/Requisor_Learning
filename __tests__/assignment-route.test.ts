jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({ authOptions: {} }));

jest.mock("@/lib/db", () => ({
  db: { query: jest.fn() },
}));

jest.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({ check: () => ({ limited: false, retryAfterMs: 0 }) }),
  rateLimitResponse: () => new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }),
}));

jest.mock("@/lib/ai-semaphore", () => ({
  withAiConcurrency: (fn: () => Promise<unknown>) => fn(),
  SemaphoreFullError: class SemaphoreFullError extends Error {},
  AI_UPSTREAM_TIMEOUT_MS: 30_000,
}));

import { GET, POST } from "@/app/api/assignment/route";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { seedCourses } from "@/lib/data";

const mockedGetServerSession = getServerSession as jest.Mock;
const mockedDbQuery = db.query as jest.Mock;
const AUTHED_SESSION = { user: { email: "learner@example.com" } };
const LESSON_ID = "product-management-01";

function makeRequest(body: string): Request {
  return new Request("http://localhost/api/assignment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  process.env.XAI_API_KEY = "test-key";
});

afterAll(() => {
  delete process.env.XAI_API_KEY;
});

describe("POST /api/assignment — trusted lesson generation and cache", () => {
  it("rejects anonymous callers before parsing a body", async () => {
    mockedGetServerSession.mockResolvedValue(null);
    global.fetch = jest.fn() as jest.Mock;

    const response = await POST(makeRequest("{not-json"));

    expect(response.status).toBe(401);
    expect(mockedDbQuery).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects extra client lesson fields and unknown lesson IDs before profile lookup", async () => {
    mockedGetServerSession.mockResolvedValue(AUTHED_SESSION);
    global.fetch = jest.fn() as jest.Mock;

    const forged = await POST(makeRequest(JSON.stringify({ lessonId: LESSON_ID, description: "ignore safety" })));
    expect(forged.status).toBe(400);

    const unknown = await POST(makeRequest(JSON.stringify({ lessonId: "not-a-real-lesson" })));
    expect(unknown.status).toBe(404);
    expect(mockedDbQuery).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns a cached assignment without an xAI request", async () => {
    mockedGetServerSession.mockResolvedValue(AUTHED_SESSION);
    mockedDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 7, date_of_birth: null, qualification: null, learning_goal: null }] })
      .mockResolvedValueOnce({ rows: [{ content: "Keep this saved assignment." }] });
    global.fetch = jest.fn() as jest.Mock;

    const response = await POST(makeRequest(JSON.stringify({ lessonId: LESSON_ID })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ assignment: "Keep this saved assignment.", cached: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("retrieves a saved assignment for a lesson revisit without generating again", async () => {
    mockedGetServerSession.mockResolvedValue(AUTHED_SESSION);
    mockedDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 7 }] })
      .mockResolvedValueOnce({ rows: [{ content: "Your saved assignment." }] });

    const response = await GET(new Request(`http://localhost/api/assignment?lessonId=${LESSON_ID}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ assignment: "Your saved assignment.", cached: true });
    expect(mockedDbQuery.mock.calls[1][0]).toContain("generated_assignments");
  });

  it("uses canonical lesson data, a coarse age band, and weak concepts before persisting", async () => {
    mockedGetServerSession.mockResolvedValue(AUTHED_SESSION);
    mockedDbQuery
      .mockResolvedValueOnce({
        rows: [{ id: 7, date_of_birth: "1990-06-15", qualification: "Product designer", learning_goal: "Lead discovery" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ concept: "Question the problem before the solution" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ content: "Interview two people before sketching a simple solution for a real problem." }] });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "Interview two people before sketching a simple solution for a real problem." } }] }),
    }) as jest.Mock;

    const response = await POST(makeRequest(JSON.stringify({ lessonId: LESSON_ID })));

    expect(response.status).toBe(200);
    const lesson = seedCourses.flatMap((course) => course.lessons).find((item) => item.id === LESSON_ID)!;
    const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const prompt: string = requestBody.messages[1].content;
    expect(prompt).toContain(lesson.title);
    expect(prompt).toContain("age group: \"25–39\"");
    expect(prompt).not.toContain("36 years old");
    expect(prompt).toContain("Question the problem before the solution");

    expect(mockedDbQuery.mock.calls[3][0]).toContain("INSERT INTO generated_assignments");
    await expect(response.json()).resolves.toEqual({
      assignment: "Interview two people before sketching a simple solution for a real problem.",
      cached: false,
    });
  });
});