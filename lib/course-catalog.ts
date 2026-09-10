import type { PoolClient } from "pg";
import { db } from "@/lib/db";
import { seedCourses } from "@/lib/data";
import type { Course, Lesson, Resource } from "@/lib/types";
import { extractYouTubeId, PLACEHOLDER_VIDEO } from "@/lib/utils";
import { isResourceFileUrl } from "@/lib/resource-files";
import { isIsoCalendarDate } from "@/lib/validation";

type CourseRow = {
  slug: string;
  title: string;
  tagline: string;
  category: Course["category"];
  level: Course["level"];
  tags: string[];
  cover: string;
  added_at: string;
  owner_user_id: number | null;
  base_assessment: string | null;
  revision: number;
  tutor_name: string | null;
  published: boolean;
};
type LessonRow = {
  course_slug: string | null; id: string | null; lesson_title: string | null; lesson_description: string | null; youtube_id: string | null;
  duration_min: number | null; resources: Resource[] | null; key_takeaways: string[] | null; assignment: string | null;
  assignment_marks: number | null; assignment_due_date: string | null;
  section: string | null; format: "video" | "reading" | null; requires_submission: boolean | null; body: string | null; body_file_url: string | null;
};

let seedPromise: Promise<void> | undefined;
type CatalogClient = Pick<PoolClient, "query">;

export class CourseConflictError extends Error {
  constructor() {
    super("Course slug already exists.");
    this.name = "CourseConflictError";
  }
}

/**
 * Initializes the catalog on one connection. Exported so the legacy migration
 * can be exercised against an isolated real PostgreSQL schema.
 */
export async function initializeCourseCatalog(client: CatalogClient): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock($1)", [72619431]);
    // Catalog initialization also runs against legacy databases and isolated
    // migration-test schemas. Upgrade additive lesson fields before seeding.
    await client.query(`
      ALTER TABLE course_lessons
        ADD COLUMN IF NOT EXISTS body TEXT,
        ADD COLUMN IF NOT EXISTS body_file_url TEXT,
        ADD COLUMN IF NOT EXISTS requires_submission BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS assignment_marks INT,
        ADD COLUMN IF NOT EXISTS assignment_due_date DATE
    `);
    const marker = await client.query("SELECT 1 FROM course_catalog_metadata WHERE key=$1", ["seed-v1"]);
    if (!marker.rows[0]) {
      for (const course of seedCourses) {
        await client.query(
          `INSERT INTO courses (slug, title, tagline, category, level, tags, cover, added_at, base_assessment)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
           ON CONFLICT (slug) DO NOTHING`,
          [course.slug, course.title, course.tagline, course.category, course.level,
            JSON.stringify(course.tags), course.cover, course.addedAt, course.baseAssessment ?? null]
        );
        for (const lesson of course.lessons) {
          await client.query(
            `INSERT INTO course_lessons
            (id, course_slug, title, description, youtube_id, duration_min, resources, key_takeaways, assignment, section, format, body, body_file_url)
             VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13)
             ON CONFLICT (id) DO NOTHING`,
            [lesson.id, course.slug, lesson.title, lesson.description, lesson.youtubeId, lesson.durationMin,
              JSON.stringify(lesson.resources), JSON.stringify(lesson.keyTakeaways), lesson.assignment ?? null,
              lesson.section ?? null, lesson.format ?? "video" , lesson.body ?? null, lesson.bodyFileUrl ?? null]
          );
        }
      }
      await client.query(
        "INSERT INTO course_catalog_metadata (key) VALUES ($1) ON CONFLICT (key) DO NOTHING",
        ["seed-v1"]
      );
    }
    // Legacy databases used an unbounded TEXT review key. Remove values that
    // cannot reference the catalog, then align the type before installing the
    // FK. This always runs because seed-v1 predates this integrity migration.
    await client.query("DELETE FROM course_reviews r WHERE length(r.course_slug) > 80 OR NOT EXISTS (SELECT 1 FROM courses c WHERE c.slug=r.course_slug)");
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'course_reviews'
            AND column_name = 'course_slug'
            AND (data_type <> 'character varying' OR character_maximum_length IS DISTINCT FROM 80)
        ) THEN
          ALTER TABLE course_reviews
            ALTER COLUMN course_slug TYPE VARCHAR(80) USING course_slug::VARCHAR(80);
        END IF;
      END $$`);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'course_reviews_course_slug_fkey'
            AND conrelid = 'course_reviews'::regclass
        ) THEN
          ALTER TABLE course_reviews
            ADD CONSTRAINT course_reviews_course_slug_fkey
            FOREIGN KEY (course_slug) REFERENCES courses(slug) ON DELETE CASCADE;
        END IF;
      END $$`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

/** Seed only missing rows: edits made through the catalog API always win. */
export function ensureCourseCatalog(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const client = await db.connect();
      try {
        await initializeCourseCatalog(client);
      } finally {
        client.release();
      }
    })().catch((error) => {
      seedPromise = undefined;
      throw error;
    });
  }
  return seedPromise;
}

export async function getCourses(where = "", params: unknown[] = []): Promise<Course[]> {
  const { rows } = await db.query<CourseRow & LessonRow>(
    `SELECT c.slug, c.title, c.tagline, c.category, c.level, c.tags, c.cover, c.added_at,
             c.base_assessment, c.owner_user_id, c.revision, c.published, u.name AS tutor_name,
            l.id, l.course_slug, l.title AS lesson_title, l.description AS lesson_description,
             l.youtube_id, l.duration_min, l.resources, l.key_takeaways, l.assignment,
             l.assignment_marks, l.assignment_due_date,
             l.section, l.format, l.body, l.body_file_url, l.requires_submission
     FROM courses c
     LEFT JOIN course_lessons l ON l.course_slug = c.slug
     LEFT JOIN users u ON u.id = c.owner_user_id
     ${where} ORDER BY c.added_at, c.slug, l.position, l.id`, params);
  const courses = new Map<string, Course>();
  for (const row of rows) {
    let course = courses.get(row.slug);
    if (!course) {
      course = { slug: row.slug, title: row.title, tagline: row.tagline, category: row.category,
        level: row.level, tags: row.tags, cover: row.cover, addedAt: new Date(row.added_at).toISOString().slice(0, 10), revision: row.revision,
        tutorName: row.tutor_name ?? null, published: row.published,
        lessons: [], ...(row.base_assessment ? { baseAssessment: row.base_assessment } : {}) };
      courses.set(row.slug, course);
    }
    if (row.id) course.lessons.push({
      id: row.id, title: row.lesson_title!, description: row.lesson_description!,
      youtubeId: row.format === "reading"
        ? ""
        : extractYouTubeId(row.youtube_id ?? "") ?? PLACEHOLDER_VIDEO,
      durationMin: row.duration_min!, resources: row.resources!, keyTakeaways: row.key_takeaways!,
      ...(row.assignment ? { assignment: row.assignment } : {}), ...(row.section ? { section: row.section } : {}),
       ...(row.assignment_marks ? { assignmentMarks: row.assignment_marks } : {}),
       ...(row.assignment_due_date ? { assignmentDueDate: new Date(row.assignment_due_date).toISOString().slice(0, 10) } : {}),
      ...(row.body ? { body: row.body } : {}),
      ...(row.body_file_url ? { bodyFileUrl: row.body_file_url } : {}),
      format: row.format ?? "video", requiresSubmission: Boolean(row.requires_submission),
    });
  }
  return [...courses.values()];
}

const levels = new Set(["Beginner", "Intermediate", "Advanced"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const safeUrl = (value: string) => value === "#" || /^https:\/\//i.test(value) || isResourceFileUrl(value);
const string = (value: unknown, max: number, min = 1) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max;

/** Prevent a course editor from publishing another tutor's guessed file URL. */
async function assertResourceFileOwnership(client: CatalogClient, course: Course, userId: number, isAdmin = false): Promise<void> {
  if (isAdmin) return;
  const urls = course.lessons.flatMap((lesson) => [
    ...(lesson.bodyFileUrl ? [lesson.bodyFileUrl] : []),
    ...lesson.resources.map((resource) => resource.url),
  ]).filter(isResourceFileUrl);
  const ids = [...new Set(urls.map((url) => url.slice("/api/resources/".length)))];
  if (!ids.length) return;
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM resource_files WHERE owner_user_id=$1 AND id = ANY($2::text[])",
    [userId, ids]
  );
  if (rows.length !== ids.length) throw new Error("Course references a resource file you do not own.");
}

export function validateCourse(value: unknown, expectedSlug?: string, requireRevision = false): { ok: true; course: Course } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Course must be an object." };
  const c = value as Record<string, unknown>;
  // tutorName is server-derived (from owner_user_id) and round-trips through
  // the editor UI, but it's never read below — only owner_user_id, set from
  // the session, controls actual ownership.
  const allowed = new Set(["slug", "title", "tagline", "category", "level", "tags", "cover", "addedAt", "lessons", "baseAssessment", "revision", "tutorName", "published"]);
  if (Object.keys(c).some((key) => !allowed.has(key))) return { ok: false, error: "Course contains unsupported fields." };
  if (!string(c.slug, 80) || !slugPattern.test(c.slug as string) || (expectedSlug && c.slug !== expectedSlug)) return { ok: false, error: "Invalid course slug." };
  if (!string(c.title, 160) || !string(c.tagline, 400) || !string(c.cover, 200) ||
    !string(c.category, 40) || !levels.has(c.level as string) ||
    !Array.isArray(c.tags) || c.tags.length > 20 || !c.tags.every((x) => string(x, 50)) ||
    !Array.isArray(c.lessons) || c.lessons.length > 200 ||
    (c.baseAssessment !== undefined && !string(c.baseAssessment, 5000)) ||
    (c.published !== undefined && typeof c.published !== "boolean")) {
    return { ok: false, error: "Invalid course fields." };
  }
  // Date.parse accepts normalized dates (such as 2024-02-30), so compare its
  // canonical UTC representation as well as enforcing the wire format.
  const addedAt = typeof c.addedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.addedAt) &&
    !Number.isNaN(Date.parse(`${c.addedAt}T00:00:00.000Z`)) &&
    new Date(`${c.addedAt}T00:00:00.000Z`).toISOString().slice(0, 10) === c.addedAt;
  if (!addedAt) return { ok: false, error: "Invalid addedAt date." };
  if ((requireRevision && !Number.isInteger(c.revision)) ||
    (c.revision !== undefined && (!Number.isInteger(c.revision) || (c.revision as number) < 1))) return { ok: false, error: "Invalid course revision." };
  const ids = new Set<string>();
  const normalizedLessons: Lesson[] = [];
  for (const raw of c.lessons) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Invalid lesson." };
    const l = raw as Record<string, unknown>;
    const lessonKeys = new Set(["id", "title", "description", "youtubeId", "durationMin", "resources", "keyTakeaways", "assignment", "assignmentMarks", "assignmentDueDate", "section", "format", "body", "bodyFileUrl", "requiresSubmission"]);
    const format = l.format ?? "video";
    const rawYoutubeId = typeof l.youtubeId === "string" ? l.youtubeId.trim() : "";
    const youtubeId = format === "reading"
      ? ""
      : rawYoutubeId === "" || rawYoutubeId === PLACEHOLDER_VIDEO
        ? PLACEHOLDER_VIDEO
        : extractYouTubeId(rawYoutubeId);
    if (Object.keys(l).some((key) => !lessonKeys.has(key)) || !string(l.id, 120) || !slugPattern.test(l.id as string) ||
      !string(l.title, 200) || !string(l.description, 2000) || !string(l.youtubeId, 2048, 0) ||
      !Number.isInteger(l.durationMin) || (l.durationMin as number) < 1 || (l.durationMin as number) > 1440 ||
      !Array.isArray(l.keyTakeaways) || l.keyTakeaways.length > 20 || !l.keyTakeaways.every((x) => string(x, 500)) ||
      !Array.isArray(l.resources) || l.resources.length > 20 ||
      (l.assignment !== undefined && !string(l.assignment, 5000)) ||
      (l.assignmentMarks !== undefined && (!Number.isInteger(l.assignmentMarks) || (l.assignmentMarks as number) < 1 || (l.assignmentMarks as number) > 10000)) ||
      (l.assignmentDueDate !== undefined && !isIsoCalendarDate(l.assignmentDueDate)) ||
      (l.section !== undefined && !string(l.section, 200)) ||
      (l.format !== undefined && l.format !== "video" && l.format !== "reading") ||
      (format !== "reading" && !youtubeId) ||
      (l.body !== undefined && (format !== "reading" || !string(l.body, 20000))) ||
      (l.bodyFileUrl !== undefined && (format !== "reading" || !string(l.bodyFileUrl, 200) || !isResourceFileUrl(l.bodyFileUrl as string))) ||
      (l.body !== undefined && l.bodyFileUrl !== undefined) ||
      (l.requiresSubmission !== undefined && typeof l.requiresSubmission !== "boolean") ||
      ids.has(l.id as string) ||
      !(l.id as string).startsWith(`${c.slug}-`)) return { ok: false, error: "Invalid lesson fields." };
    ids.add(l.id as string);
    for (const resource of l.resources) {
      if (!resource || typeof resource !== "object" || Array.isArray(resource)) return { ok: false, error: "Invalid lesson resource." };
      const r = resource as Record<string, unknown>;
      if (Object.keys(r).some((key) => !["label", "url", "type"].includes(key)) || !string(r.label, 200) ||  !string(r.url, 2048) || !safeUrl(r.url as string) || (r.type !== "pdf" && r.type !== "link" && r.type !== "file")) return { ok: false, error: "Invalid lesson resource." };
    }
    normalizedLessons.push({ ...l, youtubeId, format } as unknown as Lesson);
  }
  return { ok: true, course: { ...c, lessons: normalizedLessons } as unknown as Course };
}

export async function replaceCourse(
  course: Course,
  ownerId: number | null,
  preserveOwner = false,
  createOnly = false
) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      createOnly
        ? `INSERT INTO courses (slug,title,tagline,category,level,tags,cover,added_at,base_assessment,owner_user_id,published)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)`
        : `INSERT INTO courses (slug,title,tagline,category,level,tags,cover,added_at,base_assessment,owner_user_id,published)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)
       ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title,tagline=EXCLUDED.tagline,category=EXCLUDED.category,
       level=EXCLUDED.level,tags=EXCLUDED.tags,cover=EXCLUDED.cover,added_at=EXCLUDED.added_at,
       base_assessment=EXCLUDED.base_assessment,published=EXCLUDED.published,
       owner_user_id=CASE WHEN $12 THEN courses.owner_user_id ELSE EXCLUDED.owner_user_id END`,
      [course.slug, course.title, course.tagline, course.category, course.level, JSON.stringify(course.tags), course.cover,
        course.addedAt, course.baseAssessment ?? null, ownerId, course.published ?? false, ...(!createOnly ? [preserveOwner] : [])]);
    if (ownerId !== null) await assertResourceFileOwnership(client, course, ownerId);
    await client.query("DELETE FROM course_lessons WHERE course_slug=$1", [course.slug]);
    for (let i = 0; i < course.lessons.length; i++) {
      const l = course.lessons[i];
      await client.query(`INSERT INTO course_lessons (id,course_slug,title,description,youtube_id,duration_min,resources,key_takeaways,assignment,section,format,position,requires_submission,body,body_file_url,assignment_marks,assignment_due_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [l.id, course.slug, l.title, l.description, l.youtubeId, l.durationMin, JSON.stringify(l.resources), JSON.stringify(l.keyTakeaways), l.assignment ?? null, l.section ?? null, l.format ?? "video", i, l.requiresSubmission ?? false, l.body ?? null, l.bodyFileUrl ?? null, l.assignmentMarks ?? null, l.assignmentDueDate ?? null]);

    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      createOnly &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new CourseConflictError();
    }
    throw error;
  } finally {
    client.release();
  }
}

export type UpdateCourseResult = "updated" | "not-found-or-forbidden" | "stale";

/** Owner authorization and replacement share one row lock/transaction. */
export async function updateOwnedCourse(course: Course, userId: number, isAdmin: boolean): Promise<UpdateCourseResult> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query<{ revision: number }>(
      "SELECT revision FROM courses WHERE slug=$1 AND ($2::boolean OR owner_user_id=$3) FOR UPDATE",
      [course.slug, isAdmin, userId]
    );
    if (!lock.rows[0]) { await client.query("ROLLBACK"); return "not-found-or-forbidden"; }
    if (lock.rows[0].revision !== course.revision) { await client.query("ROLLBACK"); return "stale"; }
    await assertResourceFileOwnership(client, course, userId, isAdmin);
    const next = lock.rows[0].revision + 1;
    await client.query(
      // published uses COALESCE, not a bare value: an editor that doesn't
      // send the field (anything other than the course editor's own publish
      // toggle) must never silently unpublish a live course.
      `UPDATE courses SET title=$1,tagline=$2,category=$3,level=$4,tags=$5::jsonb,cover=$6,added_at=$7,
       base_assessment=$8,published=COALESCE($9,published),revision=$10,updated_at=NOW() WHERE slug=$11 AND revision=$12`,
      [course.title, course.tagline, course.category, course.level, JSON.stringify(course.tags), course.cover,
        course.addedAt, course.baseAssessment ?? null, course.published ?? null, next, course.slug, course.revision]
    );
    await client.query("DELETE FROM course_lessons WHERE course_slug=$1", [course.slug]);
    for (let i = 0; i < course.lessons.length; i++) {
      const l = course.lessons[i];
      await client.query(`INSERT INTO course_lessons (id,course_slug,title,description,youtube_id,duration_min,resources,key_takeaways,assignment,section,format,position,requires_submission,body,body_file_url,assignment_marks,assignment_due_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [l.id, course.slug, l.title, l.description, l.youtubeId, l.durationMin, JSON.stringify(l.resources), JSON.stringify(l.keyTakeaways), l.assignment ?? null, l.section ?? null, l.format ?? "video", i, l.requiresSubmission ?? false, l.body ?? null, l.bodyFileUrl ?? null, l.assignmentMarks ?? null, l.assignmentDueDate ?? null]);
    }
    await client.query("COMMIT");
    course.revision = next;
    return "updated";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

/** Deletes dependent reviews explicitly for legacy schemas before the course. */
export async function deleteOwnedCourse(slug: string, userId: number, isAdmin: boolean): Promise<boolean> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      "SELECT slug FROM courses WHERE slug=$1 AND ($2::boolean OR owner_user_id=$3) FOR UPDATE",
      [slug, isAdmin, userId]
    );
    if (!locked.rows[0]) { await client.query("ROLLBACK"); return false; }
    await client.query("DELETE FROM course_reviews WHERE course_slug=$1", [slug]);
    await client.query("DELETE FROM courses WHERE slug=$1", [slug]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export type LessonLocation = {
  lessonId: string;
  lessonTitle: string;
  requiresSubmission: boolean;
  courseSlug: string;
  courseTitle: string;
  ownerUserId: number | null;
};

const lessonIdPattern = /^[a-z0-9-]{3,120}$/i;

/**
 * Resolves a lesson against the live, DB-backed catalog — unlike
 * lib/personalized-learning.ts's findTrustedLesson (which only searches the
 * static launch-time seed array), this also finds lessons in courses a
 * tutor created after launch. Callers that need lesson content as untrusted
 * AI prompt input should keep using findTrustedLesson; this is for
 * ownership/ID resolution, where every course must work, not just the four
 * seed ones.
 */
export async function findLessonLocation(lessonId: unknown): Promise<LessonLocation | null> {
  if (typeof lessonId !== "string" || !lessonIdPattern.test(lessonId)) return null;
  const { rows } = await db.query<{
    id: string; title: string; requires_submission: boolean;
    course_slug: string; course_title: string; owner_user_id: number | null;
  }>(
    `SELECT l.id, l.title, l.requires_submission, c.slug AS course_slug, c.title AS course_title, c.owner_user_id
     FROM course_lessons l JOIN courses c ON c.slug = l.course_slug
     WHERE l.id = $1`,
    [lessonId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    lessonId: row.id, lessonTitle: row.title, requiresSubmission: row.requires_submission,
    courseSlug: row.course_slug, courseTitle: row.course_title, ownerUserId: row.owner_user_id,
  };
}