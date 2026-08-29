jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/course-catalog", () => ({ ensureCourseCatalog: jest.fn() }));
jest.mock("@/lib/db", () => ({ db: { connect: jest.fn() } }));

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { ensureCourseCatalog } from "@/lib/course-catalog";
import { db } from "@/lib/db";
import { POST } from "@/app/api/course-activity/route";

const session = getServerSession as jest.Mock;
const ensureCatalog = ensureCourseCatalog as jest.Mock;
const connect = db.connect as jest.Mock;

function request(body: string | object, headers?: HeadersInit) {
  return new NextRequest("https://learning.example/api/course-activity", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function mockClient(validLesson = true) {
  const query = jest.fn()
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rowCount: validLesson ? 1 : 0 })
    .mockResolvedValue({});
  const release = jest.fn();
  connect.mockResolvedValue({ query, release });
  return { query, release };
}

describe("course activity persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureCatalog.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated activity before reading or writing data", async () => {
    session.mockResolvedValue(null);
    const response = await POST(request({ courseSlug: "safe-course", lessonId: "safe-course-01" }));
    expect(response.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects tutor and admin activity so staff cannot contaminate learner metrics", async () => {
    for (const role of ["tutor", "admin"]) {
      session.mockResolvedValue({ user: { id: "8", role } });
      const response = await POST(request({ courseSlug: "safe-course", lessonId: "safe-course-01" }));
      expect(response.status).toBe(403);
    }
    expect(connect).not.toHaveBeenCalled();
    expect(ensureCatalog).not.toHaveBeenCalled();
  });

  it("validates the bounded activity payload before database work", async () => {
    session.mockResolvedValue({ user: { id: "8", role: "employee" } });
    const invalid = await POST(request({ courseSlug: "../other-course", lessonId: "lesson\u0000id" }));
    expect(invalid.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();

    const oversized = await POST(request({ courseSlug: "safe-course", lessonId: "x".repeat(3000) }, { "Content-Length": "4000" }));
    expect(oversized.status).toBe(413);
    expect(connect).not.toHaveBeenCalled();
  });

  it("records enrollment and lesson view with parameterized queries", async () => {
    session.mockResolvedValue({ user: { id: "8", role: "employee" } });
    const client = mockClient();

    const response = await POST(request({ courseSlug: "safe-course", lessonId: "safe-course-01" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(ensureCatalog).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenNthCalledWith(2, expect.stringContaining("WHERE c.slug = $1 AND l.id = $2"), ["safe-course", "safe-course-01"]);
    expect(client.query).toHaveBeenNthCalledWith(3, expect.stringContaining("INSERT INTO course_enrollments"), [8, "safe-course"]);
    expect(client.query).toHaveBeenNthCalledWith(4, expect.stringContaining("INSERT INTO lesson_views"), [8, "safe-course", "safe-course-01"]);
    expect(client.query).toHaveBeenLastCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("does not record activity for a mismatched course and lesson", async () => {
    session.mockResolvedValue({ user: { id: "8", role: "employee" } });
    const client = mockClient(false);

    const response = await POST(request({ courseSlug: "safe-course", lessonId: "other-course-01" }));
    expect(response.status).toBe(404);
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});