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

jest.mock("@/lib/course-catalog", () => ({ findLessonLocation: jest.fn() }));
jest.mock("@/lib/notifications", () => ({ notifyUser: jest.fn() }));
jest.mock("@/lib/email", () => ({ sendAssignmentSubmittedEmail: jest.fn() }));
jest.mock("@/lib/base-url", () => ({ getBaseUrl: () => "http://localhost" }));

import { POST } from "@/app/api/assignment/submission/route";
import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { findLessonLocation } from "@/lib/course-catalog";
import { notifyUser } from "@/lib/notifications";

const mockedGetServerSession = getServerSession as jest.Mock;
const mockedDbQuery = db.query as jest.Mock;
const mockedFindLesson = findLessonLocation as jest.Mock;
const mockedNotify = notifyUser as jest.Mock;

function lesson(requiresSubmission: boolean) {
  return {
    lessonId: "agentic-ai-01", lessonTitle: "AI Agents vs Automation", requiresSubmission,
    courseSlug: "agentic-ai", courseTitle: "Agentic AI", ownerUserId: 9, visibleToLearners: true,
  };
}

function uploadRequest(): Request {
  const form = new FormData();
  form.set("lessonId", "agentic-ai-01");
  form.set("file", new File([Buffer.from("%PDF-1.4 test")], "work.pdf", { type: "application/pdf" }));
  return new Request("http://localhost/api/assignment/submission", { method: "POST", body: form });
}

/** Routes each query by its SQL so the test doesn't depend on call order. */
function mockDb({ hasGeneratedBrief }: { hasGeneratedBrief: boolean }) {
  mockedDbQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM users WHERE email")) return { rows: [{ id: 4, name: "Demo Student" }] };
    if (sql.includes("FROM generated_assignments")) return { rows: hasGeneratedBrief ? [{ "?column?": 1 }] : [] };
    if (sql.includes("INSERT INTO assignment_submissions")) return { rows: [{ id: 42, submitted_at: "2026-09-29T08:00:00Z" }] };
    if (sql.includes("FROM users WHERE id")) return { rows: [{ email: "tutor@example.com", name: "Tutor" }] };
    return { rows: [] };
  });
}

function insertedSource(): unknown {
  const call = mockedDbQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO assignment_submissions"));
  expect(call).toBeDefined();
  expect(call![0]).toContain("source = EXCLUDED.source"); // resubmits re-label too
  return call![1][7];
}

beforeEach(() => {
  jest.resetAllMocks();
  mockedGetServerSession.mockResolvedValue({ user: { email: "student@example.com" } });
});

describe("POST /api/assignment/submission — records which kind of assignment was answered", () => {
  it("labels an upload for a lesson that requires submission as the tutor's assignment", async () => {
    mockedFindLesson.mockResolvedValue(lesson(true));
    mockDb({ hasGeneratedBrief: true }); // even if an AI brief also exists

    const response = await POST(uploadRequest());

    expect(response.status).toBe(200);
    expect(insertedSource()).toBe("tutor");
    expect(mockedNotify).toHaveBeenCalledWith(9, expect.objectContaining({ title: "New assignment submission" }));
  });

  it("labels an upload answering the learner's AI-generated brief as AI practice", async () => {
    mockedFindLesson.mockResolvedValue(lesson(false));
    mockDb({ hasGeneratedBrief: true });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(200);
    expect(insertedSource()).toBe("ai");
    expect(mockedNotify).toHaveBeenCalledWith(9, expect.objectContaining({ title: "New AI practice submission" }));
  });

  it("refuses uploads to a draft lesson learners can't see", async () => {
    mockedFindLesson.mockResolvedValue({ ...lesson(true), visibleToLearners: false });
    mockDb({ hasGeneratedBrief: true });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(404);
    expect(mockedDbQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO assignment_submissions"))).toBe(false);
  });

  it("still refuses an upload when there is neither a tutor assignment nor an AI brief", async () => {
    mockedFindLesson.mockResolvedValue(lesson(false));
    mockDb({ hasGeneratedBrief: false });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(409);
    expect(mockedDbQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO assignment_submissions"))).toBe(false);
  });
});
