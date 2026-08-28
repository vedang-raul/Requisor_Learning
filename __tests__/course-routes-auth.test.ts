jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/course-catalog", () => ({
  ensureCourseCatalog: jest.fn().mockResolvedValue(undefined),
  getCourses: jest.fn(),
}));

import { GET as catalogGet } from "@/app/api/courses/route";
import { GET as tutorGet } from "@/app/api/tutor/courses/route";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { getCourses } from "@/lib/course-catalog";

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
    expect(mockGetCourses).toHaveBeenCalledWith("WHERE c.owner_user_id=$1", [7]);
    expect(query.mock.calls[0][1]).toEqual([7]);
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