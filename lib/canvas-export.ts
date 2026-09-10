/**
 * Builds a real Canvas-compatible course export package (.imscc) from a
 * Requisor course — the write-side counterpart to lib/canvas-import.ts.
 * Produces the same file layout confirmed against a genuine Canvas export
 * (see lib/canvas-import.ts's header comment): imsmanifest.xml,
 * course_settings/{course_settings,module_meta,rubrics}.xml, and one HTML
 * (+ assignment_settings.xml for graded lessons) per lesson.
 *
 * This isn't a full Canvas Common Cartridge implementation — no quizzes,
 * discussions, or file attachments, since Requisor has no equivalent
 * content to emit for those — but it uses the same tags, structure, and
 * schema namespaces Canvas itself writes, so the result round-trips
 * through this app's own Canvas importer AND should open in Canvas's
 * "Import Course Content" tool as a Common Cartridge / assignments+pages
 * course.
 */

import { createZip, type ZipInputEntry } from "@/lib/zip-writer";
import type { Course, Lesson } from "@/lib/types";

export interface CanvasExportRubric {
  lessonId: string;
  criteria: { title: string; description: string | null; maxPoints: number }[];
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function textToHtmlBody(text: string): string {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return "";
  return paragraphs.map((p) => `<p>${escapeXml(p).replace(/\n/g, "<br/>")}</p>`).join("\n");
}

function lessonHtml(title: string, lesson: Lesson): string {
  const parts = [textToHtmlBody(lesson.description)];
  if (lesson.assignment) {
    parts.push(`<h2>Assignment</h2>`, textToHtmlBody(lesson.assignment));
  }
  if (lesson.keyTakeaways.length) {
    parts.push(`<h2>Key takeaways</h2>`, `<ul>${lesson.keyTakeaways.map((k) => `<li>${escapeXml(k)}</li>`).join("")}</ul>`);
  }
  if (lesson.resources.length) {
    parts.push(`<h2>Resources</h2>`, `<ul>${lesson.resources.map((r) => `<li><a href="${escapeXml(r.url)}">${escapeXml(r.label)}</a></li>`).join("")}</ul>`);
  }
  if (lesson.youtubeId && lesson.youtubeId !== "REPLACE_ME") {
    parts.push(`<p><a href="https://youtu.be/${escapeXml(lesson.youtubeId)}">Watch the lesson video</a></p>`);
  }
  return `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><title>${escapeXml(title)}</title></head><body>\n${parts.filter(Boolean).join("\n")}\n</body></html>`;
}

function shortId(prefix: string, seed: string): string {
  // Stable per lesson/course (not random) so repeated exports of the same
  // course produce the same identifiers, matching Canvas's own convention
  // of persistent per-item ids across re-exports.
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `${prefix}${hash.toString(16).padStart(8, "0")}`;
}

interface LessonGroup {
  section: string;
  lessons: Lesson[];
}

function groupBySection(lessons: Lesson[]): LessonGroup[] {
  const groups: LessonGroup[] = [];
  for (const lesson of lessons) {
    const section = lesson.section?.trim() || "Lessons";
    const existing = groups.find((g) => g.section === section);
    if (existing) existing.lessons.push(lesson);
    else groups.push({ section, lessons: [lesson] });
  }
  return groups;
}

function buildManifest(course: Course, groups: LessonGroup[]): string {
  const orgItems = groups.map((group, gi) => {
    const moduleId = shortId("mod", `${course.slug}-${gi}`);
    const itemsXml = group.lessons.map((lesson, li) => {
      const itemId = shortId("modi", `${lesson.id}-item`);
      const resId = shortId("res", lesson.id);
      return `      <item identifier="${itemId}" identifierref="${resId}"><title>${escapeXml(lesson.title)}</title></item>`;
    }).join("\n");
    return `    <item identifier="${moduleId}"><title>${escapeXml(group.section)}</title>\n${itemsXml}\n    </item>`;
  }).join("\n");

  const resources = groups.flatMap((group) => group.lessons).map((lesson) => {
    const resId = shortId("res", lesson.id);
    const slug = lesson.id;
    if (lesson.requiresSubmission) {
      return `    <resource identifier="${resId}" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="${slug}/index.html">
      <file href="${slug}/index.html"/>
      <file href="${slug}/assignment_settings.xml"/>
    </resource>`;
    }
    return `    <resource identifier="${resId}" type="webcontent" href="wiki_content/${slug}.html">
      <file href="wiki_content/${slug}.html"/>
    </resource>`;
  }).join("\n");

  const manifestId = shortId("g", course.slug);
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${manifestId}" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_imscp_v1p2_v1p0.xsd">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.1.0</schemaversion>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title><lomimscc:string>${escapeXml(course.title)}</lomimscc:string></lomimscc:title>
      </lomimscc:general>
    </lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="LearningModules">
${orgItems}
      </item>
    </organization>
  </organizations>
  <resources>
${resources}
  </resources>
</manifest>
`;
}

function buildModuleMeta(course: Course, groups: LessonGroup[]): string {
  const modulesXml = groups.map((group, gi) => {
    const moduleId = shortId("mod", `${course.slug}-${gi}`);
    const itemsXml = group.lessons.map((lesson, li) => {
      const itemId = shortId("modi", `${lesson.id}-item`);
      const resId = shortId("res", lesson.id);
      return `      <item identifier="${itemId}">
        <content_type>${lesson.requiresSubmission ? "Assignment" : "WikiPage"}</content_type>
        <workflow_state>active</workflow_state>
        <title>${escapeXml(lesson.title)}</title>
        <identifierref>${resId}</identifierref>
        <position>${li + 1}</position>
      </item>`;
    }).join("\n");
    // Always "active" here regardless of the Requisor course's own
    // published/draft flag — that's a course-level concern (a re-import
    // always lands as a new draft anyway, see lib/course-export.ts), not a
    // per-module one. Marking modules unpublished for a draft course would
    // make lib/canvas-import.ts's own reader skip every lesson on re-import,
    // turning "export my draft" into an empty course.
    return `  <module identifier="${moduleId}">
    <title>${escapeXml(group.section)}</title>
    <workflow_state>active</workflow_state>
    <position>${gi + 1}</position>
    <items>
${itemsXml}
    </items>
  </module>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<modules xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
${modulesXml}
</modules>
`;
}

function buildCourseSettings(course: Course): string {
  const courseId = shortId("g", `${course.slug}-course`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<course identifier="${courseId}" xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <title>${escapeXml(course.title)}</title>
  <course_code>${escapeXml(course.slug)}</course_code>
  <is_public>false</is_public>
  <is_public_to_auth_users>false</is_public_to_auth_users>
  <license>private</license>
</course>
`;
}

function buildAssignmentSettings(lesson: Lesson, totalPoints: number): string {
  const assignmentId = shortId("g", `${lesson.id}-assignment`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<assignment identifier="${assignmentId}" xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <title>${escapeXml(lesson.title)}</title>
  <workflow_state>published</workflow_state>
  <points_possible>${totalPoints}</points_possible>
  <grading_type>points</grading_type>
  <submission_types>online_upload,online_text_entry</submission_types>
</assignment>
`;
}

function buildRubrics(rubrics: CanvasExportRubric[], lessonsById: Map<string, Lesson>): string | null {
  const withCriteria = rubrics.filter((r) => r.criteria.length > 0);
  if (withCriteria.length === 0) return null;
  const rubricsXml = withCriteria.map((r) => {
    const lesson = lessonsById.get(r.lessonId);
    const totalPoints = r.criteria.reduce((sum, c) => sum + c.maxPoints, 0);
    const criteriaXml = r.criteria.map((c, i) => {
      const critId = `_${i + 1}`;
      return `      <criterion>
        <criterion_id>${critId}</criterion_id>
        <points>${c.maxPoints}</points>
        <description>${escapeXml(c.title)}</description>
        ${c.description ? `<long_description>${escapeXml(c.description)}</long_description>` : ""}
      </criterion>`;
    }).join("\n");
    return `  <rubric identifier="${shortId("rub", r.lessonId)}">
    <title>${escapeXml(lesson?.title ?? "Rubric")}</title>
    <points_possible>${totalPoints}</points_possible>
    <criteria>
${criteriaXml}
    </criteria>
  </rubric>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rubrics xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
${rubricsXml}
</rubrics>
`;
}

/** Builds a complete .imscc package (as raw bytes) for one Requisor course. */
export async function buildCanvasExport(course: Course, rubrics: CanvasExportRubric[] = []): Promise<Uint8Array> {
  const groups = groupBySection(course.lessons);
  const lessonsById = new Map(course.lessons.map((l) => [l.id, l]));
  const rubricsByLesson = new Map(rubrics.map((r) => [r.lessonId, r.criteria]));

  const entries: ZipInputEntry[] = [
    { name: "imsmanifest.xml", data: buildManifest(course, groups) },
    { name: "course_settings/module_meta.xml", data: buildModuleMeta(course, groups) },
    { name: "course_settings/course_settings.xml", data: buildCourseSettings(course) },
  ];

  const rubricsXml = buildRubrics(rubrics, lessonsById);
  if (rubricsXml) entries.push({ name: "course_settings/rubrics.xml", data: rubricsXml });

  for (const lesson of course.lessons) {
    const html = lessonHtml(lesson.title, lesson);
    if (lesson.requiresSubmission) {
      const criteria = rubricsByLesson.get(lesson.id) ?? [];
      const totalPoints = criteria.length ? criteria.reduce((sum, c) => sum + c.maxPoints, 0) : 100;
      entries.push(
        { name: `${lesson.id}/index.html`, data: html },
        { name: `${lesson.id}/assignment_settings.xml`, data: buildAssignmentSettings(lesson, totalPoints) }
      );
    } else {
      entries.push({ name: `wiki_content/${lesson.id}.html`, data: html });
    }
  }

  return createZip(entries);
}
