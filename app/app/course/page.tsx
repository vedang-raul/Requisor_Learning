"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, Clock, FileText, PlayCircle, Video, Bookmark, BookmarkCheck, ChevronRight, SearchX } from "lucide-react";
import { useStore, useCourseProgress } from "@/lib/store";
import { cn, formatMinutes, isPlaceholder, youTubeThumb } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { PageTransition, Reveal } from "@/components/motion";
import { categoryMeta } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { CourseReviews } from "@/components/course-reviews";

type LessonFilter = "all" | "completed" | "in-progress" | "not-started";

function CourseView() {
  const params = useSearchParams();
  const slug = params.get("slug");
  const { state, toggleBookmark } = useStore();
  const course = state.courses.find((c) => c.slug === slug);
  const { pct, completed, total } = useCourseProgress(course);
  const [filter, setFilter] = useState<LessonFilter>("all");

  const lessons = useMemo(() => {
    if (!course) return [];
    return course.lessons.filter((l) => {
      const p = state.progress[l.id];
      if (filter === "completed") return p?.completed;
      if (filter === "in-progress") return !p?.completed && (p?.watchPct ?? 0) > 0;
      if (filter === "not-started") return !p?.completed && !(p?.watchPct ?? 0);
      return true;
    });
  }, [course, filter, state.progress]);

  // Group consecutive lessons by their sub-part (section); courses without sections get one unnamed group.
  const sections = useMemo(() => {
    const groups: { name?: string; items: typeof lessons }[] = [];
    for (const l of lessons) {
      const last = groups[groups.length - 1];
      if (last && last.name === l.section) last.items.push(l);
      else groups.push({ name: l.section, items: [l] });
    }
    return groups;
  }, [lessons]);

  if (!course) {
    return (
      <div className="glass-card mx-auto mt-16 flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <SearchX className="h-10 w-10 text-zinc-600" />
        <p className="text-sm font-medium text-zinc-800">Course not found</p>
        <p className="text-xs text-zinc-500">It may have been removed by an admin.</p>
        <Link href="/app/paths/"><Button variant="outline" size="sm">Back to Learning Paths</Button></Link>
      </div>
    );
  }

  const meta = categoryMeta[course.category];
  const Icon = meta.icon;
  const totalMin = course.lessons.reduce((a, l) => a + l.durationMin, 0);
  const bookmarked = state.bookmarks.includes(course.slug);
  const nextLesson = course.lessons.find((l) => !state.progress[l.id]?.completed) ?? course.lessons[0];

  return (
    <PageTransition className="space-y-6">
      {/* Hero */}
      <div className={cn("relative overflow-hidden rounded-3xl bg-gradient-to-br p-8 md:p-10", course.cover)}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.28),transparent_50%)]" />
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2">
              <Tag className="bg-black/30 text-white backdrop-blur-sm">{meta.label}</Tag>
              <Tag className="bg-black/30 text-white backdrop-blur-sm">{course.level}</Tag>
            </div>
            <h1 className="text-3xl font-bold text-white drop-shadow md:text-4xl">{course.title}</h1>
            <p className="mt-2 text-sm text-white/85 md:text-base">{course.tagline}</p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-white/85">
              <span className="inline-flex items-center gap-1.5"><Video className="h-4 w-4" />{course.lessons.length} lessons</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" />{formatMinutes(totalMin)} total</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" />{completed}/{total} done</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleBookmark(course.slug)}
              aria-label={bookmarked ? "Remove bookmark" : "Bookmark course"}
              className="focus-ring rounded-xl bg-black/25 p-2.5 text-white backdrop-blur-sm transition hover:bg-black/45"
            >
              {bookmarked ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
            </button>
            {nextLesson && (
              <Link
                href={`/app/learn/?course=${course.slug}&lesson=${nextLesson.id}`}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-lg transition hover:scale-[1.02] active:scale-[0.98]"
              >
                <PlayCircle className="h-4 w-4" /> {pct > 0 ? "Continue" : "Start"} learning
              </Link>
            )}
          </div>
        </div>
        <Icon className="absolute -bottom-6 -right-4 h-40 w-40 text-white/10" />
      </div>

      {/* Progress + filter */}
      <Card className="flex flex-wrap items-center gap-4">
        <div className="min-w-[200px] flex-1">
          <div className="mb-1.5 flex justify-between text-xs text-zinc-600">
            <span>Course progress</span><span className="font-medium text-zinc-800">{pct}%</span>
          </div>
          <ProgressBar value={pct} />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "in-progress", "completed", "not-started"] as LessonFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "focus-ring rounded-full border px-3 py-1 text-[11px] font-medium capitalize transition",
                filter === f ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-white text-zinc-600 hover:text-zinc-800"
              )}
            >
              {f.replace("-", " ")}
            </button>
          ))}
        </div>
      </Card>

      {/* Lessons, grouped by sub-part */}
      <div className="space-y-2.5">
        {lessons.length === 0 && (
          <div className="glass-card py-12 text-center text-sm text-zinc-500">No lessons match this filter.</div>
        )}
        {sections.map((group, gi) => (
          <div key={group.name ?? gi} className="space-y-2.5">
            {group.name && (
              <h2 className={cn("flex items-baseline gap-2 text-base font-semibold", gi > 0 && "pt-4")}>
                {group.name}
                <span className="text-xs font-normal text-zinc-500">{group.items.length} lesson{group.items.length === 1 ? "" : "s"}</span>
              </h2>
            )}
            {group.items.map((lesson, i) => {
          const p = state.progress[lesson.id];
          const done = !!p?.completed;
          const started = !done && (p?.watchPct ?? 0) > 0;
          const idx = course.lessons.indexOf(lesson);
          return (
            <Reveal key={lesson.id} delay={Math.min(i * 0.04, 0.3)}>
              <Link href={`/app/learn/?course=${course.slug}&lesson=${lesson.id}`} className="block">
                <motion.div
                  whileHover={{ x: 4 }}
                  className={cn(
                    "group flex items-center gap-4 rounded-2xl border p-4 transition-colors",
                    done ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-zinc-100 bg-card/70 hover:border-primary/40 hover:bg-card"
                  )}
                >
                  <span className="w-7 shrink-0 text-center text-sm font-semibold text-zinc-600">{String(idx + 1).padStart(2, "0")}</span>
                  <div className="relative hidden h-14 w-24 shrink-0 overflow-hidden rounded-lg sm:block">
                    {lesson.format === "reading" ? (
                      <div className={cn("flex h-full w-full items-center justify-center bg-gradient-to-br", course.cover)}>
                        <FileText className="h-6 w-6 text-white/80" />
                      </div>
                    ) : isPlaceholder(lesson.youtubeId) ? (
                      <div className={cn("flex h-full w-full items-center justify-center bg-gradient-to-br", course.cover)}>
                        <PlayCircle className="h-6 w-6 text-white/80" />
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={youTubeThumb(lesson.youtubeId)} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium", done ? "text-zinc-600" : "text-zinc-900 group-hover:text-zinc-900")}>{lesson.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{lesson.description}</p>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-zinc-500">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatMinutes(lesson.durationMin)}</span>
                      {lesson.assignment && <Tag tone="warning" className="text-[10px]">Assignment</Tag>}
                      {started && <Tag tone="accent" className="text-[10px]">{p?.watchPct ?? 0}% {lesson.format === "reading" ? "read" : "watched"}</Tag>}
                    </div>
                  </div>
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-zinc-700 transition group-hover:text-primary" />
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-700 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </motion.div>
              </Link>
            </Reveal>
          );
            })}
          </div>
        ))}
      </div>

      <CourseReviews courseSlug={course.slug} />
    </PageTransition>
  );
}

export default function CoursePage() {
  return (
    <Suspense>
      <CourseView />
    </Suspense>
  );
}
