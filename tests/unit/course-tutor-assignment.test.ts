jest.mock("@/lib/server/access", () => ({ requireAccess: jest.fn() }));
jest.mock("@/lib/server/email", () => ({ sendCourseAssignedEmail: jest.fn() }));
jest.mock("@/lib/server/db", () => ({ db: { query: jest.fn(), connect: jest.fn() } }));

import { PUT } from "@/app/api/admin/courses/[slug]/tutor/route";
import * as catalog from "@/lib/courses/course-catalog";
import { requireAccess } from "@/lib/server/access";
import { sendCourseAssignedEmail } from "@/lib/server/email";
import { db } from "@/lib/server/db";

const mockAccess = requireAccess as jest.Mock;
const mockEmail = sendCourseAssignedEmail as jest.Mock;
const mockConnect = (db as unknown as { connect: jest.Mock }).connect;

const put = (tutorId: unknown) => PUT(
  new Request("http://localhost/api/admin/courses/sql/tutor", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tutorId }) }),
  { params: Promise.resolve({ slug: "sql" }) }
);

/** A database client that answers the assignment's queries in order. */
function client(answers: Record<string, unknown[]>) {
  const calls: [string, unknown[]][] = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push([sql, params]);
    const key = Object.keys(answers).find((k) => sql.includes(k));
    return { rows: key ? answers[key] : [] };
  });
  mockConnect.mockResolvedValue({ query, release: jest.fn() });
  return calls;
}

describe("assigning a course's tutor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(catalog, "ensureCourseCatalog").mockResolvedValue(undefined);
    mockAccess.mockResolvedValue({ role: "admin", superAdmin: true });
  });

  it("is for super admins only", async () => {
    mockAccess.mockResolvedValue(Response.json({ error: "Forbidden" }, { status: 403 }));
    expect((await put(5)).status).toBe(403);
    expect(mockAccess).toHaveBeenCalledWith("super");
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("assigns a tutor from the course's university, moves the old tutor's files, and emails the new tutor", async () => {
    const calls = client({
      "FROM courses": [{ title: "SQL Basics", owner_user_id: 2, university_id: 1 }],
      "FROM users": [{ id: 5, name: "Ada", email: "ada@uni.edu", role: "tutor", university_id: 1, university_status: "active" }],
      "FROM course_lessons": [{ body_file_url: "/api/resources/0123456789abcdef0123456789abcdef", resources: [] }],
    });
    const res = await put(5);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ changed: true, emailed: true });
    expect(calls.some(([sql, p]) => sql.includes("UPDATE courses SET owner_user_id") && p[1] === 5)).toBe(true);
    expect(calls.some(([sql, p]) => sql.includes("UPDATE resource_files") && p[0] === 5 && p[1] === 2)).toBe(true);
    expect(mockEmail).toHaveBeenCalledWith("ada@uni.edu", "Ada", "SQL Basics");
  });

  it("refuses a tutor from another university, or someone who isn't a tutor", async () => {
    client({
      "FROM courses": [{ title: "SQL Basics", owner_user_id: null, university_id: 1 }],
      "FROM users": [{ id: 5, name: "Ada", email: "ada@other.edu", role: "tutor", university_id: 2, university_status: "active" }],
    });
    expect((await put(5)).status).toBe(400);
    client({
      "FROM courses": [{ title: "SQL Basics", owner_user_id: null, university_id: null }],
      "FROM users": [{ id: 6, name: "Sam", email: "sam@x.io", role: "employee", university_id: null, university_status: null }],
    });
    expect((await put(6)).status).toBe(400);
    expect(mockEmail).not.toHaveBeenCalled();
  });

  it("doesn't email when nothing changed, or when the course is left without a tutor", async () => {
    client({
      "FROM courses": [{ title: "SQL Basics", owner_user_id: 5, university_id: null }],
      "FROM users": [{ id: 5, name: "Ada", email: "ada@uni.edu", role: "tutor", university_id: null, university_status: null }],
    });
    expect(await (await put(5)).json()).toMatchObject({ changed: false, emailed: false });
    client({ "FROM courses": [{ title: "SQL Basics", owner_user_id: 5, university_id: null }] });
    expect(await (await put(null)).json()).toMatchObject({ changed: true, emailed: false, tutor: null });
    expect(mockEmail).not.toHaveBeenCalled();
  });

  it("keeps the assignment even if the email can't be sent", async () => {
    client({
      "FROM courses": [{ title: "SQL Basics", owner_user_id: null, university_id: null }],
      "FROM users": [{ id: 5, name: "Ada", email: "ada@uni.edu", role: "tutor", university_id: null, university_status: null }],
    });
    mockEmail.mockRejectedValue(new Error("mail down"));
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await put(5);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ changed: true, emailed: false });
  });

  it("rejects anything that isn't a tutor id or null", async () => {
    for (const bad of ["5", -1, 1.5, {}]) expect((await put(bad)).status).toBe(400);
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
