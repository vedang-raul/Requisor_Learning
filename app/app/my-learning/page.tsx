"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, CheckCircle2, Clock, History, MonitorPlay, PlayCircle, Trophy } from "lucide-react";
import { useStore, useContinueWatching, useEarnedBadges } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { CourseCard } from "@/components/course-card";
import { PageTransition } from "@/components/motion";
import { ProgressBar } from "@/components/ui/progress";
import { Tag } from "@/components/ui/badge";
import { cn, formatMinutes } from "@/lib/utils";

type TabKey = "continue" | "saved" | "completed" | "history";

const tabDefs: { key: TabKey; label: string; icon: typeof PlayCircle }[] = [
  { key: "continue", label: "Continue Learning", icon: PlayCircle },
  { key: "saved", label: "Saved & Bookmarks", icon: Bookmark },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
  { key: "history", label: "Learning History", icon: History },
];

export default function MyLearningPage() {
  const { state } = useStore();
  const watching = useContinueWatching();
  const badges = useEarnedBadges();
  const [tab, setTab] = useState<TabKey>("continue");

  const bookmarkedCourses = state.courses.filter((c) => state.bookmarks.includes(c.slug));
  const savedLessons = useMemo(
    () =>
      state.savedLessons
        .map((id) => {
          for (const c of state.courses) {
            const l = c.lessons.find((x) => x.id === id);
            if (l) return { course: c, lesson: l };
          }
          return null;
        })
        .filter(Boolean) as { course: (typeof state.courses)[0]; lesson: (typeof state.courses)[0]["lessons"][0] }[],
    [state.savedLessons, state.courses]
  );
  const completedCourses = state.courses.filter((c) => c.lessons.length > 0 && c.lessons.every((l) => state.progress[l.id]?.completed));
  const inProgressCourses = state.courses.filter((c) => {
    const done = c.lessons.filter((l) => state.progress[l.id]?.completed).length;
    return done > 0 && done < c.lessons.length;
  });

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">My <span className="text-gradient">Learning</span></h1>
          <p className="mt-1 text-sm text-zinc-600">Everything you&apos;re watching, saving and finishing — in one place.</p>
        </div>
        {badges.length > 0 && (
          <Link href="/app/badges/" className="focus-ring flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-500/20">
            <Trophy className="h-4 w-4" />{badges.length} badge{badges.length > 1 ? "s" : ""} earned
          </Link>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200" role="tablist">
        {tabDefs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "focus-ring relative flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition",
                tab === t.key ? "text-primary" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              <Icon className="h-3.5 w-3.5" />{t.label}
              {tab === t.key && <motion.span layoutId="ml-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-primary to-accent" />}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
          {tab === "continue" && (
            <div className="space-y-6">
              {watching.length === 0 && inProgressCourses.length === 0 ? (
                <EmptyState icon={MonitorPlay} title="Nothing in progress" sub="Start any lesson and it will appear here for quick resume." cta="Browse learning paths" href="/app/paths/" />
              ) : (
                <>
                  {watching.length > 0 && (
                    <div className="space-y-2.5">
                      <h2 className="text-sm font-semibold text-zinc-700">Recently watched</h2>
                      {watching.slice(0, 6).map(({ course, lesson, progress, at }) => (
                        <Link key={lesson.id} href={`/app/learn/?course=${course.slug}&lesson=${lesson.id}`} className="focus-ring group flex items-center gap-4 rounded-2xl border border-zinc-100 bg-card/70 p-4 transition hover:border-primary/40">
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${course.cover}`}><PlayCircle className="h-5 w-5 text-white" /></div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-900">{lesson.title}</p>
                            <p className="text-xs text-zinc-500">{course.title} · {new Date(at).toLocaleDateString()}</p>
                            <ProgressBar value={progress?.completed ? 100 : progress?.watchPct ?? 0} className="mt-2" />
                          </div>
                          <Tag><Clock className="h-3 w-3" />{formatMinutes(lesson.durationMin)}</Tag>
                        </Link>
                      ))}
                    </div>
                  )}
                  {inProgressCourses.length > 0 && (
                    <div>
                      <h2 className="mb-3 text-sm font-semibold text-zinc-700">Courses in progress</h2>
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {inProgressCourses.map((c) => <CourseCard key={c.slug} course={c} />)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "saved" && (
            <div className="space-y-6">
              {bookmarkedCourses.length === 0 && savedLessons.length === 0 ? (
                <EmptyState icon={Bookmark} title="No saved items yet" sub="Bookmark courses and save lessons to build your personal library." cta="Explore paths" href="/app/paths/" />
              ) : (
                <>
                  {bookmarkedCourses.length > 0 && (
                    <div>
                      <h2 className="mb-3 text-sm font-semibold text-zinc-700">Bookmarked courses</h2>
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {bookmarkedCourses.map((c) => <CourseCard key={c.slug} course={c} />)}
                      </div>
                    </div>
                  )}
                  {savedLessons.length > 0 && (
                    <div className="space-y-2.5">
                      <h2 className="text-sm font-semibold text-zinc-700">Saved lessons</h2>
                      {savedLessons.map(({ course, lesson }) => (
                        <Link key={lesson.id} href={`/app/learn/?course=${course.slug}&lesson=${lesson.id}`} className="focus-ring group flex items-center gap-3 rounded-xl border border-zinc-100 bg-card/70 p-3.5 transition hover:border-primary/40">
                          <Bookmark className="h-4 w-4 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">{lesson.title}</span>
                          <span className="text-xs text-zinc-500">{course.title}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "completed" && (
            completedCourses.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No completed courses yet" sub="Finish every lesson in a path to complete it and earn your badge." cta="Continue learning" href="/app/paths/" />
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {completedCourses.map((c) => <CourseCard key={c.slug} course={c} />)}
              </div>
            )
          )}

          {tab === "history" && (
            state.history.length === 0 ? (
              <EmptyState icon={History} title="No history yet" sub="Your watched lessons will be tracked here automatically." cta="Start a lesson" href="/app/paths/" />
            ) : (
              <div className="space-y-2">
                {state.history.slice(0, 20).map((h, i) => {
                  const course = state.courses.find((c) => c.slug === h.courseSlug);
                  const lesson = course?.lessons.find((l) => l.id === h.lessonId);
                  if (!course || !lesson) return null;
                  return (
                    <Link key={i} href={`/app/learn/?course=${course.slug}&lesson=${lesson.id}`} className="focus-ring flex items-center gap-3 rounded-xl border border-zinc-100 bg-card/60 px-4 py-3 text-sm transition hover:border-primary/40">
                      <History className="h-4 w-4 shrink-0 text-zinc-600" />
                      <span className="min-w-0 flex-1 truncate text-zinc-800">{lesson.title}</span>
                      <span className="hidden text-xs text-zinc-500 sm:block">{course.title}</span>
                      <span className="shrink-0 text-[11px] text-zinc-600">{new Date(h.at).toLocaleString()}</span>
                    </Link>
                  );
                })}
              </div>
            )
          )}
        </motion.div>
      </AnimatePresence>
    </PageTransition>
  );
}

function EmptyState({ icon: Icon, title, sub, cta, href }: { icon: typeof PlayCircle; title: string; sub: string; cta: string; href: string }) {
  return (
    <div className="glass-card flex flex-col items-center gap-3 py-14 text-center">
      <div className="rounded-2xl bg-primary/10 p-4"><Icon className="h-8 w-8 text-primary" /></div>
      <p className="text-sm font-medium text-zinc-800">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-zinc-500">{sub}</p>
      <Link href={href} className="focus-ring mt-1 rounded-xl bg-gradient-to-r from-primary to-secondary px-4 py-2 text-sm font-medium text-white shadow-glow-sm transition hover:shadow-glow">{cta}</Link>
    </div>
  );
}
