"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState, Course, EarnedBadge, Lesson, Notification, Review, UserState } from "./types";
import { seedCourses, seedReviews } from "./data";
import { todayKey } from "./utils";

const STORAGE_KEY = "requisor-learning-v14"; // v14: added 4 DeepLearning.AI agent-building courses to Agentic AI
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
  streak: { count: 0, lastDay: "" },
  notifications: [
    { id: "n1", kind: "announcement", title: "Welcome to Requisor Learning", body: "Your curated learning paths are ready. Start anywhere — progress is saved automatically.", at: new Date().toISOString(), read: false },
    { id: "n2", kind: "course", title: "New path: Agentic AI", body: "18 lessons on LLMs, agents, RAG and MCP are now available.", at: new Date().toISOString(), read: false },
  ],
  sidebarCollapsed: false,
  reviews: seedReviews,
};

interface StoreApi {
  state: AppState;
  hydrated: boolean;
  login: (name: string, email: string) => void;
  logout: () => void;
  toggleSidebar: () => void;
  recordView: (courseSlug: string, lessonId: string) => void;
  setWatchPct: (lessonId: string, pct: number) => void;
  toggleComplete: (courseSlug: string, lessonId: string) => { courseCompleted: boolean };
  toggleBookmark: (courseSlug: string) => void;
  toggleSavedLesson: (lessonId: string) => void;
  setNote: (lessonId: string, text: string) => void;
  markNotificationsRead: () => void;
  upsertReview: (courseSlug: string, rating: number, comment: string) => void;
  deleteReview: (reviewId: string) => void;
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

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<AppState>;
        setState((s) => ({ ...s, ...saved, courses: saved.courses?.length ? saved.courses : seedCourses }));
      }
    } catch {
      // corrupted storage — start fresh
    }
    setHydrated(true);
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full or unavailable — non-fatal
    }
  }, [state, hydrated]);

  const bumpStreak = (s: AppState): AppState["streak"] => {
    const today = todayKey();
    if (s.streak.lastDay === today) return s.streak;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return { count: s.streak.lastDay === yesterday ? s.streak.count + 1 : 1, lastDay: today };
  };

  const login = useCallback((name: string, email: string) => {
    // Dummy auth: everyone gets in; admin panel is open in this demo build.
    const role: UserState["role"] = "admin";
    setState((s) => ({ ...s, user: { name, email, role }, streak: bumpStreak(s) }));
  }, []);

  const logout = useCallback(() => setState((s) => ({ ...s, user: null })), []);

  const toggleSidebar = useCallback(() => setState((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed })), []);

  const recordView = useCallback((courseSlug: string, lessonId: string) => {
    setState((s) => {
      const history = [{ courseSlug, lessonId, at: new Date().toISOString() }, ...s.history.filter((h) => h.lessonId !== lessonId)].slice(0, 50);
      return { ...s, history, streak: bumpStreak(s) };
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
        return { ...s, progress, xp: Math.max(0, xp), notifications, streak: bumpStreak(s) };
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

  const upsertReview = useCallback((courseSlug: string, rating: number, comment: string) => {
    setState((s) => {
      if (!s.user) return s;
      const existing = s.reviews.find((r) => r.courseSlug === courseSlug && r.userEmail === s.user!.email);
      const clampedRating = Math.max(1, Math.min(5, Math.round(rating)));
      if (existing) {
        return {
          ...s,
          reviews: s.reviews.map((r) => (r.id === existing.id ? { ...r, rating: clampedRating, comment: comment.trim(), at: new Date().toISOString() } : r)),
        };
      }
      const review: Review = {
        id: `rev-${courseSlug}-${Date.now()}`,
        courseSlug,
        userEmail: s.user.email,
        userName: s.user.name,
        rating: clampedRating,
        comment: comment.trim(),
        at: new Date().toISOString(),
      };
      return { ...s, reviews: [review, ...s.reviews] };
    });
  }, []);

  const deleteReview = useCallback((reviewId: string) => {
    setState((s) => ({ ...s, reviews: s.reviews.filter((r) => r.id !== reviewId) }));
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
    localStorage.removeItem(STORAGE_KEY);
    setState({ ...initialState, user: null });
  }, []);

  const api = useMemo<StoreApi>(
    () => ({
      state, hydrated, login, logout, toggleSidebar, recordView, setWatchPct, toggleComplete,
      toggleBookmark, toggleSavedLesson, setNote, markNotificationsRead, upsertReview, deleteReview,
      upsertCourse, deleteCourse, upsertLesson, deleteLesson, resetAll,
    }),
    [state, hydrated, login, logout, toggleSidebar, recordView, setWatchPct, toggleComplete, toggleBookmark, toggleSavedLesson, setNote, markNotificationsRead, upsertReview, deleteReview, upsertCourse, deleteCourse, upsertLesson, deleteLesson, resetAll]
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

export function useCourseReviews(courseSlug: string | undefined) {
  const { state } = useStore();
  const reviews = useMemo(
    () => state.reviews.filter((r) => r.courseSlug === courseSlug).sort((a, b) => b.at.localeCompare(a.at)),
    [state.reviews, courseSlug]
  );
  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  const myReview = reviews.find((r) => r.userEmail === state.user?.email) ?? null;
  return { reviews, average, count: reviews.length, myReview };
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
