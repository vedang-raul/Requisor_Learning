export interface Resource {
  label: string;
  url: string;
  type: "pdf" | "link";
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  /** YouTube video ID, or "REPLACE_ME" placeholder until admin pastes a URL. */
  youtubeId: string;
  durationMin: number;
  resources: Resource[];
  keyTakeaways: string[];
  assignment?: string;
  /** When true, the assignment isn't just an AI practice prompt — the lesson
   *  page shows an upload widget and learners must submit a file for it. */
  requiresSubmission?: boolean;
  /** Optional sub-part / module name used to group lessons on the course page. */
  section?: string;
  /** "reading" lessons are article/tool links with no video by design — not a video pending upload. Defaults to "video". */
  format?: "video" | "reading";
}

/**
 * Free-form: a tutor/admin can add a new category from the course editor,
 * not just pick one of the four the platform launched with. Those four
 * ("product" | "data" | "ai" | "security") keep their specific icon/label/
 * color — see components/category-icon.tsx — anything else gets a generic
 * fallback rather than being rejected.
 */
export type CategoryKey = string;

export interface Course {
  slug: string;
  title: string;
  tagline: string;
  category: CategoryKey;
  level: "Beginner" | "Intermediate" | "Advanced";
  tags: string[];
  /** Tailwind gradient classes for the cover. */
  cover: string;
  addedAt: string; // ISO date
  /** Monotonic catalog revision, supplied by the server for optimistic edits. */
  revision?: number;
  lessons: Lesson[];
  /** Base capstone assessment brief, personalised by AI on the course overview page. */
  baseAssessment?: string;
  /** Server-derived from owner_user_id — never write this, it's ignored on save. Null when unowned. */
  tutorName?: string | null;
  /** Drafts are hidden from the general catalog. Undefined (e.g. static seed
   *  data never sent through the DB) is treated as published — only an
   *  explicit `false` hides a course. */
  published?: boolean;
}

export interface LessonProgress {
  completed: boolean;
  watchPct: number;
  completedAt?: string;
}

export interface ViewEvent {
  courseSlug: string;
  lessonId: string;
  at: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  kind: "course" | "assignment" | "badge" | "announcement";
  /** Where clicking the notification should navigate — only set on
   *  server-sourced notifications (see AppState.serverNotifications). */
  link?: string | null;
}

export interface EarnedBadge {
  id: string;
  courseSlug: string;
  courseTitle: string;
  earnedAt: string;
}

export interface Review {
  id: string;
  courseSlug: string;
  userEmail: string;
  userName: string;
  rating: number; // 1-5
  comment: string;
  at: string; // ISO date
}

export interface UserState {
  id: number;
  name: string;
  email: string;
  role: "employee" | "tutor" | "admin";
}

export interface AppState {
  user: UserState | null;
  courses: Course[];
  progress: Record<string, LessonProgress>;
  history: ViewEvent[];
  bookmarks: string[]; // course slugs
  savedLessons: string[]; // lesson ids
  notes: Record<string, string>; // lessonId -> note text
  xp: number;
  notifications: Notification[];
  /** Real, DB-backed notifications (e.g. "a learner submitted an
   *  assignment") — fetched fresh every session, deliberately excluded
   *  from the localStorage snapshot that `notifications` round-trips
   *  through so it never goes stale or duplicates across hydrations. */
  serverNotifications: Notification[];
  sidebarCollapsed: boolean;
  /** Course slugs whose capstone assessment the learner has marked complete. */
  assessmentCompletions: string[];
}
