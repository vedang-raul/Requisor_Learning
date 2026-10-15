jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/server/db", () => ({ db: { query: jest.fn() } }));

import { getServerSession } from "next-auth/next";
import { db } from "@/lib/server/db";
import { GET as listSubmissions } from "@/app/api/tutor/assignment-submissions/route";
import { GET as submissionDetail } from "@/app/api/tutor/assignment-submissions/detail/route";

const session = getServerSession as jest.Mock;
const query = (db as unknown as { query: jest.Mock }).query;
const asUser = (user: Record<string, unknown>) => session.mockResolvedValue({ user: { email: "x@example.test", ...user } });

/**
 * Check Assignments: a tutor sees submissions only to courses they own. An
 * admin's reach (their university, or everything for a super admin) is the only
 * way past that, and tutors have none.
 */
describe("which submissions a tutor can see", () => {
  beforeEach(() => { query.mockReset(); query.mockResolvedValue({ rows: [] }); });

  it("lists only submissions to the tutor's own courses", async () => {
    asUser({ id: "7", role: "tutor", universityId: 1 });
    expect((await listSubmissions(new Request("http://x/api/tutor/assignment-submissions/"))).status).toBe(200);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("c.owner_user_id = $2");
    // No reach beyond their own courses, even inside their university.
    expect(params).toEqual([false, 7, null]);
  });

  it("checks ownership for one lesson's submissions and one submission's details", async () => {
    asUser({ id: "7", role: "tutor", universityId: 1 });
    expect((await listSubmissions(new Request("http://x/api/tutor/assignment-submissions/?lessonId=someone-elses-lesson"))).status).toBe(404);
    expect(query.mock.calls[0][1]).toEqual(["someone-elses-lesson", false, 7, null]);

    query.mockClear();
    expect((await submissionDetail(new Request("http://x/api/tutor/assignment-submissions/detail/?submissionId=55"))).status).toBe(404);
    expect(query.mock.calls[0][0]).toContain("c.owner_user_id = $3");
    expect(query.mock.calls[0][1]).toEqual([55, false, 7, null]);
  });

  it("lets a university admin reach their university's courses, and a super admin all", async () => {
    asUser({ id: "3", role: "admin", superAdmin: false, universityId: 1 });
    await listSubmissions(new Request("http://x/api/tutor/assignment-submissions/"));
    expect(query.mock.calls[0][1]).toEqual([false, 3, 1]);

    query.mockClear();
    asUser({ id: "2", role: "admin", superAdmin: true, universityId: null });
    await listSubmissions(new Request("http://x/api/tutor/assignment-submissions/"));
    expect(query.mock.calls[0][1]).toEqual([true, 2, null]);
  });

  it("refuses students", async () => {
    asUser({ id: "9", role: "employee" });
    expect((await listSubmissions(new Request("http://x/api/tutor/assignment-submissions/"))).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});
