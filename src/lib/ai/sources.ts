/**
 * Shared types and utilities for AI source citations across all features.
 *
 * Tier 1 (chatbot, lesson-ai, course-draft, program-builder): real web URLs
 * from xAI web search annotations, plus internal lesson/course references.
 *
 * Tier 2 (assignment, teleprompter): labelled chips showing which internal
 * data the AI drew from (learner profile, transcript, etc.) — no web URLs.
 */

export type AiSource =
  | { type: "url"; url: string; title: string; snippet?: string }
  | { type: "lesson"; courseName: string; lessonTitle: string; section?: string }
  | { type: "course"; slug: string; title: string }
  | { type: "context"; label: string };

/**
 * Strips {{lesson|Course Name|Lesson Name}} and {{course|slug|Course Title}}
 * source tags from the end of a chat reply, returning clean text and typed
 * AiSource objects. The model is instructed to place these at the end only,
 * so we scan from the last "Source:" line backwards.
 */
export function parseSourceTags(text: string): { clean: string; sources: AiSource[] } {
  const sources: AiSource[] = [];
  // Find the last "Source:" marker
  const sourceIndex = text.lastIndexOf("\nSource:");
  if (sourceIndex === -1) return { clean: text, sources };

  const tagSection = text.slice(sourceIndex);
  const lessonPattern = /\{\{lesson\|([^|{}]+)\|([^|{}]+)(?:\|([^|{}]+))?\}\}/g;
  const coursePattern = /\{\{course\|([^|{}]+)\|([^|{}]+)\}\}/g;

  let match: RegExpExecArray | null;
  while ((match = lessonPattern.exec(tagSection)) !== null) {
    const section = match[3]?.trim() || undefined;
    sources.push({ type: "lesson", courseName: match[1].trim(), lessonTitle: match[2].trim(), ...(section ? { section } : {}) });
  }
  while ((match = coursePattern.exec(tagSection)) !== null) {
    sources.push({ type: "course", slug: match[1].trim(), title: match[2].trim() });
  }

  if (sources.length === 0) return { clean: text, sources };
  return { clean: text.slice(0, sourceIndex).trimEnd(), sources };
}

/**
 * Converts xAI Responses API url_citation annotations to AiSource[].
 * Deduplicates by URL. When rawText is provided, extracts the sentence the
 * model wrote at the cited character range as a snippet.
 */
export function citationsToSources(
  annotations: { type: string; url?: string; title?: string; start_index?: number; end_index?: number }[],
  rawText?: string
): AiSource[] {
  const seen = new Set<string>();
  const sources: AiSource[] = [];
  for (const a of annotations) {
    if (a.type !== "url_citation" || !a.url) continue;
    if (seen.has(a.url)) continue;
    seen.add(a.url);
    let title = a.title ?? "";
    if (!title || /^\d+$/.test(title)) {
      try {
        title = new URL(a.url).hostname.replace(/^www\./, "");
      } catch {
        title = a.url.slice(0, 60);
      }
    }
    let snippet: string | undefined;
    if (rawText && typeof a.start_index === "number" && typeof a.end_index === "number") {
      const raw = rawText.slice(a.start_index, a.end_index);
      // Strip JSON punctuation (quotes, colons, braces, key names) and collapse whitespace
      const cleaned = raw
        .replace(/^[\s\S]*?"[^"]+"\s*:\s*"?/, "")  // strip leading key: "
        .replace(/["\{\}\[\]\\]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned.length > 10) snippet = cleaned.length > 180 ? cleaned.slice(0, 177) + "…" : cleaned;
    }
    sources.push({ type: "url", url: a.url, title, ...(snippet ? { snippet } : {}) });
  }
  return sources;
}

/** Maps the string labels lesson-ai returns to typed AiSource context chips. */
export function labelledSourcesToAiSources(labels: string[]): AiSource[] {
  return labels.map((label) => ({ type: "context" as const, label }));
}

/**
 * Builds context source chips from the fields that were non-empty when
 * generating a teleprompter script.
 */
export function teleprompterSources(opts: {
  hasTitle: boolean;
  hasDescription: boolean;
  hasCourseTitle: boolean;
  hasSection: boolean;
  hasNotes: boolean;
}): AiSource[] {
  const sources: AiSource[] = [];
  if (opts.hasTitle) sources.push({ type: "context", label: "Lesson title" });
  if (opts.hasDescription) sources.push({ type: "context", label: "Lesson description" });
  if (opts.hasCourseTitle) sources.push({ type: "context", label: "Course name" });
  if (opts.hasSection) sources.push({ type: "context", label: "Module / section" });
  if (opts.hasNotes) sources.push({ type: "context", label: "Tutor notes" });
  return sources;
}

/**
 * Converts the assignment's tailoredTo record (computed server-side from real
 * DB data) into labelled context chips.
 */
export function tailoredToSources(tailoredTo: Record<string, unknown>): AiSource[] {
  const LABEL_MAP: Record<string, string> = {
    position: "Job role",
    qualification: "Qualification",
    learningGoal: "Learning goal",
    lessonTitle: "Lesson",
    quizScore: "Quiz score",
    country: "Location",
  };
  return Object.entries(tailoredTo)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k]) => ({ type: "context" as const, label: LABEL_MAP[k] ?? k }));
}
