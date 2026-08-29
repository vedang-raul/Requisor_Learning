jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/course-catalog", () => ({ ensureCourseCatalog: jest.fn() }));
jest.mock("@/lib/db", () => ({ db: { query: jest.fn() } }));

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { ensureCourseCatalog } from "@/lib/course-catalog";
import { db } from "@/lib/db";
import { GET } from "@/app/api/tutor/insights/route";

const session = getServerSession as jest.Mock;
const ensureCatalog = ensureCourseCatalog as jest.Mock;
const query = db.query as jest.Mock;

function request(queryString = "courseSlug=owned-course&days=30") {
  return new NextRequest(`https://learning.example/api/tutor/insights?${queryString}`);
}

function mockInsights(
  enrolled = "8",
  recentActive = "6",
  started = "7",
  completed = "5",
  secondLessonStarted = "5",
  secondLessonCompleted = "5",
) {
  query
    .mockResolvedValueOnce({ rows: [{ slug: "owned-course", title: "Owned Course", lesson_count: "2" }] })
    .mockResolvedValueOnce({ rows: [{
      enrolled_count: enrolled,
      started_count: started,
      completed_count: completed,
      average_progress: "62.6",
      recent_active_count: recentActive,
    }] })
    .mockResolvedValueOnce({ rows: [
      { lesson_id: "owned-course-01", title: "First lesson", position: "0", started_count: "7", completed_count: "6" },
      { lesson_id: "owned-course-02", title: "Second lesson", position: "1", started_count: secondLessonStarted, completed_count: secondLessonCompleted },
    ] });
}

describe("tutor learner insights", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureCatalog.mockResolvedValue(undefined);
  });

  it("rejects employees before database work", async () => {
    session.mockResolvedValue({ user: { id: "7", role: "employee" } });
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it("validates the course slug and bounded date range", async () => {
    session.mockResolvedValue({ user: { id: "7", role: "tutor" } });
    expect((await GET(request("courseSlug=../private&days=30"))).status).toBe(400);
    expect((await GET(request("courseSlug=owned-course&days=366"))).status).toBe(400);
    expect((await GET(request("courseSlug=owned-course&days=7.5"))).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("enforces tutor ownership in every aggregate query", async () => {
    session.mockResolvedValue({ user: { id: "7", role: "tutor" } });
    query.mockResolvedValueOnce({ rows: [] });

    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("c.owner_user_id = $2");
    expect(query.mock.calls[0][1][0]).toBe("owned-course");
    expect(query.mock.calls[0][1]).toEqual(["owned-course", 7]);
  });

  it("returns aggregate-only metrics with consistent definitions", async () => {
    session.mockResolvedValue({ user: { id: "7", role: "tutor", email: "not-returned@example.test", name: "Not returned" } });
    mockInsights();

    const response = await GET(request());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      course: { slug: "owned-course", title: "Owned Course", lessonCount: 2 },
      period: { days: 30 },
      privacy: { suppressed: false, minimumLearners: 5 },
      summary: { enrolled: 8, started: 7, completed: 5, averageProgress: 63, recentActive: 6 },
      lessons: [
        { lessonId: "owned-course-01", started: 7, completed: 6, completionRate: 86 },
        { lessonId: "owned-course-02", started: 5, completed: 5, completionRate: 100 },
      ],
    });
    expect(JSON.stringify(data)).not.toContain("not-returned@example.test");
    expect(JSON.stringify(data)).not.toContain("userId");
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain("HAVING MIN(activity_at) >= $2");
    expect(query.mock.calls[1][0]).toContain("lv.last_viewed_at >= $2");
    expect(query.mock.calls[2][0]).toContain("lv.last_viewed_at >= $2");
    expect(query.mock.calls[1][0].match(/u\.role = 'employee'/g)).toHaveLength(5);
    expect(query.mock.calls[2][0].match(/u\.role = 'employee'/g)).toHaveLength(3);
    expect(query.mock.calls[0][1]).toEqual(["owned-course", 7]);
    for (const call of query.mock.calls.slice(1)) {
      expect(call[0]).not.toMatch(/user_name|user_email|lesson_notes|lesson_comments/i);
      expect(call[1][2]).toBe(7);
    }
  });

  it("suppresses small tutor cohorts but not the admin global view", async () => {
    session.mockResolvedValue({ user: { id: "7", role: "tutor" } });
    mockInsights("12", "4");
    const tutorData = await (await GET(request())).json();
    expect(tutorData.privacy.suppressed).toBe(true);
    expect(tutorData.summary).toEqual({
      enrolled: null,
      started: null,
      completed: null,
      averageProgress: null,
      recentActive: null,
    });
    expect(tutorData.lessons[0]).toMatchObject({ started: null, completed: null, completionRate: null });

    jest.clearAllMocks();
    ensureCatalog.mockResolvedValue(undefined);
    session.mockResolvedValue({ user: { id: "1", role: "admin" } });
    mockInsights("12", "4");
    const adminData = await (await GET(request("courseSlug=owned-course&days=90"))).json();
    expect(adminData.privacy.suppressed).toBe(false);
    expect(adminData.summary.enrolled).toBe(12);
    expect(query.mock.calls[0][1]).toEqual(["owned-course", null]);
  });

  it("suppresses a small historical cohort even with no activity in the selected period", async () => {
    session.mockResolvedValue({ user: { id: "7", role: "tutor" } });
    mockInsights("3", "0");

    const data = await (await GET(request("courseSlug=owned-course&days=7"))).json();
    expect(data.privacy.suppressed).toBe(true);
    expect(data.summary).toEqual({
      enrolled: null,
      started: null,
      completed: null,
      averageProgress: null,
      recentActive: null,
    });
    expect(data.lessons.every((lesson: { started: null; completed: null; completionRate: null }) =>
      lesson.started === null && lesson.completed === null && lesson.completionRate === null
    )).toBe(true);
  });

  it("suppresses when new starters are a small cohort despite large enrollment and activity", async () => {
    session.mockResolvedValue({ user: { id: "7", role: "tutor" } });
    mockInsights("12", "6", "1", "5");

    const data = await (await GET(request())).json();
    expect(data.privacy.suppressed).toBe(true);
    expect(Object.values(data.summary).every((value) => value === null)).toBe(true);
  });

  it("suppresses when a lesson cohort is small despite safe course-level cohorts", async () => {
    session.mockResolvedValue({ user: { id: "7", role: "tutor" } });
    mockInsights("12", "6", "7", "5", "1", "1");

    const data = await (await GET(request())).json();
    expect(data.privacy.suppressed).toBe(true);
    expect(data.lessons.every((lesson: { started: null; completed: null; completionRate: null }) =>
      lesson.started === null && lesson.completed === null && lesson.completionRate === null
    )).toBe(true);
  });
});