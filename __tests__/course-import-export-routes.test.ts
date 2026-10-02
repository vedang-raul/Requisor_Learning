jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => ({
  db: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));
jest.mock("@/lib/course-catalog", () => ({
  replaceCourse: jest.fn(),
  validateCourse: jest.fn((course) => ({ ok: true, course })),
  CourseConflictError: class CourseConflictError extends Error {},
}));
jest.mock("@/components/category-icon", () => ({
  getCategoryCover: jest.fn(() => "/covers/leadership.svg"),
}));

import { getServerSession } from "next-auth/next";
import { db } from "@/lib/db";
import { replaceCourse } from "@/lib/course-catalog";
import { buildCourseFromImport, COURSE_EXPORT_FORMAT, MAX_IMPORT_RUBRIC_CRITERIA } from "@/lib/course-export";
import { GET } from "@/app/api/tutor/courses/export/route";
import { POST } from "@/app/api/tutor/courses/import/route";

const mockSession = getServerSession as jest.Mock;
const mockQuery = db.query as jest.Mock;
const mockConnect = db.connect as jest.Mock;
const mockReplaceCourse = replaceCourse as jest.Mock;

const validPackage = {
  format: COURSE_EXPORT_FORMAT,
  exportedAt: "2026-09-09T10:00:00.000Z",
  sourcePlatform: "Requisor Learning",
  course: {
    title: "Leading Teams",
    tagline: "Practical leadership skills",
    category: "Leadership",
    level: "Intermediate",
    tags: ["leadership", "teams"],
    baseAssessment: "Create a leadership plan.",
  },
  lessons: [
    {
      title: "Leadership Foundations",
      description: "Learn the foundations.",
      youtubeId: "video123",
      durationMin: 25,
      resources: [
        { label: "Workbook", url: "https://example.com/workbook.pdf", type: "pdf" },
        { label: "Further reading", url: "https://example.com/article", type: "link" },
      ],
      keyTakeaways: ["Set clear expectations"],
      assignment: "Write a team charter.",
      assignmentMarks: 40,
      assignmentDueDate: "2026-10-15",
      requiresSubmission: true,
      section: "Foundations",
      format: "reading",
      body: "## Leadership\n\nClarity builds trust.",
      rubric: [
        { title: "Clarity", description: "Sets clear expectations.", maxPoints: 20 },
      ],
    },
  ],
};

function importRequest(body: unknown): Request {
  return new Request("http://localhost/api/tutor/courses/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("buildCourseFromImport", () => {
  it("preserves all portable fields in the browser preview", () => {
    const result = buildCourseFromImport(validPackage);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.course.tags).toEqual(["leadership", "teams"]);
    expect(result.course.lessons[0]).toEqual(expect.objectContaining({
      assignmentMarks: 40,
      assignmentDueDate: "2026-10-15",
      body: "## Leadership\n\nClarity builds trust.",
      resources: validPackage.lessons[0].resources,
    }));
    expect(result.rubricByLessonId[result.course.lessons[0].id]).toEqual(validPackage.lessons[0].rubric);
  });

  it.each([
    [
      { resources: [{ label: "Unsafe", url: "javascript:alert(1)", type: "link" }] },
      "Lesson 1 has an invalid resource.",
    ],
    [
      { rubric: [{ title: "", description: null, maxPoints: -1 }] },
      "Lesson 1 has an invalid grading rubric.",
    ],
    [
      { assignmentMarks: 0 },
      "Lesson 1 has invalid assignment points.",
    ],
    [
      { assignmentDueDate: "2026-02-30" },
      "Lesson 1 has an invalid assignment due date.",
    ],
  ])("returns the shared nested-field error for %#", (lessonPatch, error) => {
    const result = buildCourseFromImport({
      ...validPackage,
      lessons: [{ ...validPackage.lessons[0], ...lessonPatch }],
    });

    expect(result).toEqual({ ok: false, error });
  });
});

describe("GET /api/tutor/courses/export", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "17", role: "tutor" } });
  });

  it("exports complete portable lesson content, assignments, resources, and rubrics", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          title: "Leading Teams",
          tagline: "Practical leadership skills",
          category: "Leadership",
          level: "Intermediate",
          tags: ["leadership", "teams"],
          base_assessment: "Create a leadership plan.",
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "leading-teams-01",
          title: "Leadership Foundations",
          description: "Learn the foundations.",
          youtube_id: "video123",
          duration_min: 25,
          resources: validPackage.lessons[0].resources,
          key_takeaways: ["Set clear expectations"],
          assignment: "Write a team charter.",
          assignment_marks: 40,
          assignment_due_date: new Date("2026-10-15T00:00:00.000Z"),
          requires_submission: true,
          section: "Foundations",
          format: "reading",
          body: "## Leadership\n\nClarity builds trust.",
          body_file_url: "https://example.com/leadership.pdf",
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          lesson_id: "leading-teams-01",
          title: "Clarity",
          description: "Sets clear expectations.",
          max_points: 20,
        }],
      });

    const response = await GET(new Request("http://localhost/api/tutor/courses/export?slug=leading-teams"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="leading-teams-export.json"');
    expect(payload).toEqual(expect.objectContaining({
      format: COURSE_EXPORT_FORMAT,
      sourcePlatform: "Requisor Learning",
      course: expect.objectContaining({
        title: "Leading Teams",
        baseAssessment: "Create a leadership plan.",
      }),
    }));
    expect(payload.lessons).toEqual([expect.objectContaining({
      assignment: "Write a team charter.",
      assignmentMarks: 40,
      assignmentDueDate: "2026-10-15",
      format: "reading",
      body: "## Leadership\n\nClarity builds trust.",
      bodyFileUrl: "https://example.com/leadership.pdf",
      resources: validPackage.lessons[0].resources,
      rubric: [{ title: "Clarity", description: "Sets clear expectations.", maxPoints: 20 }],
    })]);
    expect(mockQuery.mock.calls[0][1]).toEqual(["leading-teams", false, 17]);
  });
});

describe("POST /api/tutor/courses/import", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "23", role: "tutor" } });
    mockReplaceCourse.mockResolvedValue(undefined);
  });

  it("creates a new unpublished course owned by the importing tutor", async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    mockConnect.mockResolvedValue(client);

    const response = await POST(importRequest(validPackage));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.course).toEqual(expect.objectContaining({
      title: "Leading Teams",
      published: false,
      tags: ["leadership", "teams"],
    }));
    expect(data.course.lessons[0]).toEqual(expect.objectContaining({
      assignmentMarks: 40,
      assignmentDueDate: "2026-10-15",
      format: "reading",
      body: "## Leadership\n\nClarity builds trust.",
      resources: validPackage.lessons[0].resources,
    }));
    expect(mockReplaceCourse).toHaveBeenCalledWith(
      expect.objectContaining({ published: false }),
      23,
      false,
      true
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO assignment_rubric_criteria"),
      [data.course.lessons[0].id, "Clarity", "Sets clear expectations.", 20, 0]
    );
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("rejects packages larger than the import limit with 413", async () => {
    const oversized = {
      ...validPackage,
      course: { ...validPackage.course, tagline: "x".repeat(513 * 1024) },
    };

    const response = await POST(importRequest(oversized));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Export file is too large." });
    expect(mockReplaceCourse).not.toHaveBeenCalled();
  });

  it.each([
    [
      "malformed nested resources",
      { resources: [{ label: "Unsafe", url: "javascript:alert(1)", type: "link" }] },
      "Lesson 1 has an invalid resource.",
    ],
    [
      "too many nested rubric criteria",
      {
        rubric: Array.from({ length: MAX_IMPORT_RUBRIC_CRITERIA + 1 }, (_, i) => ({
          title: `Criterion ${i + 1}`,
          description: null,
          maxPoints: 1,
        })),
      },
      "Lesson 1 has an invalid grading rubric.",
    ],
    [
      "malformed nested rubric criteria",
      { rubric: [{ title: "", description: null, maxPoints: -1 }] },
      "Lesson 1 has an invalid grading rubric.",
    ],
  ])("rejects %s with 400", async (_name, lessonPatch, expectedError) => {
    const body = {
      ...validPackage,
      lessons: [{ ...validPackage.lessons[0], ...lessonPatch }],
    };

    const response = await POST(importRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: expectedError });
    expect(mockReplaceCourse).not.toHaveBeenCalled();
  });

  it("returns the documented warning when rubric persistence rolls back", async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error("rubric insert failed"))
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    };
    mockConnect.mockResolvedValue(client);
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(importRequest(validPackage));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      course: expect.objectContaining({ published: false }),
      warning: "The course imported, but its grading rubric could not be copied.",
    }));
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });
});