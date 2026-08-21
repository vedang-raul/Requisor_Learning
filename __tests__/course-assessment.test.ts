/**
 * Integration-style tests for app/api/course-assessment/route.ts
 *
 * All external I/O (next-auth session, DB, fetch) is mocked so the suite
 * runs without a live database or network.
 */

import { POST } from "@/app/api/course-assessment/route";

// ── helpers ────────────────────────────────────────────────────────────────

/** Build a minimal Next.js-style Request with a JSON body. */
function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/course-assessment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── module mocks ───────────────────────────────────────────────────────────

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({ authOptions: {} }));

jest.mock("@/lib/db", () => ({
  db: { query: jest.fn() },
}));

// Bypass rate limiting and the AI concurrency semaphore so tests are not
// affected by module-level state that accumulates across repeated calls.
jest.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({
    check: () => ({ limited: false, retryAfterMs: 0 }),
  }),
  rateLimitResponse: () => new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }),
}));

jest.mock("@/lib/ai-semaphore", () => ({
  withAiConcurrency: (fn: () => Promise<unknown>) => fn(),
  SemaphoreFullError: class SemaphoreFullError extends Error {
    constructor() { super("overloaded"); this.name = "SemaphoreFullError"; }
  },
}));

// We use the real seedCourses so slug/baseAssessment data is accurate.

// ── imports after mocks ────────────────────────────────────────────────────

import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { seedCourses } from "@/lib/data";

const mockedGetServerSession = getServerSession as jest.Mock;
const mockedDbQuery = (db.query as unknown) as jest.Mock;

// ── shared setup ───────────────────────────────────────────────────────────

/** Authenticated session used by most tests. */
const AUTHED_SESSION = { user: { email: "learner@example.com" } };

/** A full user profile row returned by the DB. */
const FULL_PROFILE_ROW = {
  date_of_birth: "1995-06-15",
  qualification: "Computer Science degree",
  learning_goal: "become a product manager",
};

/** A user row with no profile data (nulls). */
const NULL_PROFILE_ROW = {
  date_of_birth: null,
  qualification: null,
  learning_goal: null,
};

/** A typical successful xAI response. */
function xaiOkResponse(text: string) {
  return Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content: text } }],
      }),
  });
}

// Set XAI_API_KEY for every test
beforeAll(() => {
  process.env.XAI_API_KEY = "test-xai-key";
});

beforeEach(() => {
  jest.resetAllMocks();
  process.env.XAI_API_KEY = "test-xai-key";
});

// ── helper: confirm every course has a baseAssessment ─────────────────────

describe("seedCourses — static data integrity", () => {
  const EXPECTED_SLUGS = [
    "product-management",
    "data-analytics",
    "agentic-ai",
    "cyber-security",
  ];

  it("contains exactly 4 courses", () => {
    expect(seedCourses).toHaveLength(4);
  });

  it.each(EXPECTED_SLUGS)('course "%s" has a baseAssessment', (slug) => {
    const course = seedCourses.find((c) => c.slug === slug);
    expect(course).toBeDefined();
    expect(typeof course!.baseAssessment).toBe("string");
    expect(course!.baseAssessment!.length).toBeGreaterThan(0);
  });
});

// ── auth guard ─────────────────────────────────────────────────────────────

describe("POST /api/course-assessment — auth guard", () => {
  it("returns 401 when there is no session", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest({ courseSlug: "product-management" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 401 when session has no email", async () => {
    mockedGetServerSession.mockResolvedValue({ user: {} });

    const res = await POST(makeRequest({ courseSlug: "product-management" }));

    expect(res.status).toBe(401);
  });
});

// ── input validation ───────────────────────────────────────────────────────

describe("POST /api/course-assessment — input validation", () => {
  beforeEach(() => {
    mockedGetServerSession.mockResolvedValue(AUTHED_SESSION);
    mockedDbQuery.mockResolvedValue({ rows: [FULL_PROFILE_ROW] });
  });

  it("returns 400 for a missing courseSlug", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid request body (not JSON)", async () => {
    const req = new Request("http://localhost/api/course-assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json {{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown courseSlug", async () => {
    const res = await POST(makeRequest({ courseSlug: "does-not-exist" }));
    expect(res.status).toBe(404);
  });
});

// ── happy path for all 4 courses ───────────────────────────────────────────

describe.each([
  "product-management",
  "data-analytics",
  "agentic-ai",
  "cyber-security",
])("POST /api/course-assessment — happy path: %s", (slug) => {
  beforeEach(() => {
    mockedGetServerSession.mockResolvedValue(AUTHED_SESSION);
    mockedDbQuery.mockResolvedValue({ rows: [FULL_PROFILE_ROW] });
    global.fetch = jest
      .fn()
      .mockImplementation(() =>
        xaiOkResponse(`Personalised assessment for ${slug}.`)
      ) as jest.Mock;
  });

  it("returns 200 with an assessment string", async () => {
    const res = await POST(makeRequest({ courseSlug: slug }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ assessment: expect.any(String) });
    expect(body.assessment.length).toBeGreaterThan(0);
  });

  it("calls the xAI API with the course title in the prompt", async () => {
    await POST(makeRequest({ courseSlug: slug }));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const callArg = (global.fetch as jest.Mock).mock.calls[0];
    const requestBody = JSON.parse(callArg[1].body);
    const course = seedCourses.find((c) => c.slug === slug)!;
    expect(requestBody.messages[0].content).toContain(course.title);
  });

  it("includes the learner persona in the prompt when profile is present", async () => {
    await POST(makeRequest({ courseSlug: slug }));

    const callArg = (global.fetch as jest.Mock).mock.calls[0];
    const requestBody = JSON.parse(callArg[1].body);
    const prompt: string = requestBody.messages[0].content;
    expect(prompt).toContain(FULL_PROFILE_ROW.qualification);
    expect(prompt).toContain(FULL_PROFILE_ROW.learning_goal);
  });
});

// ── missing user profile (null qualification + learning_goal) ──────────────

describe("POST /api/course-assessment — missing user profile", () => {
  beforeEach(() => {
    mockedGetServerSession.mockResolvedValue(AUTHED_SESSION);
    mockedDbQuery.mockResolvedValue({ rows: [NULL_PROFILE_ROW] });
    global.fetch = jest
      .fn()
      .mockImplementation(() =>
        xaiOkResponse("Generic assessment text.")
      ) as jest.Mock;
  });

  it("still returns 200 with an assessment (generic persona)", async () => {
    const res = await POST(
      makeRequest({ courseSlug: "product-management" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ assessment: expect.any(String) });
  });

  it("does NOT include a persona line in the prompt when profile is empty", async () => {
    await POST(makeRequest({ courseSlug: "product-management" }));

    const callArg = (global.fetch as jest.Mock).mock.calls[0];
    const requestBody = JSON.parse(callArg[1].body);
    const prompt: string = requestBody.messages[0].content;
    // No profile data → no "The learner has the following profile" sentence
    expect(prompt).not.toContain("The learner has the following profile");
  });

  it("works even when the users row is missing entirely", async () => {
    mockedDbQuery.mockResolvedValue({ rows: [] });

    const res = await POST(
      makeRequest({ courseSlug: "product-management" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ assessment: expect.any(String) });
  });
});

// ── xAI API error paths ────────────────────────────────────────────────────

describe("POST /api/course-assessment — xAI API error paths", () => {
  beforeEach(() => {
    mockedGetServerSession.mockResolvedValue(AUTHED_SESSION);
    mockedDbQuery.mockResolvedValue({ rows: [FULL_PROFILE_ROW] });
  });

  it("returns 500 when xAI returns a non-OK HTTP status", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
    }) as jest.Mock;

    const res = await POST(
      makeRequest({ courseSlug: "data-analytics" })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 500 when xAI returns an empty choices array", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [] }),
    }) as jest.Mock;

    const res = await POST(
      makeRequest({ courseSlug: "agentic-ai" })
    );
    expect(res.status).toBe(500);
  });

  it("returns 500 when xAI returns an empty content string", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "   " } }],
        }),
    }) as jest.Mock;

    const res = await POST(
      makeRequest({ courseSlug: "cyber-security" })
    );
    expect(res.status).toBe(500);
  });

  it("returns 500 on a network-level fetch rejection (timeout / DNS failure)", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network timeout")) as jest.Mock;

    const res = await POST(
      makeRequest({ courseSlug: "product-management" })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 503 when XAI_API_KEY is not configured", async () => {
    delete process.env.XAI_API_KEY;
    global.fetch = jest.fn() as jest.Mock;

    const res = await POST(
      makeRequest({ courseSlug: "product-management" })
    );
    expect(res.status).toBe(503);
    // fetch should never be called without a key
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
