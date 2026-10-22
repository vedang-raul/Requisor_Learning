jest.mock("@/lib/server/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/courses/course-catalog", () => ({
  getCourses: jest.fn(),
  validateCourse: jest.fn(),
  findLessonLocation: jest.fn(),
}));

import { db } from "@/lib/server/db";
import { getCourses } from "@/lib/courses/course-catalog";
import { runAssistantTool, toolsForRole, type ToolContext } from "@/lib/assistant/assistant-tools";

const mockQuery = db.query as jest.Mock;
const mockCourses = getCourses as jest.Mock;
const run = async (name: string, args: unknown, ctx: ToolContext) => JSON.parse((await runAssistantTool(name, JSON.stringify(args), ctx)).content);
const action = async (name: string, args: unknown, ctx: ToolContext) => (await runAssistantTool(name, JSON.stringify(args), ctx)).action;

const student: ToolContext = { userId: 4, role: "employee", universityId: 1 };
const tutor: ToolContext = { userId: 7, role: "tutor", universityId: 1 };
const uniAdmin: ToolContext = { userId: 9, role: "admin", universityId: 1, superAdmin: false };
const superAdmin: ToolContext = { userId: 130, role: "admin", universityId: null, superAdmin: true };

beforeEach(() => { jest.clearAllMocks(); mockQuery.mockResolvedValue({ rows: [] }); });

describe("each role gets the tools for its job", () => {
  const names = (role: "employee" | "tutor" | "admin") => toolsForRole(role).map((t) => t.function.name);
  it("learners can check their progress; tutors their insights, comments and video edits; admins their people", () => {
    expect(names("employee")).toContain("get_my_progress");
    expect(names("tutor")).toEqual(expect.arrayContaining(["get_course_insights", "list_lesson_comments", "list_video_edits"]));
    expect(names("tutor")).not.toContain("list_people");
    expect(names("admin")).toEqual(expect.arrayContaining(["get_university_overview", "list_people", "propose_review_person", "propose_assign_tutor", "get_course_insights"]));
    expect(names("employee")).not.toContain("list_people");
  });
});

describe("video edits say which course they're for", () => {
  it("returns the course title and a YouTube link", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, title: "Intro", status: "ready", course_slug: "sql", course_title: "SQL Basics", youtube_video_id: "dQw4w9WgXcQ" }] });
    const out = await run("list_video_edits", {}, tutor);
    expect(out.jobs[0]).toMatchObject({ course_title: "SQL Basics", youtube_url: "https://youtu.be/dQw4w9WgXcQ" });
    expect(mockQuery.mock.calls[0][1]).toEqual([7, null]);
  });
});

describe("course insights protect small groups", () => {
  it("withholds learner numbers under 5 learners", async () => {
    mockCourses.mockResolvedValue([{ slug: "sql", title: "SQL Basics", lessons: [{ id: "sql-1", title: "One", published: true }] }]);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ enrolled: "3", started: "3", active_week: "2", finished: "1" }] })
      .mockResolvedValueOnce({ rows: [{ lesson_id: "sql-1", completed: "1", viewed: "3" }] })
      .mockResolvedValueOnce({ rows: [{ waiting: "2", graded: "1", average: "80" }] });
    const out = await run("get_course_insights", { course_slug: "sql" }, tutor);
    expect(out.learners.withheld).toMatch(/Fewer than 5/);
    expect(out.lessons).toBeUndefined();
    expect(out.assignments).toEqual({ waiting_to_be_graded: 2, graded: 1, average_mark_percent: null });
  });

  it("only reaches courses the tutor manages", async () => {
    mockCourses.mockResolvedValue([]);
    expect((await run("get_course_insights", { course_slug: "someone-elses" }, tutor)).error).toMatch(/not found/);
  });
});

describe("admins only see their own university", () => {
  it("scopes the people list to a university admin's university", async () => {
    await run("list_people", { filter: "pending" }, uniAdmin);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("u.university_id = $1");
    expect(params[0]).toBe(1);
  });

  it("refuses to review someone at another university", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 50, name: "X", email: "x@other.edu", role: "employee", university_id: 2, university_status: "pending", requested_role: null, university: "Other U" }] });
    expect((await run("propose_review_person", { user_id: 50, decision: "approve" }, uniAdmin)).error).toMatch(/isn't at your university/);
  });

  it("proposes approving someone who is waiting", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 51, name: "Ana", email: "ana@uni.edu", role: "employee", university_id: 1, university_status: "pending", requested_role: null, university: "MSOE" }] });
    expect(await action("propose_review_person", { user_id: 51, decision: "approve" }, uniAdmin)).toMatchObject({ kind: "review_person", userId: 51, decision: "approve" });
  });
});

describe("assigning tutors is for the super admin", () => {
  it("refuses a university admin", async () => {
    expect((await run("propose_assign_tutor", { course_slug: "sql", tutor: "Ada" }, uniAdmin)).error).toMatch(/super admin/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("proposes the assignment for the super admin", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ title: "SQL Basics", university_id: 1, owner_user_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, name: "Ada Lovelace", email: "ada@uni.edu" }] });
    expect(await action("propose_assign_tutor", { course_slug: "sql", tutor: "Ada" }, superAdmin)).toMatchObject({ kind: "assign_tutor", tutorId: 5, courseTitle: "SQL Basics" });
  });

  it("asks which tutor when the name is ambiguous", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ title: "SQL Basics", university_id: null, owner_user_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, name: "Ada A", email: "a@x.io" }, { id: 6, name: "Ada B", email: "b@x.io" }] });
    expect((await run("propose_assign_tutor", { course_slug: "sql", tutor: "Ada" }, superAdmin)).error).toMatch(/Several tutors/);
  });
});

describe("opening pages respects roles", () => {
  it("keeps admin pages for admins, and super-admin tabs for the super admin", async () => {
    expect((await run("propose_open_page", { page: "admin_people" }, tutor)).error).toMatch(/only for admins/);
    expect((await run("propose_open_page", { page: "admin_activity" }, uniAdmin)).error).toMatch(/super admins/);
    expect(await action("propose_open_page", { page: "admin_activity" }, superAdmin)).toMatchObject({ href: "/app/admin/?tab=activity" });
    expect(await action("propose_open_page", { page: "profile" }, student)).toMatchObject({ href: "/app/settings/" });
  });
});
