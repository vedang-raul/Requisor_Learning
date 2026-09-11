jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({ check: jest.fn(() => ({ limited: false, retryAfterMs: 0 })) }),
  rateLimitResponse: jest.fn(() => new Response("Too many requests.", { status: 429 })),
}));
jest.mock("@/lib/ai-semaphore", () => ({
  acquireAiSlot: jest.fn(async () => jest.fn()),
  SemaphoreFullError: class SemaphoreFullError extends Error {},
}));
jest.mock("@/lib/course-catalog", () => ({
  ensureCourseCatalog: jest.fn(async () => undefined),
  getCourses: jest.fn(async () => []),
  validateCourse: jest.fn((course) => ({ ok: true, course })),
}));

import { POST } from "@/app/api/tutor/course-draft/route";
import { getServerSession } from "next-auth/next";
import { getCourses } from "@/lib/course-catalog";

const mockSession = getServerSession as jest.Mock;
const mockGetCourses = getCourses as jest.Mock;
const originalApiKey = process.env.XAI_API_KEY;
const courseBrief = {
  topic: "Practical leadership",
  audience: "New managers",
  level: "Intermediate",
  outcomes: "Lead teams clearly and run effective coaching conversations",
  lessonFormat: "mixed",
  lessonCount: 3,
};

function request(body: unknown) {
  return new Request("http://localhost/api/tutor/course-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const modelDraft = {
  title: "Practical Leadership",
  tagline: "Lead teams with clarity",
  category: "Leadership",
  level: "Intermediate",
  tags: ["leadership", "teams"],
  baseAssessment: "Create a team leadership plan.",
  lessons: [
    {
      title: "Leadership Foundations",
      description: "Understand the foundations.",
      format: "reading",
      durationMin: 20,
      section: "Foundations",
      keyTakeaways: ["Define effective leadership"],
      body: "## Foundations\n\nLeadership starts with clarity.",
      assignment: "Write a leadership statement.",
      requiresSubmission: false,
    },
    {
      title: "Coaching a Team",
      description: "Practice coaching conversations.",
      format: "reading",
      durationMin: 20,
      section: "Practice",
      keyTakeaways: ["Use questions to coach"],
      body: "## Coaching\n\nAsk before advising.",
      assignment: "Plan a coaching conversation.",
      requiresSubmission: true,
    },
    {
      title: "Leadership Foundations",
      description: "Apply the foundations.",
      format: "video",
      durationMin: 15,
      section: "Practice",
      keyTakeaways: ["Apply leadership principles"],
      body: "",
      assignment: "",
      requiresSubmission: false,
    },
  ],
};

describe("POST /api/tutor/course-draft", () => {
  beforeAll(() => { process.env.XAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = originalApiKey;
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCourses.mockResolvedValue([]);
    global.fetch = jest.fn(async () => Response.json({
      choices: [{ message: { content: JSON.stringify(modelDraft) } }],
    }));
  });

  it("allows only server-authenticated tutors and admins", async () => {
    mockSession.mockResolvedValue({ user: { id: "4", email: "learner@example.test", role: "employee" } });
    const learner = await POST(request({ courseBrief }));
    expect(learner.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();

    mockSession.mockResolvedValue({ user: { id: "1", email: "admin@example.test", role: "admin" } });
    const admin = await POST(request({ courseBrief }));
    const data = await admin.json();
    expect(admin.status).toBe(200);
    expect(data.course.published).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns a validated unpublished draft without persisting it", async () => {
    mockSession.mockResolvedValue({ user: { id: "7", email: "tutor@example.test", role: "tutor" } });
    const response = await POST(request({
      role: "admin",
      courseBrief,
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.course.published).toBe(false);
    expect(data.course.lessons).toHaveLength(3);
    expect(data.course.lessons[0].id).not.toBe(data.course.lessons[1].id);
    expect(data.course.lessons[2].youtubeId).toBe("REPLACE_ME");
    expect(data.course.lessons[0].resources).toEqual([]);
    expect(mockGetCourses).toHaveBeenCalledWith("WHERE c.slug = $1", ["practical-leadership"]);
    expect(mockGetCourses).not.toHaveBeenCalledWith(expect.stringContaining("INSERT"), expect.anything());
  });

  it("rejects malformed model output with a recoverable error", async () => {
    mockSession.mockResolvedValue({ user: { id: "7", email: "tutor@example.test", role: "tutor" } });
    global.fetch = jest.fn(async () => Response.json({
      choices: [{ message: { content: "{\"title\":\"Incomplete\"}" } }],
    }));
    const response = await POST(request({ courseBrief }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: expect.stringContaining("incomplete"),
    }));
  });

  it("chooses a new slug when a course title already exists", async () => {
    mockSession.mockResolvedValue({ user: { id: "7", email: "tutor@example.test", role: "tutor" } });
    mockGetCourses.mockResolvedValueOnce([{ slug: "practical-leadership" }]).mockResolvedValueOnce([]);
    const response = await POST(request({ courseBrief }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.course.slug).toBe("practical-leadership-2");
    expect(data.course.lessons.every((lesson: { id: string }) => lesson.id.startsWith("practical-leadership-2-"))).toBe(true);
  });

  it("requires all six guided interview answers", async () => {
    mockSession.mockResolvedValue({ user: { id: "7", email: "tutor@example.test", role: "tutor" } });
    const response = await POST(request({
      courseBrief: { topic: "Leadership", audience: "Managers", level: "Beginner", lessonCount: 3 },
    }));
    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects a draft that does not match the requested lesson count", async () => {
    mockSession.mockResolvedValue({ user: { id: "7", email: "tutor@example.test", role: "tutor" } });
    const response = await POST(request({ courseBrief: { ...courseBrief, lessonCount: 4 } }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: expect.stringContaining("requested 4 lessons"),
    }));
  });

  it("rejects a draft that does not match the requested lesson format", async () => {
    mockSession.mockResolvedValue({ user: { id: "7", email: "tutor@example.test", role: "tutor" } });
    const response = await POST(request({ courseBrief: { ...courseBrief, lessonFormat: "video" } }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: expect.stringContaining("requested video lesson format"),
    }));
  });
});