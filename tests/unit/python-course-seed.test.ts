jest.mock("@/lib/server/db", () => ({ db: {} }));

import { initializeCourseCatalog } from "@/lib/courses/course-catalog";
import { seedCourses } from "@/lib/courses/data";

describe("one-time Python course import", () => {
  function client(markers: string[], courseExists = false) {
    const saved = new Set(markers);
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.startsWith("SELECT 1 FROM course_catalog_metadata")) {
        return { rows: saved.has(String(params?.[0])) ? [{ exists: 1 }] : [] };
      }
      if (sql.startsWith("INSERT INTO course_catalog_metadata")) saved.add(String(params?.[0]));
      if (sql.startsWith("INSERT INTO courses")) return { rows: courseExists ? [] : [{ slug: params?.[0] }] };
      return { rows: [] };
    });
    return { query };
  }

  it("adds Python to an existing catalog without importing old deleted seeds", async () => {
    const db = client(["seed-v1", "seed-programming"]);
    await initializeCourseCatalog(db as never);
    const courses = db.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO courses"));
    expect(courses.map(([, params]) => params?.[0])).toEqual(["python"]);
    const lessons = db.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO course_lessons"));
    expect(lessons.length).toBe(seedCourses.find((course) => course.slug === "python")?.lessons.length);
    await initializeCourseCatalog(db as never);
    expect(db.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO courses"))).toHaveLength(1);
  });

  it("does not modify lessons if the Python slug is already in use", async () => {
    const db = client(["seed-v1", "seed-programming"], true);
    await initializeCourseCatalog(db as never);
    expect(db.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO course_lessons"))).toHaveLength(0);
  });

  it("does not resurrect Python after its one-time import was recorded", async () => {
    const db = client(["seed-v1", "seed-python", "seed-programming"]);
    await initializeCourseCatalog(db as never);
    expect(db.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO courses"))).toHaveLength(0);
  });

  it("adds JavaScript and Java once without reimporting Python or old seeds", async () => {
    const db = client(["seed-v1", "seed-python"]);
    await initializeCourseCatalog(db as never);
    const courses = () => db.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO courses"));
    expect(courses().map(([, params]) => params?.[0])).toEqual(["javascript", "java"]);
    await initializeCourseCatalog(db as never);
    expect(courses()).toHaveLength(2);
  });
});
