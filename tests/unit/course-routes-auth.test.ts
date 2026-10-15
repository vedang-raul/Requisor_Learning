jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/server/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/courses/course-catalog", () => ({
  ensureCourseCatalog: jest.fn().mockResolvedValue(undefined),
  getCourses: jest.fn(),
}));

import { GET as catalogGet } from "@/app/api/courses/route";
import { GET as tutorGet } from "@/app/api/tutor/courses/route";
import { getServerSession } from "next-auth";
import { db } from "@/lib/server/db";
import { getCourses } from "@/lib/courses/course-catalog";

const session = getServerSession as jest.Mock;
const query = (db as unknown as { query: jest.Mock }).query;
const mockGetCourses = getCourses as jest.Mock;

describe("course route authorization and ownership isolation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not disclose the catalog without a session", async () => {
    session.mockResolvedValue(null);
    const response = await catalogGet();
    expect(response.status).toBe(401);
    expect(mockGetCourses).not.toHaveBeenCalled();
  });

  it("hides draft courses and other universities' courses from the learner catalog", async () => {
    session.mockResolvedValue({ user: { id: "8", role: "employee", universityId: 4 } });
    mockGetCourses.mockResolvedValue([]);
    const response = await catalogGet();
    expect(response.status).toBe(200);
    const [where, params] = mockGetCourses.mock.calls[0];
    expect(where).toMatch(/^WHERE c\.published = TRUE AND /);
    expect(where).toContain("c.university_id IS NULL OR c.university_id = $2::int");
    expect(params).toEqual([false, 4]);
  });

  it("lets a university admin load their own university's drafts, and a super admin every course", async () => {
    session.mockResolvedValue({ user: { id: "1", role: "admin", superAdmin: false, universityId: 4 } });
    mockGetCourses.mockResolvedValue([]);
    expect((await catalogGet()).status).toBe(200);
    expect(mockGetCourses.mock.calls[0][0]).toContain("c.university_id = $4::int");
    expect(mockGetCourses.mock.calls[0][1]).toEqual([false, 4, false, 4]);

    mockGetCourses.mockClear();
    session.mockResolvedValue({ user: { id: "2", role: "admin", superAdmin: true, universityId: null } });
    expect((await catalogGet()).status).toBe(200);
    expect(mockGetCourses.mock.calls[0][1]).toEqual([true, null, true, null]);
  });

  it("scopes tutor summary queries to their owner id and returns full course contract", async () => {
    session.mockResolvedValue({ user: { id: "7", role: "tutor" } });
    const course = { slug: "owned-course", title: "Owned", lessons: [] };
    mockGetCourses.mockResolvedValue([course]);
    query.mockResolvedValue({ rows: [{
      course_slug: "owned-course", average_rating: "4.5", review_count: "2",
      one_star: "0", two_star: "0", three_star: "0", four_star: "1", five_star: "1",
    }] });
    const response = await tutorGet();
    expect(response.status).toBe(200);
    // A tutor reaches only their own courses: the university part is switched off for them.
    expect(mockGetCourses.mock.calls[0][0]).toMatch(/^WHERE c\.owner_user_id=\$1 OR /);
    expect(mockGetCourses.mock.calls[0][1]).toEqual([7, false, null]);
    expect(query.mock.calls[0][1]).toEqual([7, false, null]);
    await expect(response.json()).resolves.toEqual({
      courses: [{ course, averageRating: 4.5, ratingCount: 2, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } }],
    });
  });

  it("rejects employee access to tutor-only summaries before database work", async () => {
    session.mockResolvedValue({ user: { id: "7", role: "employee" } });
    const response = await tutorGet();
    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});