jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/server/db", () => ({ db: { query: jest.fn(), connect: jest.fn() } }));
jest.mock("@/lib/courses/course-catalog", () => ({ ensureCourseCatalog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/server/rate-limit", () => {
  const check = jest.fn(() => ({ limited: false, retryAfterMs: 0 }));
  return {
    createRateLimiter: () => ({ check }),
    __check: check,
    rateLimitResponse: () => Response.json({ error: "Limited" }, { status: 429 }),
  };
});

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { getServerSession as commentSession } from "next-auth";
import { db } from "@/lib/server/db";
import * as rateLimit from "@/lib/server/rate-limit";
import { POST as reportPost, GET as reportGet } from "@/app/api/bug-reports/route";
import { PATCH, GET as completionGet, POST as assessmentPost } from "@/app/api/course-assessment/route";
import { POST as commentPost } from "@/app/api/comments/route";
import { POST as xpPost } from "@/app/api/xp/route";
import { seedCourses } from "@/lib/courses/data";
import {
  MAX_BUG_REPORT_BODY_BYTES, MAX_BUG_REPORTS, MAX_BUG_STORED_MEDIA_BYTES,
  validBugReportMedia,
} from "@/lib/server/bug-report-limits";

const query = db.query as jest.Mock;
const connect = db.connect as jest.Mock;
const check = (rateLimit as unknown as { __check: jest.Mock }).__check;
const client = { query: jest.fn(), release: jest.fn() };
const media = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64")}`;
const report = { title: "Bug", description: "Details", occurredAt: "2026-10-22T12:00:00Z", mediaData: media, mediaType: "image" };

function jsonRequest(body: unknown, method = "POST") {
  return new NextRequest("https://example.test/api/test", { method, body: JSON.stringify(body) });
}

function oversizedRequest(limit: number, declared?: string) {
  const cancel = jest.fn();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(limit));
      controller.enqueue(new Uint8Array(1));
      // Leave the source open to prove the reader cancels, not drains it.
    },
    cancel,
  });
  const req = new NextRequest("https://example.test/api/test", {
    method: "POST",
    body: stream,
    headers: declared ? { "Content-Length": declared } : {},
  });
  return { req, cancel };
}

beforeEach(() => {
  jest.resetAllMocks();
  (getServerSession as jest.Mock).mockResolvedValue({ user: { id: "1", email: "learner@example.test" } });
  (commentSession as jest.Mock).mockResolvedValue({ user: { id: "1", email: "learner@example.test" } });
  check.mockReturnValue({ limited: false, retryAfterMs: 0 });
  query.mockResolvedValue({ rows: [{ id: 1, name: "Learner" }] });
  connect.mockResolvedValue(client);
  client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("COUNT(*)")) return { rows: [{ count: "0", daily: "0", bytes: "0" }] };
    if (sql.startsWith("SELECT id FROM users")) return { rows: [{ id: 1 }] };
    if (sql.startsWith("SELECT slug FROM courses")) {
      return { rows: [...seedCourses.map(c => c.slug), "tutor-authored-capstone"].includes(params?.[0] as string) ? [{ slug: params?.[0] }] : [] };
    }
    if (sql.includes("INSERT")) return { rows: [{ id: 9, created_at: "now" }] };
    return { rows: [] };
  });
});

describe("streamed request limits", () => {
  it.each([
    ["comments", commentPost, 16 * 1024],
    ["assessment POST", assessmentPost, 2048],
    ["assessment PATCH", PATCH, 2048],
    ["XP", xpPost, 1024],
    ["bug reports", reportPost, MAX_BUG_REPORT_BODY_BYTES],
  ] as const)("%s rejects chunked overflow before database writes", async (_name, handler, limit) => {
    // An absent API key may short-circuit assessment generation before reading.
    const previous = process.env.XAI_API_KEY;
    process.env.XAI_API_KEY = "unit-test-only";
    try {
      const { req, cancel } = oversizedRequest(limit);
      const response = await handler(req);
      expect(response.status).toBe(413);
      expect(cancel).toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
      expect(query.mock.calls.every(([sql]) => !/INSERT|UPDATE|DELETE/.test(sql))).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.XAI_API_KEY;
      else process.env.XAI_API_KEY = previous;
    }
  });

  it("does not trust an understated Content-Length", async () => {
    const { req, cancel } = oversizedRequest(1024, "1");
    expect((await xpPost(req)).status).toBe(413);
    expect(cancel).toHaveBeenCalled();
  });

  it.each([null, [], { xp: "100" }, { xp: -1 }, { xp: 1.5 }, { xp: 2147483648 }])("rejects invalid XP input %j", async (input) => {
    expect((await xpPost(jsonRequest(input))).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps valid XP updates working", async () => {
    expect((await xpPost(jsonRequest({ xp: 123 }))).status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE users"), [123, "learner@example.test"]);
  });

  it.each([xpPost, PATCH, reportPost, commentPost])("throttles before reading the body", async (handler) => {
    check.mockReturnValue({ limited: true, retryAfterMs: 1000 });
    const req = jsonRequest({});
    expect((await handler(req)).status).toBe(429);
    expect(req.bodyUsed).toBe(false);
  });
});

describe("bounded capstone completions", () => {
  it.each([
    [{ courseSlug: "x".repeat(201), completed: true }, 400],
    [{ courseSlug: seedCourses[0].slug, completed: "true" }, 400],
    [null, 400],
  ])("rejects arbitrary or malformed records", async (input, status) => {
    expect((await PATCH(jsonRequest(input, "PATCH"))).status).toBe(status);
    expect(query).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects an invented slug absent from the authoritative catalog", async () => {
    expect((await PATCH(jsonRequest({ courseSlug: "invented-123", completed: true }, "PATCH"))).status).toBe(404);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("FROM courses"), ["invented-123"]);
    expect(client.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
  });

  it.each([true, false])("preserves completion state changes: %s", async (completed) => {
    const slug = seedCourses[0].slug;
    expect((await PATCH(jsonRequest({ courseSlug: slug, completed }, "PATCH"))).status).toBe(200);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining(completed ? "ON CONFLICT" : "DELETE"),
      [1, slug]
    );
  });

  it("excludes legacy invented slugs and bounds the completion response in SQL", async () => {
    query.mockResolvedValue({ rows: [] });
    expect((await completionGet(new Request("https://example.test"))).status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/JOIN courses[\s\S]*LIMIT/),
      ["learner@example.test", 1000]
    );
  });

  it("saves and retrieves a tutor-authored capstone completion", async () => {
    const courseSlug = "tutor-authored-capstone";
    expect((await PATCH(jsonRequest({ courseSlug, completed: true }, "PATCH"))).status).toBe(200);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("FROM courses"), [courseSlug]);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO capstone_completions"), [1, courseSlug]);
    query.mockResolvedValue({ rows: [{ course_slug: courseSlug }] });
    const response = await completionGet(new Request("https://example.test"));
    expect(await response.json()).toEqual({ completions: [courseSlug] });
    const sql = query.mock.calls.at(-1)?.[0];
    expect(sql).toContain("JOIN courses");
    expect(sql).not.toContain("ANY");
  });

  it("checks the persistent completion cap while holding a per-user lock", async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes("COUNT(*)")) return { rows: [{ count: "1000" }] };
      if (sql.startsWith("SELECT id FROM users")) return { rows: [{ id: 1 }] };
      if (sql.startsWith("SELECT slug FROM courses")) return { rows: [{ slug: "tutor-authored-capstone" }] };
      return { rows: [] };
    });
    expect((await PATCH(jsonRequest({ courseSlug: "tutor-authored-capstone", completed: true }, "PATCH"))).status).toBe(429);
    expect(client.query.mock.calls[1][0]).toContain("FOR UPDATE");
    expect(client.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("keeps existing completions idempotent even when the user is at quota", async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes("COUNT(*)")) return { rows: [{ count: "1000" }] };
      if (sql.startsWith("SELECT id FROM users")) return { rows: [{ id: 1 }] };
      return { rows: [{ course_slug: "tutor-authored-capstone" }] };
    });
    expect((await PATCH(jsonRequest({ courseSlug: "tutor-authored-capstone", completed: true }, "PATCH"))).status).toBe(200);
    expect(client.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
    expect(client.query).toHaveBeenLastCalledWith("COMMIT");
  });
});

describe("bug-report persistent quotas", () => {
  it.each([
    { count: String(MAX_BUG_REPORTS), daily: "0", bytes: "0" },
    { count: "5", daily: "5", bytes: "0" },
    { count: "4", daily: "0", bytes: String(MAX_BUG_STORED_MEDIA_BYTES) },
  ])("rejects exhausted report quota %j and rolls back", async (usage) => {
    client.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("COUNT(*)") ? [usage] : [],
    }));
    expect((await reportPost(jsonRequest(report))).status).toBe(429);
    expect(client.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("locks the user before checking quota and commits on the same connection", async () => {
    expect((await reportPost(jsonRequest(report))).status).toBe(201);
    const statements = client.query.mock.calls.map(([sql]) => sql);
    expect(statements[0]).toBe("BEGIN");
    expect(statements[1]).toContain("FOR UPDATE");
    expect(statements[2]).toContain("COUNT(*)");
    expect(statements[3]).toContain("INSERT");
    expect(statements[4]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back and releases the connection if insertion fails", async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT")) throw new Error("write failed");
      return { rows: [{ count: "0", daily: "0", bytes: "0" }] };
    });
    await expect(reportPost(jsonRequest(report))).rejects.toThrow("write failed");
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("permits reports without media", async () => {
    expect((await reportPost(jsonRequest({ ...report, mediaData: null, mediaType: null }))).status).toBe(201);
  });

  it.each(["a".repeat(4000), "data:image/png;base64,not base64", "data:image/png;base64,YXR0YWNr", 123, {}])("rejects invalid media before opening a transaction", async (mediaData) => {
    expect((await reportPost(jsonRequest({ ...report, mediaData }))).status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it("caps history queries and excludes media", async () => {
    await reportGet();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("LIMIT $2"), ["learner@example.test", MAX_BUG_REPORTS]);
    expect(query.mock.calls[0][0]).not.toContain("media_data");
  });
});

describe("media encoding and file signatures", () => {
  it("accepts a matching PNG header", () => expect(validBugReportMedia(media, "image")).toBe(true));
  it("rejects a mismatched media category", () => expect(validBugReportMedia(media, "video")).toBe(false));
  it("rejects oversized decoded media", () => {
    const bytes = Buffer.alloc(4 * 1024 * 1024 + 1);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    expect(validBugReportMedia(`data:image/png;base64,${bytes.toString("base64")}`, "image")).toBe(false);
  });
  it("rejects noncanonical padding", () => expect(validBugReportMedia("data:image/png;base64,AB==", "image")).toBe(false));
});
