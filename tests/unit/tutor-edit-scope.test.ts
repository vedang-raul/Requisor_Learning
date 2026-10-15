jest.mock("@/lib/server/db", () => ({ db: { query: jest.fn(), connect: jest.fn() } }));

import { db } from "@/lib/server/db";
import { deleteOwnedCourse, updateOwnedCourse } from "@/lib/courses/course-catalog";
import { canManageLesson } from "@/lib/courses/lesson-transcript";
import { manageReach } from "@/lib/server/course-scope";
import type { Course } from "@/lib/types";

const query = (db as unknown as { query: jest.Mock }).query;
const connect = (db as unknown as { connect: jest.Mock }).connect;

const tutor = { role: "tutor", superAdmin: false, universityId: 1 };
const course = { slug: "someone-elses-course", revision: 3, lessons: [] } as unknown as Course;

/**
 * Tutors edit only courses they own. Other tutors' published courses they can
 * open as learners, but every route that changes a course checks ownership,
 * with an admin's reach as the only way past it.
 */
describe("a tutor editing another tutor's course", () => {
  let client: { query: jest.Mock; release: jest.Mock };
  beforeEach(() => {
    client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    connect.mockResolvedValue(client);
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  it("is refused an update: the lock only matches a course they own", async () => {
    expect(await updateOwnedCourse(course, 7, tutor)).toBe("not-found-or-forbidden");
    const lock = client.query.mock.calls.find(([sql]) => String(sql).includes("FOR UPDATE"));
    expect(lock?.[0]).toContain("owner_user_id=$2");
    expect(lock?.[1]).toEqual(["someone-elses-course", 7, false, null]);
    expect(client.query.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE courses"))).toBe(false);
  });

  it("is refused a delete", async () => {
    expect(await deleteOwnedCourse("someone-elses-course", 7, tutor)).toBe(false);
    expect(client.query.mock.calls.some(([sql]) => String(sql).startsWith("DELETE FROM courses"))).toBe(false);
  });

  it("can't change a lesson transcript in it", async () => {
    expect(await canManageLesson("someone-elses-course-1", 7, manageReach(tutor))).toBe(false);
    expect(query.mock.calls[0][1]).toEqual(["someone-elses-course-1", 7, false, null]);
  });

  it("gives a university admin their university's courses and nothing more", async () => {
    await canManageLesson("a-lesson", 3, manageReach({ role: "admin", superAdmin: false, universityId: 1 }));
    expect(query.mock.calls[0][1]).toEqual(["a-lesson", 3, false, 1]);
  });
});
