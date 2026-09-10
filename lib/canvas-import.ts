/**
 * Parses a real Canvas LMS course export package (.imscc — see
 * https://community.instructure.com/en/kb/articles/660728) into this app's
 * CourseExportPayload shape, so it can go through the same
 * buildCourseFromImport() pipeline as a native Requisor export.
 *
 * A Canvas cartridge is a ZIP (see lib/browser-zip.ts) containing:
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
 * Requisor has no equivalent for quizzes (Canvas's QTI-based quiz engine is
 * unrelated to Requisor's own AI-generated quiz feature), discussion
 * boards, a file library, or hidden/instructor-only modules — those items
 * are skipped and counted in the returned summary rather than silently
 * dropped. Every imported lesson is "reading" format with no video, since
 * nothing in a Canvas page/assignment maps to Requisor's single-video
 * lesson field.
 */

import { listZipEntries, readZipTextEntry, ZipParseError, type ZipEntry } from "@/lib/browser-zip";
import { COURSE_EXPORT_FORMAT, type CourseExportPayload, type CourseExportLesson } from "@/lib/course-export";

export class CanvasImportError extends Error {}

export interface CanvasImportSummary {
  courseTitle: string;
  lessonCount: number;
  skippedItems: { title: string; reason: string }[];
  rubricsFound: { title: string; criteriaCount: number; totalPoints: number }[];
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
  "Quizzes::Quiz": "Canvas quiz — no equivalent in Requisor",
  DiscussionTopic: "Discussion board — no equivalent in Requisor",
  Attachment: "File attachment — not imported",
  ContextModuleSubHeader: "Section header, no content",
};

function parseXml(xml: string, errorContext: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
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

/** Detached-div HTML → readable plain text: real tag/entity handling via the
 *  browser's own HTML parser, with paragraph breaks preserved for block
 *  elements — far more robust than a regex tag-stripper, and safe (the div
 *  is never attached to the document, so nothing in the HTML executes). */
function htmlToText(html: string): string {
  if (!html.trim() || typeof document === "undefined") return "";
  const container = document.createElement("div");
  container.innerHTML = html;
  const blockTags = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "TR"]);
  const lines: string[] = [];
  let current = "";
  const walk = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) { current += node.textContent ?? ""; return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
    if (el.tagName === "BR") { current += "\n"; return; }
    for (const child of Array.from(el.childNodes)) walk(child);
    if (blockTags.has(el.tagName)) { lines.push(current.trim()); current = ""; }
  };
  for (const child of Array.from(container.childNodes)) walk(child);
  if (current.trim()) lines.push(current.trim());
  return lines.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

const YOUTUBE_ID_PATTERN = /^https:\/\/(?:www\.)?(?:youtu\.be\/([a-zA-Z0-9_-]{6,})|youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,}))/i;

/** Pulls https:// links out of the same HTML as Requisor lesson resources —
 *  except a youtu.be/youtube.com link, which is pulled out separately as
 *  the lesson's video rather than a generic resource. This specifically
 *  closes the loop with lib/canvas-export.ts's own "Watch the lesson
 *  video" link: a Requisor video lesson exported to .imscc and re-imported
 *  gets its video back, not just a link to it, since both ends of that
 *  round trip are this app's own code. */
function extractLinksAndVideo(html: string): { resources: CourseExportLesson["resources"]; youtubeId: string | null } {
  if (!html.trim() || typeof document === "undefined") return { resources: [], youtubeId: null };
  const container = document.createElement("div");
  container.innerHTML = html;
  const seen = new Set<string>();
  const resources: CourseExportLesson["resources"] = [];
  let youtubeId: string | null = null;
  for (const a of Array.from(container.querySelectorAll("a[href]"))) {
    const url = a.getAttribute("href")?.trim() ?? "";
    if (!/^https:\/\//i.test(url) || seen.has(url)) continue;
    const videoMatch = YOUTUBE_ID_PATTERN.exec(url);
    if (videoMatch && !youtubeId) { youtubeId = videoMatch[1] ?? videoMatch[2]; seen.add(url); continue; }
    const label = (a.textContent || url).trim().slice(0, 200);
    if (!label) continue;
    seen.add(url);
    resources.push({ label, url, type: "link" });
    if (resources.length >= MAX_RESOURCES_PER_LESSON) break;
  }
  return { resources, youtubeId };
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

export async function parseCanvasCartridge(fileBytes: ArrayBuffer): Promise<CanvasImportResult> {
  let entries: ZipEntry[];
  try {
    entries = listZipEntries(fileBytes);
  } catch (error) {
    throw new CanvasImportError(error instanceof ZipParseError ? error.message : "Couldn't read this file as a Canvas export package.");
  }

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
      const text = htmlToText(html);
      const { resources: lessonResources, youtubeId } = extractLinksAndVideo(html);

      const lesson: CourseExportLesson = {
        title: item.title.slice(0, 200),
        description: (text || "Imported from Canvas — see the assignment brief for full details.").slice(0, MAX_LESSON_DESCRIPTION),
        youtubeId: youtubeId ?? "",
        durationMin: 20,
        resources: lessonResources,
        keyTakeaways: [],
        section: mod.title.slice(0, 200),
        format: youtubeId ? "video" : "reading",
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
      tags: [courseTitle.slice(0, 80)],
    },
    lessons,
  };

  return {
    payload,
    summary: { courseTitle, lessonCount: lessons.length, skippedItems, rubricsFound },
  };
}
