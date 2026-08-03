"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, PlayCircle, Video, Bookmark, BookmarkCheck } from "lucide-react";
import { Course } from "@/lib/types";
import { useCourseProgress, useStore } from "@/lib/store";
import { formatMinutes, cn } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/progress";
import { Tag } from "@/components/ui/badge";
import { categoryMeta } from "@/components/category-icon";

const courseIllustrations: Record<string, string> = {
  "agentic-ai": "/course-agentic-ai.jpg",
  "data-analytics": "/course-data-analytics.jpg",
  "product-management": "/course-product-management.jpg",
  "cyber-security": "/course-cyber-security.jpg",
};

export function CourseCard({ course }: { course: Course }) {
  const { pct, completed, total } = useCourseProgress(course);
  const { state, toggleBookmark } = useStore();
  const meta = categoryMeta[course.category];
  const Icon = meta.icon;
  const totalMin = course.lessons.reduce((a, l) => a + l.durationMin, 0);
  const bookmarked = state.bookmarks.includes(course.slug);
  const started = pct > 0;

  return (
    <motion.div
      whileHover={{ y: -5 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group gradient-border relative overflow-hidden rounded-2xl shadow-soft"
    >
      {/* Cover */}
      <div className={cn("relative h-36 bg-gradient-to-br", course.cover)}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.25),transparent_55%)]" />
        {courseIllustrations[course.slug] && (
          <img
            src={courseIllustrations[course.slug]}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover mix-blend-multiply opacity-90 grayscale select-none"
          />
        )}
        {/* <Icon className="absolute bottom-2 left-2 h-6 w-6 text-white transition-transform duration-300 group-hover:scale-110 rounded-lg bg-black/25 backdrop-blur-sm transition hover:bg-black/45" /> */}
        <button
          onClick={(e) => { e.preventDefault(); toggleBookmark(course.slug); }}
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark course"}
          className="focus-ring absolute right-3 top-3 rounded-lg bg-black/25 p-1.5 text-white/90 backdrop-blur-sm transition hover:bg-black/45"
        >
          {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </button>
        <div className="absolute bottom-3 right-4 flex gap-2">
          <Tag className="bg-black/30 text-white backdrop-blur-sm">{course.level}</Tag>
        </div>
      </div>
      {/* Body */}
      <div className="space-y-3 bg-card p-5">
        <div>
        
          <h3 className="mt-1 text-base font-semibold transition-colors group-hover:text-primary">{course.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-600">{course.tagline}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-600">
          <span className="inline-flex items-center gap-1.5"><Video className="h-3.5 w-3.5" />{course.lessons.length} videos</span>
          <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{formatMinutes(totalMin)}</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-zinc-600">
            <span>{completed}/{total} lessons</span>
            <span className="font-medium text-zinc-700">{pct}%</span>
          </div>
          <ProgressBar value={pct} />
        </div>
        <Link
          href={`/app/course/?slug=${course.slug}`}
          className="focus-ring inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-secondary text-sm font-medium text-white shadow-glow-sm transition-all duration-200 hover:shadow-glow hover:brightness-110"
        >
          <PlayCircle className="h-4 w-4" />
          {pct === 100 ? "Review course" : started ? "Continue learning" : "Start learning"}
        </Link>
      </div>
    </motion.div>
  );
}
