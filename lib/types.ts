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
  /** Optional sub-part / module name used to group lessons on the course page. */
  section?: string;
  /** "reading" lessons are article/tool links with no video by design — not a video pending upload. Defaults to "video". */
  format?: "video" | "reading";
}

export type CategoryKey = "product" | "data" | "ai" | "security";

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
  sidebarCollapsed: boolean;
  /** Course slugs whose capstone assessment the learner has marked complete. */
  assessmentCompletions: string[];
}
