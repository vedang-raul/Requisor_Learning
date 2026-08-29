jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/course-catalog", () => ({ ensureCourseCatalog: jest.fn() }));
jest.mock("@/lib/db", () => ({ db: { query: jest.fn() } }));

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { ensureCourseCatalog } from "@/lib/course-catalog";
import { db } from "@/lib/db";
import { DELETE, POST } from "@/app/api/completions/route";

const session = getServerSession as jest.Mock;
const ensureCatalog = ensureCourseCatalog as jest.Mock;
const query = db.query as jest.Mock;

function request(method: "POST" | "DELETE", body: object | string) {
  return new NextRequest("https://learning.example/api/completions", {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("lesson completion integrity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    session.mockResolvedValue({ user: { id: "12", role: "employee" } });
    ensureCatalog.mockResolvedValue(undefined);
  });

  it("inserts only from a server-validated course and lesson match", async () => {
    query.mockResolvedValue({ rowCount: 1, rows: [{ id: 1 }] });
    const response = await POST(request("POST", { courseSlug: "safe-course", lessonId: "safe-course-01" }));
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE l.id = $2 AND l.course_slug = $3"),
      [12, "safe-course-01", "safe-course"],
    );
    expect(query.mock.calls[0][0]).toContain("INSERT INTO lesson_completions");
  });

  it("rejects staff completion writes so they cannot affect learner reporting", async () => {
    for (const role of ["tutor", "admin"]) {
      session.mockResolvedValue({ user: { id: "12", role } });
      expect((await POST(request("POST", { courseSlug: "safe-course", lessonId: "safe-course-01" }))).status).toBe(403);
      expect((await DELETE(request("DELETE", { lessonId: "safe-course-01" }))).status).toBe(403);
    }
    expect(query).not.toHaveBeenCalled();
    expect(ensureCatalog).not.toHaveBeenCalled();
  });

  it("rejects forged course and lesson pairs without creating a completion", async () => {
    query.mockResolvedValue({ rowCount: 0, rows: [] });
    const response = await POST(request("POST", { courseSlug: "safe-course", lessonId: "other-course-01" }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Lesson not found." });
  });

  it("rejects malformed identifiers and malformed JSON before querying", async () => {
    expect((await POST(request("POST", { courseSlug: "../private", lessonId: "lesson-01" }))).status).toBe(400);
    expect((await POST(request("POST", "{not-json"))).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("deletes only the authenticated learner's matching completion", async () => {
    query.mockResolvedValue({ rowCount: 1 });
    const response = await DELETE(request("DELETE", { lessonId: "safe-course-01" }));
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE user_id = $1 AND lesson_id = $2"),
      [12, "safe-course-01"],
    );
  });
});