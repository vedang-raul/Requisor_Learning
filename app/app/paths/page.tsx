"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, SlidersHorizontal } from "lucide-react";
import { useStore } from "@/lib/store";
import { CourseCard } from "@/components/course-card";
import { PageTransition } from "@/components/motion";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "completed" | "in-progress" | "not-started";
type SortKey = "newest" | "duration";

const statusFilters: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in-progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "not-started", label: "Not Started" },
];

export default function PathsPage() {
  const { state } = useStore();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const courses = useMemo(() => {
    const withMeta = state.courses.map((c) => {
      const done = c.lessons.filter((l) => state.progress[l.id]?.completed).length;
      const pct = c.lessons.length ? done / c.lessons.length : 0;
      const totalMin = c.lessons.reduce((a, l) => a + l.durationMin, 0);
      return { c, pct, totalMin };
    });
    let filtered = withMeta;
    if (status === "completed") filtered = withMeta.filter((x) => x.pct === 1);
    if (status === "in-progress") filtered = withMeta.filter((x) => x.pct > 0 && x.pct < 1);
    if (status === "not-started") filtered = withMeta.filter((x) => x.pct === 0);
    const sorted = [...filtered].sort((a, b) =>
      sort === "newest" ? b.c.addedAt.localeCompare(a.c.addedAt) : a.totalMin - b.totalMin
    );
    return sorted.map((x) => x.c);
  }, [state.courses, state.progress, status, sort]);

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Learning <span className="text-gradient">Paths</span></h1>
        <p className="mt-1 text-sm text-zinc-600">Curated tracks to get you productive at Requisor, fast.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500"><Filter className="h-3.5 w-3.5" />Status</div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
          {statusFilters.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={status === f.key}
              onClick={() => setStatus(f.key)}
              className={cn(
                "focus-ring rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200",
                status === f.key
                  ? "border-primary/50 bg-primary/15 text-primary shadow-glow-sm"
                  : "border-border bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-500" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort courses"
            className="focus-ring rounded-xl border border-border bg-card px-3 py-1.5 text-xs text-zinc-700"
          >
            <option value="newest">Newest first</option>
            <option value="duration">Shortest first</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      <AnimatePresence mode="popLayout">
        {courses.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-sm font-medium text-zinc-700">No paths match this filter</p>
            <p className="text-xs text-zinc-500">Try a different status filter above.</p>
          </motion.div>
        ) : (
          <motion.div layout className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => (
              <motion.div key={c.slug} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25 }}>
                <CourseCard course={c} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
