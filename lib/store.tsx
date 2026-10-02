"use client";
import { isLessonLive } from "@/lib/utils";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { AppState, Course, EarnedBadge, Lesson, Notification, UserState } from "./types";
import { seedCourses } from "./data";


const STORAGE_KEY_BASE = "requisor-learning-v14"; // v14: added 4 DeepLearning.AI agent-building courses to Agentic AI
// State is namespaced per signed-in user so accounts sharing a browser never see each other's data.
const storageKeyFor = (email: string) => `${STORAGE_KEY_BASE}:${email.toLowerCase()}`;
const XP_PER_LESSON = 50;
const XP_PER_COURSE = 200;
export type WorkspaceMode = "tutor" | "student";
const workspaceModeKeyFor = (email: string) => `requisor-workspace-mode:${email.toLowerCase()}`;

const initialState: AppState = {
  user: null,
  courses: seedCourses,
  progress: {},
  history: [],
  bookmarks: [],
  savedLessons: [],
  notes: {},
  xp: 0,
  notifications: [
    { id: "n1", kind: "announcement", title: "Welcome to Requisor Learning", body: "Your curated learning paths are ready. Start anywhere — progress is saved automatically.", at: new Date().toISOString(), read: false },
    { id: "n2", kind: "course", title: "New path: Agentic AI", body: "18 lessons on LLMs, agents, RAG and MCP are now available.", at: new Date().toISOString(), read: false },
  ],
  serverNotifications: [],
  sidebarCollapsed: false,
  assessmentCompletions: [],
};

interface StoreApi {
  state: AppState;
  hydrated: boolean;
  workspaceMode: WorkspaceMode;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  logout: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  recordView: (courseSlug: string, lessonId: string) => void;
  setWatchPct: (lessonId: string, pct: number) => void;
  toggleComplete: (courseSlug: string, lessonId: string) => { courseCompleted: boolean };
  toggleBookmark: (courseSlug: string) => void;
  toggleSavedLesson: (lessonId: string) => void;
  setNote: (lessonId: string, text: string) => void;
  markNotificationsRead: () => void;
  toggleAssessmentComplete: (courseSlug: string) => void;
  // Admin
  upsertCourse: (course: Course) => Promise<Course>;
  deleteCourse: (slug: string) => Promise<void>;
  upsertLesson: (courseSlug: string, lesson: Lesson, base?: Course) => Promise<Course>;
  deleteLesson: (courseSlug: string, lessonId: string, base?: Course) => Promise<Course>;
  resetAll: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [workspaceMode, setWorkspaceModeState] = useState<WorkspaceMode>("tutor");
  const { data: session, status } = useSession();
  // Tracks whether the initial DB fetch has completed so we don't sync stale values back.
  const dbSynced = useRef(false);
  // Per-lesson debounce timers for note syncing
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Real auth: the signed-in user comes from the NextAuth session, not localStorage.
  const sessionUser: UserState | null = useMemo(() => {
    if (!session?.user?.email) return null;
    return {
      id: parseInt(session.user.id, 10),
      name: session.user.name ?? session.user.email.split("@")[0],
      email: session.user.email,
       role: session.user.role === "admin" || session.user.role === "tutor" ? session.user.role : "employee",
    };
  }, [session]);

  const email = sessionUser?.email ?? null;

  // Workspace mode only changes the tutor's local view. The server session
  // role remains authoritative for permissions and AI privacy boundaries.
  useEffect(() => {
    if (!email) {
      setWorkspaceModeState("student");
      return;
    }
    if (sessionUser?.role !== "tutor") {
      setWorkspaceModeState(sessionUser?.role === "admin" ? "tutor" : "student");
      return;
    }
    try {
      const saved = sessionStorage.getItem(workspaceModeKeyFor(email));
      setWorkspaceModeState(saved === "student" ? "student" : "tutor");
    } catch {
      setWorkspaceModeState("tutor");
    }
  }, [email, sessionUser?.role]);

  const setWorkspaceMode = useCallback((mode: WorkspaceMode) => {
    if (sessionUser?.role !== "tutor") return;
    setWorkspaceModeState(mode);
    try {
      sessionStorage.setItem(workspaceModeKeyFor(sessionUser.email), mode);
    } catch {
      // Session storage can be unavailable in privacy-restricted browsers.
    }
  }, [sessionUser]);

  // Hydrate from the signed-in user's own localStorage bucket (re-runs on account switch).
  useEffect(() => {
    if (status === "loading") return;
    if (!email) {
      setState(initialState);
      setHydrated(true);
      return;
    }
    setHydrated(false);
    try {
      const raw = localStorage.getItem(storageKeyFor(email));
      const saved = raw ? (JSON.parse(raw) as Partial<AppState>) : null;
       // Courses are deliberately not restored from this browser. The
       // authenticated catalog request below is authoritative.
       setState(saved ? { ...initialState, ...saved, user: null, courses: seedCourses } : initialState);
    } catch {
      setState(initialState); // corrupted storage — start fresh
    }
    setHydrated(true);
  }, [email, status]);

  // Persist to the signed-in user's bucket only.
  // Debounced so rapid state changes (note keystrokes, XP updates) don't
  // synchronously block the main thread on every render.
  const lsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated || !email) return;
    if (lsTimer.current) clearTimeout(lsTimer.current);
    lsTimer.current = setTimeout(() => {
      try {
         const { courses: _courses, serverNotifications: _serverNotifications, ...learningState } = state;
         localStorage.setItem(storageKeyFor(email), JSON.stringify({ ...learningState, user: null }));
      } catch {
        // storage full or unavailable — non-fatal
      }
    }, 600);
    return () => {
      if (lsTimer.current) clearTimeout(lsTimer.current);
    };
  }, [state, hydrated, email]);

  // On hydration, pull authoritative data from the DB.
  // First login after this feature ships: migrate local-only notes/bookmarks to DB once,
  // then mark the migration done so DB remains the sole source of truth going forward.
  useEffect(() => {
    if (!hydrated || !email) return;
    dbSynced.current = false;

    const MIGRATION_KEY = `requisor-notes-bookmarks-migrated-v1:${email.toLowerCase()}`;
    const alreadyMigrated = localStorage.getItem(MIGRATION_KEY) === "true";

    // Snapshot local data only needed for the one-time migration.
    let localNotes: Record<string, string> = {};
    let localBookmarks: string[] = [];
    let localSavedLessons: string[] = [];
    if (!alreadyMigrated) {
      setState((s) => {
        localNotes = s.notes;
        localBookmarks = s.bookmarks;
        localSavedLessons = s.savedLessons;
        return s;
      });
    }

    Promise.all([
      fetch("/api/xp").then((r) => r.json() as Promise<{ xp?: number }>),
      fetch("/api/course-assessment").then((r) => r.json() as Promise<{ completions?: string[] }>),
      fetch("/api/notes").then((r) => r.json() as Promise<{ notes?: Record<string, string> }>),
      fetch("/api/bookmarks").then((r) => r.json() as Promise<{ bookmarks?: string[]; savedLessons?: string[] }>),
    ])
      .then(([xpData, assessData, notesData, bookmarksData]) => {
        const dbNotes = notesData.notes ?? {};
        const dbBookmarks = bookmarksData.bookmarks ?? [];
        const dbSavedLessons = bookmarksData.savedLessons ?? [];

        if (alreadyMigrated) {
          // DB is the single source of truth — overwrite local entirely, including empty notes
          // (empty means the user cleared a note on another device).
          setState((s) => ({
            ...s,
            xp: xpData.xp ?? s.xp,
            assessmentCompletions: assessData.completions ?? s.assessmentCompletions,
            notes: dbNotes,
            bookmarks: dbBookmarks,
            savedLessons: dbSavedLessons,
          }));
        } else {
          // First login after this feature shipped: union local + DB so nothing is lost,
          // then push local-only items up to DB, then mark migration done.
          setState((s) => {
            const mergedNotes = { ...dbNotes };
            // Keep local notes for lessons not yet in DB (migration only).
            for (const [lid, txt] of Object.entries(localNotes)) {
              if (txt && !(lid in dbNotes)) mergedNotes[lid] = txt;
            }
            return {
              ...s,
              xp: xpData.xp ?? s.xp,
              assessmentCompletions: assessData.completions ?? s.assessmentCompletions,
              notes: mergedNotes,
              bookmarks: [...new Set([...dbBookmarks, ...localBookmarks])],
              savedLessons: [...new Set([...dbSavedLessons, ...localSavedLessons])],
            };
          });

          // Push local-only items to DB (best-effort; idempotent inserts).
          const onlyLocalBookmarks = localBookmarks.filter((b) => !dbBookmarks.includes(b));
          const onlyLocalSavedLessons = localSavedLessons.filter((l) => !dbSavedLessons.includes(l));
          const onlyLocalNotes = Object.entries(localNotes).filter(([lid, txt]) => txt && !(lid in dbNotes));

          const migrationOps: Promise<unknown>[] = [];
          if (onlyLocalBookmarks.length || onlyLocalSavedLessons.length) {
            migrationOps.push(
              fetch("/api/bookmarks", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookmarks: onlyLocalBookmarks, savedLessons: onlyLocalSavedLessons }),
              })
            );
          }
          if (onlyLocalNotes.length) {
            migrationOps.push(
              fetch("/api/notes", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notes: Object.fromEntries(onlyLocalNotes) }),
              })
            );
          }
          // Mark migration complete only after uploads succeed (or if there was nothing to upload).
          Promise.all(migrationOps)
            .then(() => localStorage.setItem(MIGRATION_KEY, "true"))
            .catch(() => {}); // will retry on next login if migration uploads failed
        }

        dbSynced.current = true;
      })
      .catch(() => { dbSynced.current = true; });
  }, [hydrated, email]);

  // The course catalog belongs to the server.  Keep per-user local storage for
  // learning state only; it must never overwrite catalog changes made elsewhere.
  useEffect(() => {
    if (!hydrated || !email) return;
    let cancelled = false;
    fetch("/api/courses")
      .then(async (response) => {
        const data = await response.json() as { courses?: Course[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Couldn't load the course catalog.");
        if (!Array.isArray(data.courses)) throw new Error("The course catalog response was invalid.");
        return data.courses;
      })
      .then((courses) => {
        if (!cancelled) setState((current) => ({ ...current, courses }));
      })
      .catch(() => {
        // Retain the currently displayed catalog when offline. Mutations still
        // reject visibly to their caller instead of being stored locally.
      });
    return () => { cancelled = true; };
  }, [hydrated, email]);

  // Real, server-generated notifications (e.g. a tutor's "learner submitted
  // an assignment" alert) — fetched fresh every session rather than
  // persisted locally; see AppState.serverNotifications.
  useEffect(() => {
    if (!hydrated || !email) return;
    let cancelled = false;
    fetch("/api/notifications")
      .then((response) => response.json() as Promise<{ notifications?: Notification[] }>)
      .then((data) => {
        if (!cancelled) setState((current) => ({ ...current, serverNotifications: data.notifications ?? [] }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hydrated, email]);

  // Sync XP to DB whenever it changes (after the initial DB load).
  useEffect(() => {
    if (!hydrated || !email || !dbSynced.current) return;
    void fetch("/api/xp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ xp: state.xp }),
    });
  }, [state.xp, hydrated, email]);

  const logout = useCallback(() => {
    setState((s) => ({ ...s, user: null }));
    void signOut({ callbackUrl: "/" });
  }, []);

  const toggleSidebar = useCallback(() => setState((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed })), []);
  const setSidebarCollapsed = useCallback((collapsed: boolean) => setState((s) => (s.sidebarCollapsed === collapsed ? s : { ...s, sidebarCollapsed: collapsed })), []);

  const recordView = useCallback((courseSlug: string, lessonId: string) => {
    setState((s) => {
      const history = [{ courseSlug, lessonId, at: new Date().toISOString() }, ...s.history.filter((h) => h.lessonId !== lessonId)].slice(0, 50);
      return { ...s, history };
    });
  }, []);

  const setWatchPct = useCallback((lessonId: string, pct: number) => {
    setState((s) => {
      const prev = s.progress[lessonId] ?? { completed: false, watchPct: 0 };
      if (pct <= prev.watchPct) return s;
      return { ...s, progress: { ...s.progress, [lessonId]: { ...prev, watchPct: Math.min(100, pct) } } };
    });
  }, []);

  const toggleComplete = useCallback(
    (courseSlug: string, lessonId: string) => {
      let courseCompleted = false;
      setState((s) => {
        const prev = s.progress[lessonId] ?? { completed: false, watchPct: 0 };
        const nowCompleted = !prev.completed;
        const progress = {
          ...s.progress,
          [lessonId]: { ...prev, completed: nowCompleted, watchPct: nowCompleted ? 100 : prev.watchPct, completedAt: nowCompleted ? new Date().toISOString() : undefined },
        };
        let xp = s.xp + (nowCompleted ? XP_PER_LESSON : -XP_PER_LESSON);
        const course = s.courses.find((c) => c.slug === courseSlug);
        let notifications = s.notifications;
        if (course && nowCompleted) {
          const allDone = course.lessons.every((l) => progress[l.id]?.completed);
          if (allDone) {
            courseCompleted = true;
            xp += XP_PER_COURSE;
            const note: Notification = {
              id: `badge-${courseSlug}-${Date.now()}`,
              kind: "badge",
              title: `Badge earned: ${course.title} 🏆`,
              body: "Congratulations! Your completion badge is available in the Badges section.",
              at: new Date().toISOString(),
              read: false,
            };
            notifications = [note, ...notifications];
          }
        }
        return { ...s, progress, xp: Math.max(0, xp), notifications };
      });
      return { courseCompleted };
    },
    []
  );

  const toggleBookmark = useCallback((courseSlug: string) => {
    // Determine intent from current state before the optimistic update so the
    // explicit action sent to the server always matches what the user intended.
    setState((s) => {
      const adding = !s.bookmarks.includes(courseSlug);
      fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "course", slug: courseSlug, action: adding ? "add" : "remove" }),
      }).catch(() => {});
      return {
        ...s,
        bookmarks: adding ? [...s.bookmarks, courseSlug] : s.bookmarks.filter((b) => b !== courseSlug),
      };
    });
  }, []);

  const toggleSavedLesson = useCallback((lessonId: string) => {
    setState((s) => {
      const adding = !s.savedLessons.includes(lessonId);
      fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "lesson", lessonId, action: adding ? "add" : "remove" }),
      }).catch(() => {});
      return {
        ...s,
        savedLessons: adding ? [...s.savedLessons, lessonId] : s.savedLessons.filter((b) => b !== lessonId),
      };
    });
  }, []);

  const setNote = useCallback((lessonId: string, text: string) => {
    setState((s) => ({ ...s, notes: { ...s.notes, [lessonId]: text } }));
    // Debounce API sync — write to DB 800 ms after the last keystroke
    if (noteTimers.current[lessonId]) clearTimeout(noteTimers.current[lessonId]);
    noteTimers.current[lessonId] = setTimeout(() => {
      fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, content: text }),
      }).catch(() => {});
      delete noteTimers.current[lessonId];
    }, 800);
  }, []);

  const markNotificationsRead = useCallback(() => {
    setState((s) => {
      const hadUnreadServer = s.serverNotifications.some((n) => !n.read);
      if (hadUnreadServer) void fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
      return {
        ...s,
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
        serverNotifications: s.serverNotifications.map((n) => ({ ...n, read: true })),
      };
    });
  }, []);

  const toggleAssessmentComplete = useCallback((courseSlug: string) => {
    setState((s) => {
      const nowCompleted = !s.assessmentCompletions.includes(courseSlug);
      void fetch("/api/course-assessment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseSlug, completed: nowCompleted }),
      });
      return {
        ...s,
        assessmentCompletions: nowCompleted
          ? [...s.assessmentCompletions, courseSlug]
          : s.assessmentCompletions.filter((slug) => slug !== courseSlug),
      };
    });
  }, []);

  const courseRequest = useCallback(async (url: string, init: RequestInit): Promise<Course> => {
    const response = await fetch(url, init);
    const data = await response.json().catch(() => ({})) as { course?: Course; error?: string };
    if (!response.ok || !data.course) throw new Error(data.error ?? "Couldn't save the course. Please try again.");
    return data.course;
  }, []);

  /** Puts a saved course into the learner catalog — or keeps it out. The
   *  catalog mirrors GET /api/courses: non-admins only ever see published
   *  courses, so a tutor's draft must not leak onto their learner pages. */
  const syncCatalog = useCallback((courses: Course[], saved: Course): Course[] => {
    const isAdmin = sessionUser?.role === "admin";
    if (!isAdmin && saved.published === false) return courses.filter((item) => item.slug !== saved.slug);
    // Draft lessons are hidden from learners too (see GET /api/courses).
    const entry = isAdmin ? saved : { ...saved, lessons: saved.lessons.filter((lesson) => isLessonLive(lesson)) };
    return courses.some((item) => item.slug === saved.slug)
      ? courses.map((item) => (item.slug === saved.slug ? entry : item))
      : [...courses, entry];
  }, [sessionUser?.role]);

  const upsertCourse = useCallback(async (course: Course) => {
    // A server revision means the course already exists. Don't infer that
    // from the catalog: it omits drafts for tutors, which turned every save of
    // a draft (including publishing it) into a rejected "create".
    const exists = course.revision != null || state.courses.some((item) => item.slug === course.slug);
    const saved = await courseRequest(exists ? `/api/courses/${encodeURIComponent(course.slug)}` : "/api/courses", {
      method: exists ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(course),
    });
    setState((s) => ({ ...s, courses: syncCatalog(s.courses, saved) }));
    return saved;
  }, [courseRequest, state.courses, syncCatalog]);

  const deleteCourse = useCallback(async (slug: string) => {
    const response = await fetch(`/api/courses/${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? "Couldn't delete the course. Please try again.");
    }
    setState((s) => ({ ...s, courses: s.courses.filter((c) => c.slug !== slug) }));
  }, []);

  // `base` is the course as the caller last loaded it. Pass it for courses the
  // learner catalog may not contain (a tutor's drafts); otherwise it's looked up.
  const upsertLesson = useCallback(async (courseSlug: string, lesson: Lesson, base?: Course) => {
    const current = base ?? state.courses.find((course) => course.slug === courseSlug);
    if (!current) throw new Error("This course no longer exists.");
    const exists = current.lessons.some((item) => item.id === lesson.id);
    const saved = await courseRequest(`/api/courses/${encodeURIComponent(courseSlug)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...current, lessons: exists ? current.lessons.map((item) => item.id === lesson.id ? lesson : item) : [...current.lessons, lesson] }),
    });
    setState((s) => ({ ...s, courses: syncCatalog(s.courses, saved) }));
    return saved;
  }, [courseRequest, state.courses, syncCatalog]);

  const deleteLesson = useCallback(async (courseSlug: string, lessonId: string, base?: Course) => {
    const current = base ?? state.courses.find((course) => course.slug === courseSlug);
    if (!current) throw new Error("This course no longer exists.");
    const saved = await courseRequest(`/api/courses/${encodeURIComponent(courseSlug)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...current, lessons: current.lessons.filter((lesson) => lesson.id !== lessonId) }),
    });
    setState((s) => ({ ...s, courses: syncCatalog(s.courses, saved) }));
    return saved;
  }, [courseRequest, state.courses, syncCatalog]);

  const resetAll = useCallback(() => {
    if (email) localStorage.removeItem(storageKeyFor(email));
    setState({ ...initialState, user: null });
  }, [email]);

  const api = useMemo<StoreApi>(
    () => ({
      state: { ...state, user: sessionUser },
      hydrated: hydrated && status !== "loading",
      workspaceMode: sessionUser?.role === "tutor"
        ? workspaceMode
        : sessionUser?.role === "admin"
          ? "tutor"
          : "student",
      setWorkspaceMode,
      logout, toggleSidebar, setSidebarCollapsed, recordView, setWatchPct, toggleComplete,
      toggleBookmark, toggleSavedLesson, setNote, markNotificationsRead,
      toggleAssessmentComplete,
      upsertCourse, deleteCourse, upsertLesson, deleteLesson, resetAll,
    }),
    [state, sessionUser, hydrated, status, workspaceMode, setWorkspaceMode, logout, toggleSidebar, setSidebarCollapsed, recordView, setWatchPct, toggleComplete, toggleBookmark, toggleSavedLesson, setNote, markNotificationsRead, toggleAssessmentComplete, upsertCourse, deleteCourse, upsertLesson, deleteLesson, resetAll]
  );

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

/* ---------- Derived helpers ---------- */

export function useCourseProgress(course: Course | undefined) {
  const { state } = useStore();
  return useMemo(() => {
    if (!course || course.lessons.length === 0) return { completed: 0, total: 0, pct: 0, assessmentDone: false };
    const completedLessons = course.lessons.filter((l) => state.progress[l.id]?.completed).length;
    const hasCapstone = !!course.baseAssessment;
    const assessmentDone = hasCapstone && state.assessmentCompletions.includes(course.slug);
    const total = course.lessons.length + (hasCapstone ? 1 : 0);
    const completed = completedLessons + (assessmentDone ? 1 : 0);
    return { completed, total, pct: Math.round((completed / total) * 100), assessmentDone };
  }, [course, state.progress, state.assessmentCompletions]);
}

export function useOverallStats() {
  const { state } = useStore();
  return useMemo(() => {
    const allLessons = state.courses.flatMap((c) => c.lessons);
    const completedLessons = allLessons.filter((l) => state.progress[l.id]?.completed);
    const minutesLearned = completedLessons.reduce((acc, l) => acc + l.durationMin, 0);
    const completedCourses = state.courses.filter((c) => c.lessons.length > 0 && c.lessons.every((l) => state.progress[l.id]?.completed));
    const overallPct = allLessons.length ? Math.round((completedLessons.length / allLessons.length) * 100) : 0;
    return {
      coursesAvailable: state.courses.length,
      completedCourses: completedCourses.length,
      hoursLearned: Math.round((minutesLearned / 60) * 10) / 10,
      badges: completedCourses.length,
      overallPct,
      completedLessonCount: completedLessons.length,
      totalLessonCount: allLessons.length,
    };
  }, [state.courses, state.progress]);
}

export function useEarnedBadges(): EarnedBadge[] {
  const { state } = useStore();
  return useMemo(() =>
    state.courses
      .filter((c) => c.lessons.length > 0 && c.lessons.every((l) => state.progress[l.id]?.completed))
      .map((c) => {
        const last = c.lessons.map((l) => state.progress[l.id]?.completedAt ?? "").sort().at(-1) || new Date().toISOString();
        return {
          id: `RQ-${c.slug.slice(0, 3).toUpperCase()}-${last.slice(0, 10).replaceAll("-", "")}`,
          courseSlug: c.slug,
          courseTitle: c.title,
          earnedAt: last,
        };
      }),
  [state.courses, state.progress]);
}

export function useContinueWatching() {
  const { state } = useStore();
  return useMemo(() =>
    state.history
      .map((h) => {
        const course = state.courses.find((c) => c.slug === h.courseSlug);
        const lesson = course?.lessons.find((l) => l.id === h.lessonId);
        if (!course || !lesson) return null;
        return { course, lesson, at: h.at, progress: state.progress[lesson.id] };
      })
      .filter(Boolean) as { course: Course; lesson: Lesson; at: string; progress?: { completed: boolean; watchPct: number } }[],
  [state.courses, state.history, state.progress]);
}
