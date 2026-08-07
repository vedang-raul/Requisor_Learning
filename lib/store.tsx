"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { AppState, Course, EarnedBadge, Lesson, Notification, UserState } from "./types";
import { seedCourses } from "./data";


const STORAGE_KEY_BASE = "requisor-learning-v14"; // v14: added 4 DeepLearning.AI agent-building courses to Agentic AI
// State is namespaced per signed-in user so accounts sharing a browser never see each other's data.
const storageKeyFor = (email: string) => `${STORAGE_KEY_BASE}:${email.toLowerCase()}`;
const XP_PER_LESSON = 50;
const XP_PER_COURSE = 200;

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
  sidebarCollapsed: false,
  assessmentCompletions: [],
};

interface StoreApi {
  state: AppState;
  hydrated: boolean;
  logout: () => void;
  toggleSidebar: () => void;
  recordView: (courseSlug: string, lessonId: string) => void;
  setWatchPct: (lessonId: string, pct: number) => void;
  toggleComplete: (courseSlug: string, lessonId: string) => { courseCompleted: boolean };
  toggleBookmark: (courseSlug: string) => void;
  toggleSavedLesson: (lessonId: string) => void;
  setNote: (lessonId: string, text: string) => void;
  markNotificationsRead: () => void;
  toggleAssessmentComplete: (courseSlug: string) => void;
  // Admin
  upsertCourse: (course: Course) => void;
  deleteCourse: (slug: string) => void;
  upsertLesson: (courseSlug: string, lesson: Lesson) => void;
  deleteLesson: (courseSlug: string, lessonId: string) => void;
  resetAll: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
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
      role: session.user.role === "admin" ? "admin" : "employee",
    };
  }, [session]);

  const email = sessionUser?.email ?? null;

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
      setState(saved ? { ...initialState, ...saved, user: null, courses: saved.courses?.length ? saved.courses : seedCourses } : initialState);
    } catch {
      setState(initialState); // corrupted storage — start fresh
    }
    setHydrated(true);
  }, [email, status]);

  // Persist to the signed-in user's bucket only.
  useEffect(() => {
    if (!hydrated || !email) return;
    try {
      localStorage.setItem(storageKeyFor(email), JSON.stringify({ ...state, user: null }));
    } catch {
      // storage full or unavailable — non-fatal
    }
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
    setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
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

  const upsertCourse = useCallback((course: Course) => {
    setState((s) => {
      const exists = s.courses.some((c) => c.slug === course.slug);
      return { ...s, courses: exists ? s.courses.map((c) => (c.slug === course.slug ? course : c)) : [...s.courses, course] };
    });
  }, []);

  const deleteCourse = useCallback((slug: string) => {
    setState((s) => ({ ...s, courses: s.courses.filter((c) => c.slug !== slug) }));
  }, []);

  const upsertLesson = useCallback((courseSlug: string, lesson: Lesson) => {
    setState((s) => ({
      ...s,
      courses: s.courses.map((c) => {
        if (c.slug !== courseSlug) return c;
        const exists = c.lessons.some((l) => l.id === lesson.id);
        return { ...c, lessons: exists ? c.lessons.map((l) => (l.id === lesson.id ? lesson : l)) : [...c.lessons, lesson] };
      }),
    }));
  }, []);

  const deleteLesson = useCallback((courseSlug: string, lessonId: string) => {
    setState((s) => ({
      ...s,
      courses: s.courses.map((c) => (c.slug === courseSlug ? { ...c, lessons: c.lessons.filter((l) => l.id !== lessonId) } : c)),
    }));
  }, []);

  const resetAll = useCallback(() => {
    if (email) localStorage.removeItem(storageKeyFor(email));
    setState({ ...initialState, user: null });
  }, [email]);

  const api = useMemo<StoreApi>(
    () => ({
      state: { ...state, user: sessionUser },
      hydrated: hydrated && status !== "loading",
      logout, toggleSidebar, recordView, setWatchPct, toggleComplete,
      toggleBookmark, toggleSavedLesson, setNote, markNotificationsRead,
      toggleAssessmentComplete,
      upsertCourse, deleteCourse, upsertLesson, deleteLesson, resetAll,
    }),
    [state, sessionUser, hydrated, status, logout, toggleSidebar, recordView, setWatchPct, toggleComplete, toggleBookmark, toggleSavedLesson, setNote, markNotificationsRead, toggleAssessmentComplete, upsertCourse, deleteCourse, upsertLesson, deleteLesson, resetAll]
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
  if (!course || course.lessons.length === 0) return { completed: 0, total: 0, pct: 0, assessmentDone: false };
  const completedLessons = course.lessons.filter((l) => state.progress[l.id]?.completed).length;
  const hasCapstone = !!course.baseAssessment;
  const assessmentDone = hasCapstone && state.assessmentCompletions.includes(course.slug);
  const total = course.lessons.length + (hasCapstone ? 1 : 0);
  const completed = completedLessons + (assessmentDone ? 1 : 0);
  return { completed, total, pct: Math.round((completed / total) * 100), assessmentDone };
}

export function useOverallStats() {
  const { state } = useStore();
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
}

export function useEarnedBadges(): EarnedBadge[] {
  const { state } = useStore();
  return state.courses
    .filter((c) => c.lessons.length > 0 && c.lessons.every((l) => state.progress[l.id]?.completed))
    .map((c) => {
      const last = c.lessons.map((l) => state.progress[l.id]?.completedAt ?? "").sort().at(-1) || new Date().toISOString();
      return {
        id: `RQ-${c.slug.slice(0, 3).toUpperCase()}-${last.slice(0, 10).replaceAll("-", "")}`,
        courseSlug: c.slug,
        courseTitle: c.title,
        earnedAt: last,
      };
    });
}

export function useContinueWatching() {
  const { state } = useStore();
  return state.history
    .map((h) => {
      const course = state.courses.find((c) => c.slug === h.courseSlug);
      const lesson = course?.lessons.find((l) => l.id === h.lessonId);
      if (!course || !lesson) return null;
      return { course, lesson, at: h.at, progress: state.progress[lesson.id] };
    })
    .filter(Boolean) as { course: Course; lesson: Lesson; at: string; progress?: { completed: boolean; watchPct: number } }[];
}
