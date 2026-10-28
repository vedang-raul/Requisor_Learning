import type { PoolClient } from "pg";
import { isValidAssignmentAi, readAssignmentAi } from "@/lib/ai/assignment-ai";
import { manageReach, manageSql, reachParams, type ScopeUser } from "../server/course-scope";
import { db } from "@/lib/server/db";
import { seedCourses } from "@/lib/courses/data";
import type { Course, CourseModule, Lesson, Resource } from "@/lib/types";
import { extractYouTubeId, PLACEHOLDER_VIDEO } from "@/lib/utils";
import { isResourceFileUrl } from "@/lib/courses/resource-files";
import { isIsoCalendarDate } from "@/lib/auth/validation";

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
  university_id: number | null;
  base_assessment: string | null;
  revision: number;
  tutor_name: string | null;
  published: boolean;
  syllabus: Course["syllabus"];
  modules: unknown;
};
type LessonRow = {
  course_slug: string | null; id: string | null; lesson_title: string | null; lesson_description: string | null; youtube_id: string | null;
  duration_min: number | null; resources: Resource[] | null; key_takeaways: string[] | null; assignment: string | null;
  assignment_marks: number | null; assignment_due_date: string | null; assignment_ai: unknown;
  section: string | null; format: "video" | "reading" | "code-tutorial" | null; requires_submission: boolean | null; body: string | null; body_file_url: string | null;
  thumbnail_url: string | null;
  starter_code: string | null;
  language: "python" | "javascript" | null;
  lesson_published: boolean | null; publish_at: Date | string | null;
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
        ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(200),
        ADD COLUMN IF NOT EXISTS requires_submission BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS assignment_marks INT,
        ADD COLUMN IF NOT EXISTS assignment_due_date DATE,
        ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS starter_code TEXT,
        ADD COLUMN IF NOT EXISTS language TEXT
    `);
    await client.query("ALTER TABLE courses ADD COLUMN IF NOT EXISTS syllabus JSONB");
    await client.query("ALTER TABLE courses ADD COLUMN IF NOT EXISTS modules JSONB");
    await client.query(`
      DO $$ BEGIN
        -- Databases created before code tutorials have format VARCHAR(10) limited
        -- to 'video'/'reading'; 'code-tutorial' (the Python/JS/Java seed lessons)
        -- would fail every catalog load. Widen and extend them once, keeping data.
        IF (SELECT character_maximum_length FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'course_lessons' AND column_name = 'format') < 20 THEN
          ALTER TABLE course_lessons ALTER COLUMN format TYPE VARCHAR(20);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'course_lessons_format_check'
                     AND conrelid = 'course_lessons'::regclass
                     AND pg_get_constraintdef(oid) NOT LIKE '%code-tutorial%') THEN
          ALTER TABLE course_lessons DROP CONSTRAINT course_lessons_format_check;
          ALTER TABLE course_lessons ADD CONSTRAINT course_lessons_format_check
            CHECK (format IN ('video','reading','code-tutorial'));
        END IF;
      END $$
    `);
    // New seed content needs its own one-time marker on existing catalogs.
    // Never reset seed-v1: that would bring back deliberately deleted courses.
    const batches = [
      { key: "seed-v1", courses: seedCourses },
      { key: "seed-python", courses: seedCourses.filter((course) => course.slug === "python") },
      { key: "seed-programming", courses: seedCourses.filter((course) => course.slug === "javascript" || course.slug === "java") },
    ];
    for (const batch of batches) {
      const marker = await client.query("SELECT 1 FROM course_catalog_metadata WHERE key=$1", [batch.key]);
      if (marker.rows[0]) continue;
      for (const course of batch.courses) {
        const inserted = await client.query(
          `INSERT INTO courses (slug, title, tagline, category, level, tags, cover, added_at, base_assessment)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
           ON CONFLICT (slug) DO NOTHING RETURNING slug`,
          [course.slug, course.title, course.tagline, course.category, course.level,
            JSON.stringify(course.tags), course.cover, course.addedAt, course.baseAssessment ?? null]
        );
        // Preserve a previously imported or tutor-authored course unchanged.
        if (batch.key !== "seed-v1" && !inserted.rows[0]) continue;
        for (const lesson of course.lessons) {
          await client.query(
            `INSERT INTO course_lessons
            (id, course_slug, title, description, youtube_id, duration_min, resources, key_takeaways, assignment, section, format, body, body_file_url, starter_code, language)
             VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (id) DO NOTHING`,
            [lesson.id, course.slug, lesson.title, lesson.description, lesson.youtubeId, lesson.durationMin,
              JSON.stringify(lesson.resources), JSON.stringify(lesson.keyTakeaways), lesson.assignment ?? null,
              lesson.section ?? null, lesson.format ?? "video" , lesson.body ?? null, lesson.bodyFileUrl ?? null, lesson.starterCode ?? null, lesson.language ?? null]
          );
        }
      }
      await client.query(
        "INSERT INTO course_catalog_metadata (key) VALUES ($1) ON CONFLICT (key) DO NOTHING",
        [batch.key]
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

const MAX_MODULES = 50;

/** A course's stored modules, cleaned: titled, de-duplicated, in order. */
function readModules(raw: unknown): CourseModule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CourseModule[] = [];
  for (const m of raw.slice(0, MAX_MODULES)) {
    if (!m || typeof m !== "object") continue;
    const title = typeof (m as CourseModule).title === "string" ? (m as CourseModule).title.trim().replace(/\s+/g, " ").slice(0, 200) : "";
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    const description = typeof (m as CourseModule).description === "string" ? (m as CourseModule).description!.trim().slice(0, 2000) : "";
    out.push(description ? { title, description } : { title });
  }
  return out;
}

/** Writes the course's modules when the save includes them; a save without them keeps what is stored. */
async function saveModules(client: CatalogClient, course: Course): Promise<void> {
  if (course.modules === undefined) return;
  await client.query("UPDATE courses SET modules=$2::jsonb WHERE slug=$1", [course.slug, JSON.stringify(readModules(course.modules))]);
}

export async function getCourses(where = "", params: unknown[] = []): Promise<Course[]> {
  const { rows } = await db.query<CourseRow & LessonRow>(
    `SELECT c.slug, c.title, c.tagline, c.category, c.level, c.tags, c.cover, c.added_at,
             c.base_assessment, c.owner_user_id, c.revision, c.published, c.syllabus, c.modules, c.university_id, u.name AS tutor_name,
            l.id, l.course_slug, l.title AS lesson_title, l.description AS lesson_description,
             l.youtube_id, l.duration_min, l.resources, l.key_takeaways, l.assignment,
             l.assignment_marks, to_char(l.assignment_due_date, 'YYYY-MM-DD') AS assignment_due_date, l.assignment_ai,
             l.section, l.format, l.body, l.body_file_url, l.thumbnail_url, l.starter_code, l.language, l.requires_submission, l.published AS lesson_published, l.publish_at
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
        tutorName: row.tutor_name ?? null, published: row.published, universityId: row.university_id ?? null, ...(row.syllabus ? { syllabus: row.syllabus } : {}),
        ...(readModules(row.modules).length ? { modules: readModules(row.modules) } : {}),
        lessons: [], ...(row.base_assessment ? { baseAssessment: row.base_assessment } : {}) };
      courses.set(row.slug, course);
    }
    if (row.id) course.lessons.push({
      id: row.id, title: row.lesson_title!, description: row.lesson_description!,
      youtubeId: row.format === "reading" || row.format === "code-tutorial"
        ? ""
        : extractYouTubeId(row.youtube_id ?? "") ?? PLACEHOLDER_VIDEO,
      durationMin: row.duration_min!, resources: row.resources!, keyTakeaways: row.key_takeaways!,
      ...(row.assignment ? { assignment: row.assignment } : {}), ...(row.section ? { section: row.section } : {}),
       ...(row.assignment_marks ? { assignmentMarks: row.assignment_marks } : {}),
       ...(row.assignment_due_date ? { assignmentDueDate: row.assignment_due_date } : {}),
      ...(readAssignmentAi(row.assignment_ai) ? { assignmentAi: readAssignmentAi(row.assignment_ai)! } : {}),
      ...(row.body ? { body: row.body } : {}),
      ...(row.body_file_url ? { bodyFileUrl: row.body_file_url } : {}),
      ...(row.thumbnail_url ? { thumbnailUrl: row.thumbnail_url } : {}),
      ...(row.starter_code ? { starterCode: row.starter_code } : {}),
      ...(row.language ? { language: row.language } : {}),
      format: row.format ?? "video", requiresSubmission: Boolean(row.requires_submission),
      ...(row.lesson_published === false ? { published: false } : {}),
      // Only a launch that is still ahead matters; once it passes the lesson is simply live.
      ...(row.lesson_published !== false && row.publish_at && new Date(row.publish_at).getTime() > Date.now()
        ? { publishAt: new Date(row.publish_at).toISOString() } : {}),
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
    ...(lesson.thumbnailUrl ? [lesson.thumbnailUrl] : []),
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
  // syllabus also round-trips but is saved by its own endpoint, so it is ignored here.
  // tutorName is server-derived (from owner_user_id) and round-trips through
  // the editor UI, but it's never read below — only owner_user_id, set from
  // the session, controls actual ownership. universityId round-trips the same
  // way (courses are loaded with it) and is dropped: the server decides it.
  const allowed = new Set(["slug", "title", "tagline", "category", "level", "tags", "cover", "addedAt", "lessons", "baseAssessment", "revision", "tutorName", "published", "syllabus", "universityId", "modules"]);
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
    const lessonKeys = new Set(["id", "title", "description", "youtubeId", "durationMin", "resources", "keyTakeaways", "assignment", "assignmentMarks", "assignmentDueDate", "assignmentAi", "section", "format", "body", "bodyFileUrl", "thumbnailUrl", "starterCode", "language", "requiresSubmission", "published", "publishAt"]);
    const format = l.format ?? "video";
    const isTextLesson = format === "reading" || format === "code-tutorial";
    const rawYoutubeId = typeof l.youtubeId === "string" ? l.youtubeId.trim() : "";
    const youtubeId = isTextLesson
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
      (l.assignmentAi !== undefined && !isValidAssignmentAi(l.assignmentAi)) ||
      (l.section !== undefined && !string(l.section, 200)) ||
      (l.format !== undefined && l.format !== "video" && l.format !== "reading" && l.format !== "code-tutorial") ||
      (!isTextLesson && !youtubeId) ||
      (l.body !== undefined && (!isTextLesson || !string(l.body, 20000))) ||
      (l.bodyFileUrl !== undefined && (format !== "reading" || !string(l.bodyFileUrl, 200) || !isResourceFileUrl(l.bodyFileUrl as string))) ||
      (l.body !== undefined && l.bodyFileUrl !== undefined) ||
      (l.thumbnailUrl !== undefined && (!string(l.thumbnailUrl, 200) || !isResourceFileUrl(l.thumbnailUrl as string))) ||
      (l.starterCode !== undefined && (format !== "code-tutorial" || !string(l.starterCode, 20000, 0))) ||
      (l.language !== undefined && (format !== "code-tutorial" || (l.language !== "python" && l.language !== "javascript"))) ||
      (l.requiresSubmission !== undefined && typeof l.requiresSubmission !== "boolean") ||
      (l.published !== undefined && typeof l.published !== "boolean") ||
      (l.publishAt !== undefined && (!string(l.publishAt, 40) || Number.isNaN(Date.parse(l.publishAt as string)))) ||
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
  let modules: CourseModule[] | undefined;
  if (c.modules !== undefined) {
    if (!Array.isArray(c.modules) || c.modules.length > MAX_MODULES || c.modules.some((m) =>
      !m || typeof m !== "object" || Array.isArray(m) || Object.keys(m).some((k) => k !== "title" && k !== "description") ||
      !string((m as Record<string, unknown>).title, 200) ||
      ((m as Record<string, unknown>).description !== undefined && !string((m as Record<string, unknown>).description, 2000, 0)))) {
      return { ok: false, error: "Invalid course modules." };
    }
    modules = readModules(c.modules);
  }
  const { universityId: _ignored, modules: _rawModules, ...rest } = c;
  void _ignored; void _rawModules;
  return { ok: true, course: { ...rest, lessons: normalizedLessons, ...(modules !== undefined ? { modules } : {}) } as unknown as Course };
}

export async function replaceCourse(
  course: Course,
  ownerId: number | null,
  preserveOwner = false,
  createOnly = false,
  /** The university a new course belongs to; null makes it a platform course. Ignored when replacing one. */
  universityId: number | null = null
) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      createOnly
        ? `INSERT INTO courses (slug,title,tagline,category,level,tags,cover,added_at,base_assessment,owner_user_id,published,university_id)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)`
        : `INSERT INTO courses (slug,title,tagline,category,level,tags,cover,added_at,base_assessment,owner_user_id,published)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)
       ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title,tagline=EXCLUDED.tagline,category=EXCLUDED.category,
       level=EXCLUDED.level,tags=EXCLUDED.tags,cover=EXCLUDED.cover,added_at=EXCLUDED.added_at,
       base_assessment=EXCLUDED.base_assessment,published=EXCLUDED.published,
       owner_user_id=CASE WHEN $12 THEN courses.owner_user_id ELSE EXCLUDED.owner_user_id END`,
      [course.slug, course.title, course.tagline, course.category, course.level, JSON.stringify(course.tags), course.cover,
        course.addedAt, course.baseAssessment ?? null, ownerId, course.published ?? false, createOnly ? universityId : preserveOwner]);
    if (ownerId !== null) await assertResourceFileOwnership(client, course, ownerId);
    await saveModules(client, course);
    await client.query("DELETE FROM course_lessons WHERE course_slug=$1", [course.slug]);
    for (let i = 0; i < course.lessons.length; i++) {
      const l = course.lessons[i];
      await client.query(`INSERT INTO course_lessons (id,course_slug,title,description,youtube_id,duration_min,resources,key_takeaways,assignment,section,format,position,requires_submission,body,body_file_url,starter_code,language,assignment_marks,assignment_due_date,published,publish_at,assignment_ai,thumbnail_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23)`,
      [l.id, course.slug, l.title, l.description, l.youtubeId, l.durationMin, JSON.stringify(l.resources), JSON.stringify(l.keyTakeaways), l.assignment ?? null, l.section ?? null, l.format ?? "video", i, l.requiresSubmission ?? false, l.body ?? null, l.bodyFileUrl ?? null, l.starterCode ?? null, l.language ?? null, l.assignmentMarks ?? null, l.assignmentDueDate ?? null, l.published ?? true, l.published !== false && l.publishAt ? new Date(l.publishAt).toISOString() : null, l.assignmentAi ? JSON.stringify(l.assignmentAi) : null, l.thumbnailUrl ?? null]);

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
export async function updateOwnedCourse(course: Course, userId: number, manager: ScopeUser): Promise<UpdateCourseResult> {
  const reach = manageReach(manager);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query<{ revision: number }>(
      `SELECT revision FROM courses c WHERE slug=$1 AND (owner_user_id=$2 OR ${manageSql("c", 3, 4)}) FOR UPDATE`,
      [course.slug, userId, ...reachParams(reach)]
    );
    if (!lock.rows[0]) { await client.query("ROLLBACK"); return "not-found-or-forbidden"; }
    if (lock.rows[0].revision !== course.revision) { await client.query("ROLLBACK"); return "stale"; }
    await assertResourceFileOwnership(client, course, userId, reach.all || reach.universityId !== null);
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
    await saveModules(client, course);
    await client.query("DELETE FROM course_lessons WHERE course_slug=$1", [course.slug]);
    for (let i = 0; i < course.lessons.length; i++) {
      const l = course.lessons[i];
      await client.query(`INSERT INTO course_lessons (id,course_slug,title,description,youtube_id,duration_min,resources,key_takeaways,assignment,section,format,position,requires_submission,body,body_file_url,starter_code,language,assignment_marks,assignment_due_date,published,publish_at,assignment_ai,thumbnail_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23)`,
      [l.id, course.slug, l.title, l.description, l.youtubeId, l.durationMin, JSON.stringify(l.resources), JSON.stringify(l.keyTakeaways), l.assignment ?? null, l.section ?? null, l.format ?? "video", i, l.requiresSubmission ?? false, l.body ?? null, l.bodyFileUrl ?? null, l.starterCode ?? null, l.language ?? null, l.assignmentMarks ?? null, l.assignmentDueDate ?? null, l.published ?? true, l.published !== false && l.publishAt ? new Date(l.publishAt).toISOString() : null, l.assignmentAi ? JSON.stringify(l.assignmentAi) : null, l.thumbnailUrl ?? null]);
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
export async function deleteOwnedCourse(slug: string, userId: number, manager: ScopeUser): Promise<boolean> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT slug FROM courses c WHERE slug=$1 AND (owner_user_id=$2 OR ${manageSql("c", 3, 4)}) FOR UPDATE`,
      [slug, userId, ...reachParams(manageReach(manager))]
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
  /** The course's university; null for a platform course. */
  universityId: number | null;
  /** Course and lesson are both published and any scheduled launch has passed, i.e. learners can see it. */
  visibleToLearners: boolean;
};

const lessonIdPattern = /^[a-z0-9-]{3,120}$/i;

/**
 * Resolves a lesson against the live, DB-backed catalog — unlike
 * src/lib/ai/personalized-learning.ts's findTrustedLesson (which only searches the
 * static launch-time seed array), this also finds lessons in courses a
 * tutor created after launch. This is for ownership/ID resolution, where
 * every course must work, not just the four seed ones. Callers that need
 * lesson content as AI prompt input should use findLessonForAi instead, which
 * only admits published courses and lessons, and flags tutor-authored text as untrusted.
 */
export async function findLessonLocation(lessonId: unknown): Promise<LessonLocation | null> {
  if (typeof lessonId !== "string" || !lessonIdPattern.test(lessonId)) return null;
  const { rows } = await db.query<{
    id: string; title: string; requires_submission: boolean;
    course_slug: string; course_title: string; owner_user_id: number | null; university_id: number | null; visible: boolean;
  }>(
    `SELECT l.id, l.title, l.requires_submission, c.slug AS course_slug, c.title AS course_title, c.owner_user_id, c.university_id,
            (c.published AND l.published AND (l.publish_at IS NULL OR l.publish_at <= NOW())) AS visible
     FROM course_lessons l JOIN courses c ON c.slug = l.course_slug
     WHERE l.id = $1`,
    [lessonId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    lessonId: row.id, lessonTitle: row.title, requiresSubmission: row.requires_submission,
    courseSlug: row.course_slug, courseTitle: row.course_title, ownerUserId: row.owner_user_id, universityId: row.university_id ?? null,
    visibleToLearners: Boolean(row.visible),
  };
}
export type TutorAssignment =
  | { ok: true; changed: boolean; course: { slug: string; title: string }; tutor: { id: number; name: string | null; email: string } | null }
  | { ok: false; status: 400 | 404; error: string };

/**
 * Super admin: make `tutorId` the course's tutor (its owner), or leave it with
 * no tutor (null). The tutor must be a tutor and, for a university's course,
 * belong to that university. Lesson files uploaded by the previous tutor move
 * with the course, so the new tutor can keep editing it.
 */
export async function assignCourseTutor(slug: string, tutorId: number | null): Promise<TutorAssignment> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows: courses } = await client.query<{ title: string; owner_user_id: number | null; university_id: number | null }>(
      "SELECT title, owner_user_id, university_id FROM courses WHERE slug = $1 FOR UPDATE",
      [slug]
    );
    const current = courses[0];
    if (!current) { await client.query("ROLLBACK"); return { ok: false, status: 404, error: "Course not found." }; }

    let tutor: { id: number; name: string | null; email: string } | null = null;
    if (tutorId !== null) {
      const { rows } = await client.query<{ id: number; name: string | null; email: string; role: string; university_id: number | null; university_status: string | null }>(
        "SELECT id, name, email, role, university_id, university_status FROM users WHERE id = $1",
        [tutorId]
      );
      const found = rows[0];
      if (!found || found.role !== "tutor") { await client.query("ROLLBACK"); return { ok: false, status: 400, error: "Pick a tutor account." }; }
      if (current.university_id !== null && (found.university_id !== current.university_id || found.university_status !== "active")) {
        await client.query("ROLLBACK");
        return { ok: false, status: 400, error: "That tutor isn't at this course's university." };
      }
      tutor = { id: found.id, name: found.name, email: found.email };
    }

    const changed = current.owner_user_id !== tutorId;
    if (changed) {
      await client.query("UPDATE courses SET owner_user_id = $2, updated_at = NOW() WHERE slug = $1", [slug, tutorId]);
      if (tutorId !== null && current.owner_user_id !== null) {
        const { rows: lessons } = await client.query<{ body_file_url: string | null; thumbnail_url: string | null; resources: { url?: string }[] | null }>(
          "SELECT body_file_url, thumbnail_url, resources FROM course_lessons WHERE course_slug = $1",
          [slug]
        );
        const ids = [...new Set(lessons.flatMap((l) => [l.body_file_url ?? "", l.thumbnail_url ?? "", ...(l.resources ?? []).map((r) => r?.url ?? "")])
          .filter(isResourceFileUrl).map((url) => url.slice("/api/resources/".length)))];
        if (ids.length) {
          await client.query(
            "UPDATE resource_files SET owner_user_id = $1 WHERE owner_user_id = $2 AND id = ANY($3::text[])",
            [tutorId, current.owner_user_id, ids]
          );
        }
      }
    }
    await client.query("COMMIT");
    return { ok: true, changed, course: { slug, title: current.title }, tutor };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
