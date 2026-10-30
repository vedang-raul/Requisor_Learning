/**
 * Parses a real Canvas LMS course export package (.imscc — see
 * https://community.instructure.com/en/kb/articles/660728) into this app's
 * CourseExportPayload shape, so it can go through the same
 * buildCourseFromImport() pipeline as a native Requisor export.
 *
 * A Canvas cartridge is a ZIP (see src/lib/files/browser-zip.ts) containing:
 *  - imsmanifest.xml: a <resources> map (id -> file paths + Canvas type string).
 *  - course_settings/module_meta.xml: the real module/item tree, with a
 *    content_type per item (Assignment, WikiPage, Quizzes::Quiz,
 *    DiscussionTopic, Attachment, ContextModuleSubHeader) and a
 *    workflow_state (published/unpublished) per module AND per item — this
 *    is what module_meta.xml is used for here instead of imsmanifest.xml's
 *    own organization tree, since it's the only place Canvas exports enough
 *    to reliably tell "hidden instructor-only module" from real content.
 *  - Per-item content: an assignment's HTML + assignment_settings.xml
 *    (title, points_possible, submission_types), or a wiki page's HTML
 *    directly under wiki_content/.
 *  - course_settings/rubrics.xml: real structured rubrics (criteria with a
 *    title + point value) — but NOT linked to a specific assignment
 *    anywhere in the export in any of the sample data this was built
 *    against, so these are surfaced as a summary for the tutor to attach
 *    manually rather than guessed at by title-matching.
 *
 * Pages and assignment briefs go through canvas-html.ts: Canvas's template
 * tables are unwrapped and the content kept as formatted Markdown. A page with
 * a YouTube video becomes a video lesson with its reading below the video;
 * other pages become reading lessons. Quizzes come in as graded quizzes (see
 * src/lib/quiz/canvas-qti.ts). Discussion boards, the file library and
 * hidden/instructor-only modules are skipped and listed in the summary.
 */

import { listZipEntries, readZipTextEntry, ZipParseError, type ZipEntry } from "@/lib/files/browser-zip";
import { COURSE_EXPORT_FORMAT, type CourseExportPayload, type CourseExportLesson } from "@/lib/courses/course-export";
import { canvasQuiz } from "@/lib/quiz/canvas-qti";
import { convertCanvasHtml, markdownText, summaryLine } from "@/lib/courses/canvas-html";

export class CanvasImportError extends Error {}

export interface CanvasImportSummary {
  courseTitle: string;
  lessonCount: number;
  skippedItems: { title: string; reason: string }[];
  rubricsFound: { title: string; criteriaCount: number; totalPoints: number }[];
  /** Canvas quizzes brought in as graded quizzes: title, questions, and any questions left out. */
  quizzes: { title: string; questions: number; points: number; skipped: string[] }[];
}

export interface CanvasImportResult {
  payload: CourseExportPayload;
  summary: CanvasImportSummary;
}

interface CanvasResource {
  type: string;
  href?: string;
  files: string[];
}

interface CanvasItem {
  contentType: string;
  workflowState: string;
  title: string;
  identifierref?: string;
}

interface CanvasModule {
  title: string;
  workflowState: string;
  items: CanvasItem[];
}

const MANIFEST_PATH = "imsmanifest.xml";
const MODULE_META_PATH = "course_settings/module_meta.xml";
const RUBRICS_PATH = "course_settings/rubrics.xml";
const MAX_LESSON_DESCRIPTION = 2000;
const MAX_LESSON_ASSIGNMENT = 5000;
const MAX_RESOURCES_PER_LESSON = 20;

const CONTENT_TYPE_LABELS: Record<string, string> = {
  DiscussionTopic: "Discussion board — no equivalent in Requisor",
  Attachment: "File attachment — not imported",
  ContextModuleSubHeader: "Section header, no content",
};

/**
 * Canvas writes some files (quiz settings) with an invalid namespace, e.g.
 * xmlns:xsi="<url> <url>", which browsers refuse to parse. The XML-schema
 * attributes carry no data, so they're dropped before parsing.
 */
export function withoutSchemaAttributes(xml: string): string {
  return xml.replace(/\s(?:xmlns:xsi|xsi:schemaLocation|xsi:noNamespaceSchemaLocation)\s*=\s*("[^"]*"|'[^']*')/g, "");
}

function parseXml(xml: string, errorContext: string): Document {
  const doc = new DOMParser().parseFromString(withoutSchemaAttributes(xml), "application/xml");
  if (doc.getElementsByTagName("parsererror")[0]) throw new CanvasImportError(`Couldn't parse ${errorContext} in this export.`);
  return doc;
}

function firstText(el: Element | Document, tag: string): string {
  return el.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
}

function parseCourseTitle(manifestDoc: Document): string {
  const general = manifestDoc.getElementsByTagName("lomimscc:general")[0];
  const title = general ? firstText(general, "lomimscc:string") : "";
  return (title || "Imported Canvas course").slice(0, 160);
}

function parseResources(manifestDoc: Document): Map<string, CanvasResource> {
  const map = new Map<string, CanvasResource>();
  for (const el of Array.from(manifestDoc.getElementsByTagName("resource"))) {
    const identifier = el.getAttribute("identifier");
    if (!identifier) continue;
    const type = el.getAttribute("type") ?? "";
    const href = el.getAttribute("href") ?? undefined;
    const files = Array.from(el.getElementsByTagName("file")).map((f) => f.getAttribute("href") ?? "").filter(Boolean);
    map.set(identifier, { type, href, files });
  }
  return map;
}

function parseModules(moduleMetaDoc: Document): CanvasModule[] {
  return Array.from(moduleMetaDoc.getElementsByTagName("module")).map((m) => ({
    title: firstText(m, "title") || "Untitled module",
    workflowState: firstText(m, "workflow_state") || "active",
    items: Array.from(m.getElementsByTagName("item")).map((it) => ({
      contentType: firstText(it, "content_type"),
      workflowState: firstText(it, "workflow_state") || "active",
      title: firstText(it, "title") || "Untitled item",
      identifierref: it.getElementsByTagName("identifierref")[0]?.textContent?.trim() || undefined,
    })),
  }));
}

function parseRubricsSummary(xml: string): CanvasImportSummary["rubricsFound"] {
  const doc = parseXml(xml, "the rubrics file");
  return Array.from(doc.getElementsByTagName("rubric")).map((r) => ({
    title: firstText(r, "title") || "Untitled rubric",
    criteriaCount: r.getElementsByTagName("criterion").length,
    totalPoints: Number(firstText(r, "points_possible")) || 0,
  }));
}

async function readXmlIfPresent(fileBytes: ArrayBuffer, path: string, entries: ZipEntry[]): Promise<Document | null> {
  const xml = await readZipTextEntry(fileBytes, path, entries);
  return xml ? parseXml(xml, path) : null;
}

interface AssignmentSettings {
  pointsPossible: number | null;
  submissionTypes: string[];
}

async function readAssignmentSettings(fileBytes: ArrayBuffer, resource: CanvasResource, entries: ZipEntry[]): Promise<AssignmentSettings> {
  const path = resource.files.find((f) => f.endsWith("assignment_settings.xml"));
  const doc = path ? await readXmlIfPresent(fileBytes, path, entries) : null;
  if (!doc) return { pointsPossible: null, submissionTypes: [] };
  const points = firstText(doc, "points_possible");
  const types = firstText(doc, "submission_types");
  return {
    pointsPossible: points ? Number(points) : null,
    submissionTypes: types ? types.split(",").map((t) => t.trim()) : [],
  };
}

async function readItemHtml(fileBytes: ArrayBuffer, resource: CanvasResource, entries: ZipEntry[]): Promise<string> {
  const htmlPath = resource.files.find((f) => f.endsWith(".html")) ?? resource.href;
  if (!htmlPath) return "";
  return (await readZipTextEntry(fileBytes, htmlPath, entries)) ?? "";
}

/**
 * An export that was unzipped and zipped again keeps everything under one
 * folder ("course-export/imsmanifest.xml"). Read it from inside that folder.
 * Entries are found by their offset, not their name, so renaming is safe.
 */
export function unwrapSingleFolder(entries: ZipEntry[]): ZipEntry[] {
  if (entries.some((e) => e.name === MANIFEST_PATH)) return entries;
  const nested = entries.filter((e) => /^[^/]+\/imsmanifest\.xml$/.test(e.name));
  if (nested.length !== 1) return entries;
  const prefix = nested[0].name.slice(0, -MANIFEST_PATH.length);
  return entries.filter((e) => e.name.startsWith(prefix) && e.name.length > prefix.length)
    .map((e) => ({ ...e, name: e.name.slice(prefix.length) }));
}

export async function parseCanvasCartridge(fileBytes: ArrayBuffer): Promise<CanvasImportResult> {
  let entries: ZipEntry[];
  try {
    entries = listZipEntries(fileBytes);
  } catch (error) {
    throw new CanvasImportError(error instanceof ZipParseError ? error.message : "Couldn't read this file as a Canvas export package.");
  }
  entries = unwrapSingleFolder(entries);

  const manifestXml = await readZipTextEntry(fileBytes, MANIFEST_PATH, entries);
  if (!manifestXml) throw new CanvasImportError("This doesn't look like a Canvas course export — imsmanifest.xml is missing.");
  const manifestDoc = parseXml(manifestXml, "the course manifest");
  const courseTitle = parseCourseTitle(manifestDoc);
  const resources = parseResources(manifestDoc);

  const moduleMetaDoc = await readXmlIfPresent(fileBytes, MODULE_META_PATH, entries);
  const modules = moduleMetaDoc ? parseModules(moduleMetaDoc) : [];

  const rubricsXml = await readZipTextEntry(fileBytes, RUBRICS_PATH, entries);
  const rubricsFound = rubricsXml ? parseRubricsSummary(rubricsXml) : [];

  const lessons: CourseExportLesson[] = [];
  const skippedItems: CanvasImportSummary["skippedItems"] = [];
  const quizzes: CanvasImportSummary["quizzes"] = [];

  for (const mod of modules) {
    if (mod.workflowState === "unpublished") {
      skippedItems.push({ title: mod.title, reason: "Unpublished module (not visible to students in Canvas)" });
      continue;
    }
    for (const item of mod.items) {
      if (item.workflowState === "unpublished") {
        skippedItems.push({ title: item.title, reason: "Unpublished item" });
        continue;
      }
      if (item.contentType === "Quizzes::Quiz") {
        const resource = item.identifierref ? resources.get(item.identifierref) : undefined;
        const qtiXml = item.identifierref ? await readZipTextEntry(fileBytes, `non_cc_assessments/${item.identifierref}.xml.qti`, entries) : null;
        if (!resource || !qtiXml) { skippedItems.push({ title: item.title, reason: "The quiz's questions are missing from the export" }); continue; }
        const metaXml = await readZipTextEntry(fileBytes, `${item.identifierref}/assessment_meta.xml`, entries);
        const quiz = canvasQuiz(parseXml(qtiXml, "a quiz"), metaXml ? parseXml(metaXml, "quiz settings") : null);
        if (!quiz.questions.length) { skippedItems.push({ title: item.title, reason: quiz.skipped.join("; ") || "No questions to import" }); continue; }
        const count = quiz.questions.filter((q) => q.type !== "text_only").length;
        quizzes.push({ title: item.title, questions: count, points: quiz.points, skipped: quiz.skipped });
        // A quiz is its own lesson, as in Canvas: its instructions as the reading, the quiz as its assessment.
        lessons.push({
          title: item.title.slice(0, 200),
          description: (quiz.settings.instructions || `Quiz: ${count} question${count === 1 ? "" : "s"}, ${quiz.points} points.`).slice(0, MAX_LESSON_DESCRIPTION),
          youtubeId: "",
          durationMin: quiz.settings.timeLimitMin ?? Math.max(5, Math.ceil((count * 1.5) / 5) * 5),
          resources: [],
          keyTakeaways: [],
          section: mod.title.slice(0, 200),
          format: "reading",
          ...(quiz.settings.instructions ? { body: quiz.settings.instructions.slice(0, 20_000) } : {}),
          rubric: [],
          quiz: { settings: quiz.settings, questions: quiz.questions },
        });
        continue;
      }
      if (item.contentType !== "Assignment" && item.contentType !== "WikiPage") {
        if (item.contentType !== "ContextModuleSubHeader") {
          skippedItems.push({ title: item.title, reason: CONTENT_TYPE_LABELS[item.contentType] ?? `Unsupported content type (${item.contentType || "unknown"})` });
        }
        continue;
      }
      if (!item.identifierref) { skippedItems.push({ title: item.title, reason: "No content to import" }); continue; }
      const resource = resources.get(item.identifierref);
      if (!resource) { skippedItems.push({ title: item.title, reason: "Couldn't locate this item's content" }); continue; }

      const html = await readItemHtml(fileBytes, resource, entries);
      const page = convertCanvasHtml(html);
      const isAssignment = item.contentType === "Assignment";
      // The page's own title often opens the reading; the lesson title already says it.
      let body = page.body;
      const bareTitle = item.title.replace(/^\s*M\d+\s*:\s*/, "").trim().toLowerCase();
      const leadingHeading = /^\s*#+ (.+)\n+(?:---\n+)?/;
      for (let m = leadingHeading.exec(body); m && [item.title.trim().toLowerCase(), bareTitle].includes(m[1].trim().toLowerCase()); m = leadingHeading.exec(body)) {
        body = body.slice(m[0].length);
      }
      const videos = page.youtubeIds;
      const text = markdownText(body);
      // A page with a video is a video lesson with the reading below it; otherwise a reading.
      const extraVideos = videos.slice(1).map((id, i) => ({ label: (page.videoTitles[id] ? `Video: ${page.videoTitles[id]}` : `More video ${i + 1}`).slice(0, 200), url: `https://www.youtube.com/watch?v=${id}`, type: "link" as const }));
      const lessonResources = [...extraVideos, ...page.links.filter((l) => !extraVideos.some((v) => v.url === l.url)).map((l) => ({ label: l.label, url: l.url, type: "link" as const }))].slice(0, MAX_RESOURCES_PER_LESSON);
      const minutes = page.words / 200 + videos.length * 6 + (isAssignment ? 15 : 0);

      const lesson: CourseExportLesson = {
        title: item.title.slice(0, 200),
        description: (summaryLine(body) || (isAssignment ? "See the assignment brief for full details." : `Part of ${mod.title}.`)).slice(0, MAX_LESSON_DESCRIPTION),
        youtubeId: videos[0] ?? "",
        durationMin: Math.max(5, Math.min(1440, Math.ceil(minutes / 5) * 5)),
        resources: lessonResources,
        keyTakeaways: page.takeaways.slice(0, 20),
        section: mod.title.slice(0, 200),
        format: videos.length ? "video" : "reading",
        // An assignment's page is its brief (step 3); a page's reading is the lesson.
        ...(!isAssignment && body.trim() ? { body: body.slice(0, 20_000) } : {}),
        rubric: [],
      };

      if (item.contentType === "Assignment") {
        const settings = await readAssignmentSettings(fileBytes, resource, entries);
        if (text) lesson.assignment = text.slice(0, MAX_LESSON_ASSIGNMENT);
        const looksGradable = settings.submissionTypes.length > 0 && !settings.submissionTypes.includes("none") && !settings.submissionTypes.includes("not_graded");
        if (looksGradable) {
          lesson.requiresSubmission = true;
          if (settings.pointsPossible && settings.pointsPossible > 0) {
            lesson.rubric = [{ title: "Overall", description: "Imported from this assignment's Canvas point value.", maxPoints: settings.pointsPossible }];
          }
        }
      }

      lessons.push(lesson);
    }
  }

  const payload: CourseExportPayload = {
    format: COURSE_EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    sourcePlatform: "Requisor Learning",
    course: {
      title: courseTitle,
      tagline: "Imported from a Canvas course export.",
      category: "imported",
      level: "Beginner",
      tags: [courseTitle.slice(0, 50)],
    },
    lessons,
  };

  return {
    payload,
    summary: { courseTitle, lessonCount: lessons.length, skippedItems, rubricsFound, quizzes },
  };
}
