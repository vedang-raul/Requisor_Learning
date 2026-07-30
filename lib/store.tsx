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

  // Real auth: the signed-in user comes from the NextAuth session, not localStorage.
  const sessionUser: UserState | null = useMemo(() => {
    if (!session?.user?.email) return null;
    return {
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

  // On hydration, pull authoritative XP from the DB and override local value.
  useEffect(() => {
    if (!hydrated || !email) return;
    dbSynced.current = false;
    fetch("/api/xp")
      .then((r) => r.json())
      .then((data: { xp?: number }) => {
        setState((s) => ({ ...s, xp: data.xp ?? s.xp }));
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
    setState((s) => ({
      ...s,
      bookmarks: s.bookmarks.includes(courseSlug) ? s.bookmarks.filter((b) => b !== courseSlug) : [...s.bookmarks, courseSlug],
    }));
  }, []);

  const toggleSavedLesson = useCallback((lessonId: string) => {
    setState((s) => ({
      ...s,
      savedLessons: s.savedLessons.includes(lessonId) ? s.savedLessons.filter((b) => b !== lessonId) : [...s.savedLessons, lessonId],
    }));
  }, []);

  const setNote = useCallback((lessonId: string, text: string) => {
    setState((s) => ({ ...s, notes: { ...s.notes, [lessonId]: text } }));
  }, []);

  const markNotificationsRead = useCallback(() => {
    setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
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
      upsertCourse, deleteCourse, upsertLesson, deleteLesson, resetAll,
    }),
    [state, sessionUser, hydrated, status, logout, toggleSidebar, recordView, setWatchPct, toggleComplete, toggleBookmark, toggleSavedLesson, setNote, markNotificationsRead, upsertCourse, deleteCourse, upsertLesson, deleteLesson, resetAll]
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
  if (!course || course.lessons.length === 0) return { completed: 0, total: 0, pct: 0 };
  const completed = course.lessons.filter((l) => state.progress[l.id]?.completed).length;
  return { completed, total: course.lessons.length, pct: Math.round((completed / course.lessons.length) * 100) };
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
