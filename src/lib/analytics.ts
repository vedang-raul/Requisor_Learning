type AnalyticsData = Record<string, string | number | boolean>;

const numericProperties = new Set([
  "lesson_number", "lesson_count", "score", "total", "percent",
  "message_length", "response_length", "duration_ms", "field_count", "written_count",
]);
const booleanProperties = new Set([
  "completed", "course_completed", "success", "muted", "published",
]);
const categories: Record<string, readonly string[]> = {
  role: ["learner", "tutor", "admin"],
  mode: ["learner", "tutor"],
  source: ["manual", "video_end"],
  action: ["create", "update"],
  provider: ["heygen", "elevenlabs"],
  gender: ["male", "female"],
  field: ["title", "description", "durationMin", "section", "body", "assignment", "guardrails", "takeaways", "multiple"],
};
const publicCourses = new Set(["product-management", "data-analytics", "agentic-ai", "cyber-security"]);

/** Only approved dimensions leave the browser; never send identifiers or content. */
function safeProperties(data: AnalyticsData): AnalyticsData {
  const safe: AnalyticsData = {};
  for (const [key, value] of Object.entries(data)) {
    if (numericProperties.has(key) && typeof value === "number" && Number.isFinite(value) && value >= 0) {
      safe[key] = value;
    } else if (booleanProperties.has(key) && typeof value === "boolean") {
      safe[key] = value;
    } else if (typeof value === "string") {
      if (Object.prototype.hasOwnProperty.call(categories, key) && categories[key].includes(value)) safe[key] = value;
      else if (key === "language" && /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(value)) safe[key] = value;
      // Custom course slugs can contain tutor-written titles or names.
      else if (key === "course_slug") safe[key] = publicCourses.has(value) ? value : "custom";
    }
  }
  return safe;
}

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void | Promise<unknown>;
    };
  }
}

/**
 * Best-effort custom analytics. Replit injects Umami only in published apps
 * with analytics enabled, so this safely does nothing in development.
 */
export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === "undefined" || !/^[a-z][a-z0-9_]{0,48}$/.test(name)) return;

  try {
    const result = window.umami?.track(name, data ? safeProperties(data) : undefined);
    void Promise.resolve(result).catch(() => {
      // A blocked tracker may also reject asynchronously.
    });
  } catch {
    // Analytics must never interrupt the product experience.
  }
}