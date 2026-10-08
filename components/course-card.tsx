"use client";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, PlayCircle, Video, Bookmark, BookmarkCheck, ArrowRight, CheckCircle2, Flame, GraduationCap } from "lucide-react";
import { Course } from "@/lib/types";
import { useCourseProgress, useStore } from "@/lib/store";
import { formatMinutes, cn } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/progress";
import { Tag } from "@/components/ui/badge";
import { getCategoryMeta } from "@/components/category-icon";

const courseIllustrations: Record<string, string> = {
  "agentic-ai": "/course-agentic-ai.jpg",
  "data-analytics": "/course-data-analytics.jpg",
  "product-management": "/course-product-management.jpg",
  "cyber-security": "/course-cyber-security.jpg",
};

const springHover = { type: "spring" as const, stiffness: 320, damping: 22 };

export function CourseCard({ course }: { course: Course }) {
  const { pct, completed, total } = useCourseProgress(course);
  const { state, toggleBookmark } = useStore();
  const meta = getCategoryMeta(course.category);
  const Icon = meta.icon;
  const totalMin = course.lessons.reduce((a, l) => a + l.durationMin, 0);
  const bookmarked = state.bookmarks.includes(course.slug);
  const started = pct > 0;
  const finished = pct === 100;

  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={springHover}
      className="group gradient-border relative overflow-hidden rounded-2xl shadow-soft transition-shadow duration-300 hover:shadow-xl"
    >
      {/* Cover */}
      <div className={cn("relative h-36 overflow-hidden bg-gradient-to-br", course.cover)}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.25),transparent_55%)]" />
        {courseIllustrations[course.slug] && (
          <img
            src={courseIllustrations[course.slug]}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover transition-transform duration-[400ms] ease-out group-hover:scale-[1.06]"
          />
        )}

        {/* Category icon chip */}
        <div className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/25 text-white backdrop-blur-sm transition-colors group-hover:bg-black/40">
          <Icon className="h-4 w-4" />
        </div>

        <motion.button
          onClick={(e) => { e.preventDefault(); toggleBookmark(course.slug); }}
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark course"}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="focus-ring absolute right-3 top-3 rounded-lg bg-black/25 p-1.5 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/45"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={bookmarked ? "saved" : "unsaved"}
              initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, rotate: 20 }}
              transition={{ duration: 0.15 }}
              className="flex"
            >
              {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            </motion.span>
          </AnimatePresence>
        </motion.button>

        <div className="absolute bottom-3 right-4 flex items-center gap-2">
          {finished && (
            <motion.span initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-1 rounded-full bg-emerald-500/80 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              <CheckCircle2 className="h-3 w-3" />Done
            </motion.span>
          )}
          {!finished && started && (
            <motion.span
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1 rounded-full bg-amber-500/80 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"
            >
              <Flame className="h-3 w-3" />In progress
            </motion.span>
          )}
          {course.published === false && <Tag className="bg-amber-500/80 text-white backdrop-blur-sm">Draft</Tag>}
          <Tag className="bg-black/30 text-white backdrop-blur-sm">{course.level}</Tag>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-3 bg-card p-5">
        <div>
          <h3 className="mt-1 truncate text-base font-semibold transition-colors group-hover:text-primary" title={course.title}>{course.title}</h3>
          {/* Two lines are always reserved, so cards in a row are the same height whatever the tagline length. */}
          <p className="mt-1 line-clamp-2 min-h-[2.4375rem] text-xs leading-relaxed text-zinc-600">{course.tagline}</p>
          <p className="mt-1 flex h-4 items-center gap-1 text-[11px] text-zinc-500">
            {course.tutorName && <><GraduationCap className="h-3 w-3 shrink-0" /><span className="truncate">{course.tutorName}</span></>}
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-zinc-600">
          <span className="inline-flex items-center gap-1.5"><Video className="h-3.5 w-3.5" />{course.lessons.length} videos</span>
          <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{formatMinutes(totalMin)}</span>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-zinc-600">
            <span>{completed}/{total} lessons</span>
            <motion.span
              key={pct}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="font-medium text-zinc-700"
            >
              {pct}%
            </motion.span>
          </div>
          <ProgressBar value={pct} />
        </div>

        <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }} transition={springHover}>
          <Link
            href={`/app/course/?slug=${course.slug}`}
            className="focus-ring group/btn inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-secondary text-sm font-medium text-white shadow-glow-sm transition-all duration-200 hover:shadow-glow hover:brightness-110"
          >
            <PlayCircle className="h-4 w-4" />
            {finished ? "Review course" : started ? "Continue learning" : "Start learning"}
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/btn:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}