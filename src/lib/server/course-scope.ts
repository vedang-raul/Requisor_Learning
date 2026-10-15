/**
 * Which courses a person may see and manage, now that universities are
 * separate (see src/lib/auth/roles.ts).
 *
 *   see     platform courses (no university) and their own university's.
 *           Super admins see everything.
 *   manage  beyond the courses they own: a university admin manages every
 *           course of their university; a super admin manages every course.
 *
 * The SQL helpers take the positions of two query parameters, filled with
 * reachParams(): whether the person reaches everything, and their university.
 */
export type ScopeUser = { role?: string | null; superAdmin?: boolean | null; universityId?: number | null };
export type Reach = { all: boolean; universityId: number | null };

const university = (user: ScopeUser) => (typeof user.universityId === "number" && user.universityId > 0 ? user.universityId : null);

/** The courses a person sees as a learner. */
export function seeReach(user: ScopeUser): Reach {
  return user.superAdmin ? { all: true, universityId: null } : { all: false, universityId: university(user) };
}

/** The courses a person manages without owning them; nothing for tutors and students. */
export function manageReach(user: ScopeUser): Reach {
  if (user.superAdmin) return { all: true, universityId: null };
  if (user.role === "admin" && university(user)) return { all: false, universityId: university(user) };
  return { all: false, universityId: null };
}

export const reachParams = (reach: Reach): [boolean, number | null] => [reach.all, reach.universityId];

/** SQL: the course (by alias) is one this person may see. */
export function seeSql(alias: string, allParam: number, universityParam: number): string {
  return `($${allParam}::boolean OR ${alias}.university_id IS NULL OR ${alias}.university_id = $${universityParam}::int)`;
}

/** SQL: the course (by alias) is one this person manages without owning it. */
export function manageSql(alias: string, allParam: number, universityParam: number): string {
  return `($${allParam}::boolean OR (${alias}.university_id IS NOT NULL AND ${alias}.university_id = $${universityParam}::int))`;
}

export function canSeeCourse(user: ScopeUser, courseUniversityId: number | null | undefined): boolean {
  const reach = seeReach(user);
  return reach.all || courseUniversityId == null || courseUniversityId === reach.universityId;
}

export function canManageCourse(user: ScopeUser, courseUniversityId: number | null | undefined): boolean {
  const reach = manageReach(user);
  return reach.all || (courseUniversityId != null && courseUniversityId === reach.universityId);
}

/** The university new work belongs to: none for super admins (platform-wide), else the person's own. */
export function newCourseUniversity(user: ScopeUser): number | null {
  return user.superAdmin ? null : university(user);
}
