import { canManageCourse, canSeeCourse, manageReach, manageSql, newCourseUniversity, reachParams, seeReach, seeSql } from "@/lib/server/course-scope";

const superAdmin = { role: "admin", superAdmin: true, universityId: null };
const msoeAdmin = { role: "admin", superAdmin: false, universityId: 1 };
const msoeTutor = { role: "tutor", superAdmin: false, universityId: 1 };
const msoeStudent = { role: "employee", superAdmin: false, universityId: 1 };
const loneStudent = { role: "employee", superAdmin: false, universityId: null };

describe("who sees and manages which courses", () => {
  it("shows everyone platform courses, members their own university's, and super admins everything", () => {
    expect(canSeeCourse(loneStudent, null)).toBe(true);
    expect(canSeeCourse(loneStudent, 1)).toBe(false);
    expect(canSeeCourse(msoeStudent, 1)).toBe(true);
    expect(canSeeCourse(msoeStudent, 2)).toBe(false);
    expect(canSeeCourse(superAdmin, 2)).toBe(true);
  });

  it("lets a university admin manage only their university's courses, and nobody else manage beyond what they own", () => {
    expect(canManageCourse(msoeAdmin, 1)).toBe(true);
    expect(canManageCourse(msoeAdmin, 2)).toBe(false);
    // Platform courses belong to the Requisor team.
    expect(canManageCourse(msoeAdmin, null)).toBe(false);
    expect(canManageCourse(msoeTutor, 1)).toBe(false);
    expect(canManageCourse(superAdmin, null)).toBe(true);
    expect(canManageCourse(superAdmin, 7)).toBe(true);
  });

  it("passes the right values to the SQL rules", () => {
    expect(reachParams(seeReach(msoeStudent))).toEqual([false, 1]);
    expect(reachParams(seeReach(superAdmin))).toEqual([true, null]);
    expect(reachParams(manageReach(msoeTutor))).toEqual([false, null]);
    expect(reachParams(manageReach(msoeAdmin))).toEqual([false, 1]);
    // An "admin" without a university reaches nothing beyond what they own.
    expect(reachParams(manageReach({ role: "admin", superAdmin: false, universityId: null }))).toEqual([false, null]);
    expect(seeSql("c", 2, 3)).toBe("($2::boolean OR c.university_id IS NULL OR c.university_id = $3::int)");
    expect(manageSql("c", 4, 5)).toBe("($4::boolean OR (c.university_id IS NOT NULL AND c.university_id = $5::int))");
  });

  it("puts a new course in its creator's university, or on the platform for super admins", () => {
    expect(newCourseUniversity(msoeTutor)).toBe(1);
    expect(newCourseUniversity(superAdmin)).toBeNull();
    expect(newCourseUniversity(loneStudent)).toBeNull();
  });
});
