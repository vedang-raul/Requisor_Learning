import { isLessonLive } from "@/lib/utils";
import { HIDDEN_ASSIGNMENT_AI } from "@/lib/ai/assignment-ai";
import { manageReach, manageSql, newCourseUniversity, reachParams, seeReach, seeSql } from "@/lib/server/course-scope";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { CourseConflictError, ensureCourseCatalog, getCourses, replaceCourse, validateCourse } from "@/lib/courses/course-catalog";

const requestId = () => crypto.randomUUID();
const canManage = (role: unknown) => role === "admin" || role === "tutor";
export async function GET() {
  const id = requestId();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureCourseCatalog();
    // Everyone sees published platform courses and their own university's. An admin
    // also sees every course they manage, drafts included.
    const see = reachParams(seeReach(session.user));
    const courses = session.user.role === "admin"
      ? await getCourses(`WHERE (c.published = TRUE AND ${seeSql("c", 1, 2)}) OR ${manageSql("c", 3, 4)}`, [...see, ...reachParams(manageReach(session.user))])
      // Learners (and tutors browsing as learners) never receive draft lessons;
      // tutors edit their drafts through /api/tutor/courses instead.
      : (await getCourses(`WHERE c.published = TRUE AND ${seeSql("c", 1, 2)}`, see)).map((course) => ({
          ...course,
          lessons: course.lessons.filter((lesson) => isLessonLive(lesson))
            .map((lesson) => (lesson.assignmentAi ? { ...lesson, assignmentAi: HIDDEN_ASSIGNMENT_AI } : lesson)),
        }));
    return NextResponse.json({ courses });
  }
  catch (error) { console.error(JSON.stringify({ operation: "courses.get", requestId: id, error: error instanceof Error ? error.message : "unknown" })); return NextResponse.json({ error: "Unable to load courses." }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  const id = requestId(); const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = validateCourse(await readJsonBody(req, 256_000));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
    await ensureCourseCatalog();
    const exists = await getCourses("WHERE c.slug = $1", [result.course.slug]);
    if (exists.length) return NextResponse.json({ error: "Course slug already exists." }, { status: 409 });
    await replaceCourse(result.course, Number(session.user.id), false, true, newCourseUniversity(session.user));
    result.course.revision = 1;
    return NextResponse.json({ course: result.course }, { status: 201 });
  } catch (error) {
    if (error instanceof CourseConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    console.error(JSON.stringify({ operation: "courses.create", requestId: id, error: error instanceof Error ? error.message : "unknown" }));
    return NextResponse.json({ error: "Unable to create course." }, { status: 500 });
  }
}