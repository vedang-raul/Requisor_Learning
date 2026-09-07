"use client";

import { FormEvent, ReactNode, SelectHTMLAttributes, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, BarChart3, BookPlus, Check, CheckCircle2, Download, FileText, GraduationCap, Inbox, LayoutGrid, Paperclip, Upload,
  ListChecks, Loader2, Pencil, Plus, Send, Star, Trash2, TrendingUp, Users, X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { Course, Lesson, Resource } from "@/lib/types";
import { cn, extractYouTubeId, isPlaceholder, PLACEHOLDER_VIDEO, youTubeThumb } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { PageTransition } from "@/components/motion";
import { getCategoryCover, DEFAULT_CATEGORIES } from "@/components/category-icon";
import { MAX_RESOURCE_FILE_BYTES, RESOURCE_FILE_ACCEPT } from "@/lib/resource-files";

type TabKey = "analytics" | "courses" | "learners" | "ratings";
type TutorCourse = { course: Course; averageRating: number; ratingCount: number; ratingDistribution: number[] | Record<string, number> };

const springTab = { type: "spring" as const, stiffness: 500, damping: 35 };

function distributionCount(distribution: TutorCourse["ratingDistribution"], rating: number) {
  return Array.isArray(distribution) ? distribution[rating] ?? distribution[rating - 1] ?? 0 : distribution[String(rating)] ?? 0;
}

/** Categories already in use across the catalog, merged with the four
 *  defaults every install ships with — offered as datalist suggestions so a
 *  tutor can reuse an existing category or type a brand-new one. */
function categoryOptions(courses: Course[]): string[] {
  const inUse = new Set<string>(DEFAULT_CATEGORIES);
  for (const c of courses) if (c.category) inUse.add(c.category);
  return [...inUse].sort();
}

export default function TutorPage() {
  const { state, hydrated, upsertCourse, upsertLesson, deleteLesson, deleteCourse } = useStore();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("analytics");
  const [items, setItems] = useState<TutorCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Course | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyticsSlug, setAnalyticsSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/tutor/courses");
      const data = await response.json().catch(() => ({})) as { courses?: TutorCourse[]; error?: string };
      if (!response.ok || !Array.isArray(data.courses)) throw new Error(data.error ?? "Couldn't load your courses.");
      setItems(data.courses);
      setAnalyticsSlug((prev) => prev && data.courses!.some((i) => i.course.slug === prev) ? prev : data.courses![0]?.course.slug ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't load your courses.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (hydrated && state.user && state.user.role !== "tutor" && state.user.role !== "admin") router.replace("/app/dashboard/");
  }, [hydrated, router, state.user]);
  useEffect(() => { if (hydrated && state.user && (state.user.role === "tutor" || state.user.role === "admin")) void load(); }, [hydrated, state.user, load]);

  if (!hydrated || !state.user || (state.user.role !== "tutor" && state.user.role !== "admin")) return null;
  const saveCourse = async (course: Course) => {
    setSaving(true); setError(null);
    try { const saved = await upsertCourse(course); setCreating(false); setSelected(saved); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't save the course."); }
    finally { setSaving(false); }
  };
  const updateLessons = async (lesson: Lesson, remove = false) => {
    if (!selected) return;
    setSaving(true); setError(null);
    try {
      const updated = remove
        ? await deleteLesson(selected.slug, lesson.id)
        : await upsertLesson(selected.slug, lesson);
      setSelected(updated);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't save the lesson."); }
    finally { setSaving(false); }
  };

  const analyticsCourse = items.find((i) => i.course.slug === analyticsSlug)?.course ?? null;

  return (
    <PageTransition className="space-y-6">
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} className="flex items-center gap-2.5">
        <motion.div
          className="rounded-xl bg-primary/10 p-2"
          animate={{ rotate: [0, -6, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        >
          <GraduationCap className="h-5 w-5 text-primary" />
        </motion.div>
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Tutor <span className="text-gradient">Panel</span></h1>
          <p className="mt-1 text-sm text-zinc-600">Manage your courses, and see aggregate analytics, learners and ratings.</p>
        </div>
      </motion.div>

      <div
        className="flex gap-1 overflow-x-auto border-b border-zinc-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ msOverflowStyle: "none" }}
        role="tablist"
      >
        {([
          ["analytics", "Analytics", BarChart3],
          ["courses", "My Courses", LayoutGrid],
          ["learners", "Learners", Users],
          ["ratings", "Ratings", Star],
        ] as [TabKey, string, typeof BarChart3][]).map(([key, label, Icon]) => {
          const active = tab === key;
          return (
            <motion.button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              whileHover={{ y: active ? 0 : -1 }}
              whileTap={{ scale: 0.97 }}
              className={cn("focus-ring relative flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors", active ? "text-primary" : "text-zinc-500 hover:text-zinc-700")}
            >
              <motion.span animate={{ scale: active ? 1.1 : 1 }} transition={springTab} className="inline-flex">
                <Icon className="h-3.5 w-3.5" />
              </motion.span>
              {label}
              {active && <motion.span layoutId="tutor-underline" transition={springTab} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-primary to-accent" />}
            </motion.button>
          );
        })}
      </div>

      {error && <div role="alert" className="flex flex-col items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center">{error}<Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button></div>}

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
          {tab === "analytics" && (
            loading ? <Card className="flex items-center gap-2 py-10 text-sm text-zinc-600"><Loader2 className="h-5 w-5 animate-spin" /> Loading your courses…</Card> :
            items.length === 0 ? <EmptyCoursesState /> :
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Select a course">
                {items.map(({ course }) => (
                  <button
                    key={course.slug}
                    onClick={() => setAnalyticsSlug(course.slug)}
                    className={cn(
                      "focus-ring flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                      analyticsSlug === course.slug ? "border-primary/50 bg-primary/10 text-primary" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full bg-gradient-to-br", course.cover)} />
                    {course.title}
                  </button>
                ))}
              </div>
              {analyticsCourse && <CourseInsights course={analyticsCourse} />}
            </div>
          )}
          {tab === "courses" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button className="min-h-11" onClick={() => { setSelected(null); setCreating(true); }}><Plus className="h-4 w-4" /> Create course</Button>
              </div>
              {creating && <CourseForm saving={saving} onCancel={() => setCreating(false)} onSave={saveCourse} />}
              {loading ? <Card className="flex items-center gap-2 py-10 text-sm text-zinc-600"><Loader2 className="h-5 w-5 animate-spin" /> Loading your courses…</Card> :
                items.length === 0 ? <EmptyCoursesState /> :
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <button key={item.course.slug} onClick={() => { setCreating(false); setSelected(item.course); }} className="focus-ring group min-h-32 rounded-2xl text-left"><Card className="relative h-full transition hover:border-primary/40">{item.course.published === false && <span className="absolute left-3 top-3 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">Draft</span>}<span className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-transparent px-2 py-1 text-[11px] font-medium text-zinc-400 opacity-0 transition group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary group-hover:opacity-100"><Pencil className="h-3 w-3" aria-hidden="true" />Edit</span><div className={`mb-3 h-2 rounded-full bg-gradient-to-r ${item.course.cover}`} /><CardTitle>{item.course.title}</CardTitle><p className="mt-1 text-xs text-zinc-600">{item.course.lessons.length} lessons · <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />{item.averageRating.toFixed(1)} ({item.ratingCount})</span></p><div className="mt-3 flex gap-1" aria-hidden="true">{[5,4,3,2,1].map((rating) => <span key={rating} title={`${rating} stars: ${distributionCount(item.ratingDistribution, rating)}`} className="h-1 flex-1 rounded bg-primary/20" style={{ opacity: item.ratingCount ? Math.max(.2, distributionCount(item.ratingDistribution, rating) / item.ratingCount) : .2 }} />)}</div><span className="sr-only">{[5,4,3,2,1].map((rating) => `${rating} stars: ${distributionCount(item.ratingDistribution, rating)}`).join(", ")}</span></Card></button>)}</div>}
              {selected && <CourseEditor course={selected} saving={saving} onCancel={() => setSelected(null)} onSave={saveCourse} onAddLesson={updateLessons} onDeleteLesson={(lesson) => updateLessons(lesson, true)} onDeleteCourse={async () => { if (!confirm(`Delete "${selected.title}"?`)) return; setSaving(true); try { await deleteCourse(selected.slug); setSelected(null); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't delete the course."); } finally { setSaving(false); } }} />}
            </div>
          )}
          {tab === "learners" && <LearnersPanel />}
          {tab === "ratings" && (
            loading ? <Card className="flex items-center gap-2 py-10 text-sm text-zinc-600"><Loader2 className="h-5 w-5 animate-spin" /> Loading ratings…</Card> :
            <RatingsPanel items={items} />
          )}
        </motion.div>
      </AnimatePresence>
    </PageTransition>
  );
}

function EmptyCoursesState() {
  return <Card className="py-12 text-center"><BookPlus className="mx-auto h-8 w-8 text-primary" /><CardTitle className="mt-3">No courses yet</CardTitle><p className="mt-1 text-sm text-zinc-600">Create your first course in the "My Courses" tab to start building a learning path.</p></Card>;
}

type InsightsData = {
  course: { slug: string; title: string; lessonCount: number };
  period: { days: number; since: string };
  privacy: { suppressed: boolean; minimumLearners: number };
  summary: {
    enrolled: number | null;
    started: number | null;
    completed: number | null;
    averageProgress: number | null;
    recentActive: number | null;
  };
  lessons: Array<{
    lessonId: string;
    title: string;
    position: number;
    started: number | null;
    completed: number | null;
    completionRate: number | null;
  }>;
};

function InsightMetric({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Users; tone: string }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-4">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-2xl font-bold text-zinc-900">{value}</p><p className="mt-1 text-xs font-medium text-zinc-600">{label}</p></div>
      <span className={`rounded-xl bg-gradient-to-br p-2 ${tone}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
    </div>
    <p className="mt-3 text-[11px] leading-4 text-zinc-500">{detail}</p>
  </div>;
}

function CourseInsights({ course }: { course: Course }) {
  const [days, setDays] = useState(30);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInsights = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tutor/insights?courseSlug=${encodeURIComponent(course.slug)}&days=${days}`, { signal });
      const data = await response.json().catch(() => ({})) as InsightsData & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn't load learner insights.");
      setInsights(data);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Couldn't load learner insights.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [course.slug, days]);

  useEffect(() => {
    const controller = new AbortController();
    void loadInsights(controller.signal);
    return () => controller.abort();
  }, [loadInsights]);

  const summary = insights?.summary;
  const suppressed = insights?.privacy.suppressed ?? false;
  const hasActivity = (summary?.enrolled ?? 0) > 0;

  return <section aria-labelledby="learner-insights-heading" className="space-y-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" /><h2 id="learner-insights-heading" className="text-lg font-bold text-zinc-900">Learner insights</h2></div>
        <p className="mt-1 text-sm text-zinc-600">Aggregate progress for {course.title}. No learner identities are shown.</p>
      </div>
      <label className="text-sm font-medium text-zinc-700">Time range
        <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="focus-ring mt-1 block h-10 w-full rounded-xl border border-border bg-white px-3 text-sm sm:w-44">
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option>
        </select>
      </label>
    </div>
    {loading ? <Card className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-zinc-100" />)}</Card> :
      error ? <Card className="flex flex-col items-start gap-3 border-red-200 bg-red-50 sm:flex-row sm:items-center sm:justify-between"><p role="alert" className="text-sm text-red-700">{error}</p><Button size="sm" variant="outline" onClick={() => void loadInsights()}>Try again</Button></Card> :
      suppressed ? <Card className="border-amber-200 bg-amber-50"><div className="flex gap-3"><Users className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" /><div><CardTitle>Insights are temporarily hidden</CardTitle><p className="mt-1 text-sm leading-6 text-amber-800">Metrics stay hidden whenever any course, time-range, or lesson cohort represents fewer than {insights?.privacy.minimumLearners} learners. This protects small groups from being identifiable.</p></div></div></Card> :
      !hasActivity ? <Card className="py-10 text-center"><Activity className="mx-auto h-8 w-8 text-primary" aria-hidden="true" /><CardTitle className="mt-3">No learner activity yet</CardTitle><p className="mx-auto mt-1 max-w-md text-sm text-zinc-600">Metrics will appear after learners open a lesson. Choose a longer time range if activity happened earlier.</p></Card> :
      <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <InsightMetric label="Learners enrolled" value={String(summary?.enrolled ?? 0)} detail="All learners with recorded course activity." icon={Users} tone="from-indigo-500/20 to-indigo-500/5 text-indigo-700" />
        <InsightMetric label="Learners started" value={String(summary?.started ?? 0)} detail="First course activity in this period." icon={TrendingUp} tone="from-cyan-500/20 to-cyan-500/5 text-cyan-700" />
        <InsightMetric label="Course completions" value={String(summary?.completed ?? 0)} detail={`Current all-time completions of all ${course.lessons.length} lessons.`} icon={CheckCircle2} tone="from-emerald-500/20 to-emerald-500/5 text-emerald-700" />
        <InsightMetric label="Average progress" value={`${summary?.averageProgress ?? 0}%`} detail="Current progress across enrolled learners." icon={BarChart3} tone="from-violet-500/20 to-violet-500/5 text-violet-700" />
        <InsightMetric label="Active recently" value={String(summary?.recentActive ?? 0)} detail="Opened or completed a lesson in this period." icon={Activity} tone="from-amber-500/20 to-amber-500/5 text-amber-700" />
      </div>
      <Card>
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Lesson progress</CardTitle><p className="mt-1 text-xs text-zinc-500">See where learners continue or drop off.</p></div><span className="text-xs text-zinc-500">{days === 365 ? "Last 12 months" : `Last ${days} days`}</span></div>
        <div className="space-y-4">
          {insights?.lessons.map((lesson, index) => <div key={lesson.lessonId} className="rounded-xl border border-zinc-100 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{index + 1}</span><span className="truncate text-sm font-medium text-zinc-800">{lesson.title}</span></div><span className="shrink-0 text-xs text-zinc-500">{lesson.started === 0 ? "No starts yet" : `${lesson.completed} of ${lesson.started} completed · ${lesson.completionRate ?? 0}%`}</span></div>
            <div className="mt-2"><div className="sr-only">{lesson.completionRate ?? 0}% of learners who started this lesson completed it</div><div role="progressbar" aria-label={`${lesson.title} completion rate`} aria-valuenow={lesson.completionRate ?? 0} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${lesson.completionRate ?? 0}%` }} /></div></div>
          </div>)}
          {insights?.lessons.length === 0 && <p className="text-sm text-zinc-500">This course has no lessons to measure yet.</p>}
        </div>
      </Card></>}
  </section>;
}

/* ---------------- Learners (cross-course, aggregate-only rollup) ---------------- */

type LearnersData = {
  period: { days: number; since: string };
  privacy: { minimumLearners: number };
  overall: { suppressed: boolean; totalLearners: number | null; activeInPeriod: number | null; totalCompletions: number | null };
  courses: Array<{ slug: string; title: string; lessonCount: number; suppressed: boolean; enrolled: number | null; active: number | null; completed: number | null }>;
};

function LearnersPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<LearnersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/tutor/learners?days=${days}`, { signal });
      const json = await response.json().catch(() => ({})) as LearnersData & { error?: string };
      if (!response.ok) throw new Error(json.error ?? "Couldn't load learner data.");
      setData(json);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Couldn't load learner data.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" aria-hidden="true" /><h2 className="text-lg font-bold text-zinc-900">Learners</h2></div>
          <p className="mt-1 text-sm text-zinc-600">Aggregate audience across all your courses. No learner names or emails are ever shown here.</p>
        </div>
        <label className="text-sm font-medium text-zinc-700">Time range
          <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="focus-ring mt-1 block h-10 w-full rounded-xl border border-border bg-white px-3 text-sm sm:w-44">
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option>
          </select>
        </label>
      </div>

      {loading ? <Card className="grid gap-3 sm:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-zinc-100" />)}</Card> :
        error ? <Card className="flex flex-col items-start gap-3 border-red-200 bg-red-50 sm:flex-row sm:items-center sm:justify-between"><p role="alert" className="text-sm text-red-700">{error}</p><Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button></Card> :
        data?.overall.suppressed ? <Card className="border-amber-200 bg-amber-50"><div className="flex gap-3"><Users className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" /><div><CardTitle>Learner totals are temporarily hidden</CardTitle><p className="mt-1 text-sm leading-6 text-amber-800">Your combined audience is currently below {data.privacy.minimumLearners} learners, so this stays hidden to protect their privacy.</p></div></div></Card> :
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <InsightMetric label="Total learners" value={String(data?.overall.totalLearners ?? 0)} detail="Distinct employees with activity across all your courses." icon={Users} tone="from-indigo-500/20 to-indigo-500/5 text-indigo-700" />
            <InsightMetric label="Active in period" value={String(data?.overall.activeInPeriod ?? 0)} detail={`Opened or completed a lesson in the last ${days === 365 ? "12 months" : `${days} days`}.`} icon={Activity} tone="from-amber-500/20 to-amber-500/5 text-amber-700" />
            <InsightMetric label="Total completions" value={String(data?.overall.totalCompletions ?? 0)} detail="Course completions summed across all your courses." icon={CheckCircle2} tone="from-emerald-500/20 to-emerald-500/5 text-emerald-700" />
          </div>
          <Card>
            <CardTitle className="mb-3">By course</CardTitle>
            <div className="space-y-2">
              {(data?.courses ?? []).map((c) => (
                <div key={c.slug} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 p-3">
                  <span className="min-w-0 truncate text-sm font-medium text-zinc-800">{c.title}</span>
                  {c.suppressed ? (
                    <span className="text-xs text-amber-700">Hidden — fewer than {data?.privacy.minimumLearners} learners</span>
                  ) : (
                    <span className="flex items-center gap-3 text-xs text-zinc-600">
                      <span>{c.enrolled} enrolled</span><span>·</span><span>{c.active} active</span><span>·</span><span>{c.completed} completed</span>
                    </span>
                  )}
                </div>
              ))}
              {(data?.courses ?? []).length === 0 && <p className="text-sm text-zinc-500">No courses to show yet.</p>}
            </div>
          </Card>
        </>}
    </div>
  );
}

/* ---------------- Ratings (aggregate distributions only — no review text) ---------------- */

function RatingBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-10 shrink-0 text-zinc-500">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500" style={{ width: `${pct}%` }} /></div>
      <span className="w-8 shrink-0 text-right text-zinc-500">{count}</span>
    </div>
  );
}

function RatingsPanel({ items }: { items: TutorCourse[] }) {
  if (items.length === 0) return <EmptyCoursesState />;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2"><Star className="h-5 w-5 text-primary" aria-hidden="true" /><h2 className="text-lg font-bold text-zinc-900">Ratings</h2></div>
        <p className="mt-1 text-sm text-zinc-600">Star distribution and average per course. Individual review comments aren&apos;t shown to tutors, only aggregate ratings.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map(({ course, averageRating, ratingCount, ratingDistribution }) => (
          <Card key={course.slug}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <CardTitle>{course.title}</CardTitle>
              <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-zinc-800">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                {averageRating.toFixed(1)}
                <span className="font-normal text-zinc-500">({ratingCount})</span>
              </span>
            </div>
            {ratingCount === 0 ? (
              <p className="py-2 text-sm text-zinc-500">No ratings yet.</p>
            ) : (
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((rating) => (
                  <RatingBar key={rating} label={`${rating} ★`} count={distributionCount(ratingDistribution, rating)} total={ratingCount} />
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function CourseForm({ saving, onCancel, onSave }: { saving: boolean; onCancel: () => void; onSave: (course: Course) => Promise<void> }) {
  const { state } = useStore();
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState("product");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanCategory = category.trim();
    if (!cleanTitle || !cleanCategory) return;
    void onSave({
      slug: cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `course-${Date.now()}`,
      title: cleanTitle,
      tagline: tagline.trim() || "New learning path.",
      category: cleanCategory,
      level: "Beginner",
      tags: [cleanTitle],
      cover: getCategoryCover(cleanCategory),
      addedAt: new Date().toISOString().slice(0, 10),
      lessons: [],
      // Starts private — build it out on the "Publish" toggle in the editor
      // once it's ready for learners.
      published: false,
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <CardTitle>New category / course</CardTitle>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} aria-label="Close course creation">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium text-zinc-800">
          Course title
          <Input className="mt-1" placeholder="Course title (e.g. System Design)" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} />
        </label>
        <label className="block text-sm font-medium text-zinc-800">
          One-line tagline
          <Input className="mt-1" placeholder="One-line tagline" value={tagline} onChange={(event) => setTagline(event.target.value)} maxLength={400} />
        </label>
        <label className="block text-sm font-medium text-zinc-800">
          Category
          <Input
            list="tutor-new-course-categories"
            className="mt-1"
            placeholder="Pick an existing one or type a new one"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            required
            maxLength={40}
          />
          <datalist id="tutor-new-course-categories">
            {categoryOptions(state.courses).map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
        <p className="text-xs text-zinc-500">Starts as a private draft — publish it from the editor once it's ready for learners.</p>
        <Button type="submit" disabled={saving || !title.trim()} className="min-h-11">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Create course
        </Button>
      </form>
    </Card>
  );
}

/* Emails learners with recorded activity on this course about a lesson —
   tutor-scoped equivalent of the admin panel's NotifyButton. See
   /api/tutor/notify-lesson for the ownership + recipient-scoping rules. */
function TutorNotifyButton({ courseSlug, courseTitle, lesson }: { courseSlug: string; courseTitle: string; lesson: Lesson }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const notify = async () => {
    if (status === "sending") return;
    if (!confirm(`Email learners enrolled in "${courseTitle}" about "${lesson.title}"? Sent from support@requisor.io.`)) return;
    setStatus("sending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/tutor/notify-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseSlug, lessonId: lesson.id }),
      });
      const data = await res.json().catch(() => ({})) as { sent?: number; total?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't send notifications.");
      setStatus("sent");
      setErrorMsg(data.total === 0 ? "No enrolled learners to notify yet." : null);
      setTimeout(() => setStatus("idle"), 4000);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Couldn't send notifications.");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={status === "sending"}
      onClick={notify}
      aria-label={`Email learners about ${lesson.title}`}
      title={errorMsg ?? "Email enrolled learners about this lesson"}
    >
      {status === "sent" ? <Check className="h-4 w-4 text-emerald-600" /> : status === "error" ? <X className="h-4 w-4 text-red-600" /> : <Send className={cn("h-4 w-4", status === "sending" && "animate-pulse")} />}
    </Button>
  );
}

type SubmissionRow = { id: number; studentName: string; studentEmail: string; fileName: string; fileSize: number; submittedAt: string; marks: number | null; gradedAt: string | null };

function TutorSubmissionsButton({ lesson }: { lesson: Lesson }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`View submissions for ${lesson.title}`} title="View submissions">
        <Inbox className="h-4 w-4" />
      </Button>
      {open && <TutorSubmissionsPanel lesson={lesson} onClose={() => setOpen(false)} />}
    </>
  );
}

/* Roster of who has submitted a given lesson's assignment, with a link into
   the markup/grading view for each. See /api/tutor/assignment-submissions
   for why identity is shown here (grading is inherently 1:1) unlike the
   rest of this tutor-facing panel. */
function TutorSubmissionsPanel({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; submissions: SubmissionRow[] } | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tutor/assignment-submissions?lessonId=${encodeURIComponent(lesson.id)}`)
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { submissions?: SubmissionRow[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Couldn't load submissions.");
        if (!cancelled) setState({ status: "ready", submissions: data.submissions ?? [] });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Couldn't load submissions." });
      });
    return () => { cancelled = true; };
  }, [lesson.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="max-h-[80vh] w-full max-w-lg space-y-3 overflow-y-auto" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <CardTitle>Submissions — {lesson.title}</CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        {state.status === "loading" && (
          <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>
        )}
        {state.status === "error" && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
        {state.status === "ready" && state.submissions.length === 0 && (
          <p className="text-sm text-zinc-500">No submissions yet.</p>
        )}
        {state.status === "ready" && state.submissions.length > 0 && (
          <ul className="space-y-2">
            {state.submissions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">
                    {s.studentName}
                    {s.marks !== null && (
                      <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">{s.marks}%</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {s.fileName} · submitted {new Date(s.submittedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Link href={`/app/tutor/assignment/?submissionId=${s.id}`}>
                    <Button size="sm" variant={s.marks === null ? "primary" : "outline"} aria-label={`Open ${s.studentName}'s submission for grading`}>
                      {s.marks === null ? "Grade" : "Review"}
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/tutor/assignment-submissions/file?submissionId=${s.id}`, "_blank")}
                    aria-label={`Download ${s.studentName}'s submission`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function CourseEditor({ course, saving, onCancel, onSave, onAddLesson, onDeleteLesson, onDeleteCourse }: { course?: Course | null; saving: boolean; onCancel: () => void; onSave: (course: Course) => Promise<void>; onAddLesson?: (lesson: Lesson) => Promise<void>; onDeleteLesson?: (lesson: Lesson) => Promise<void>; onDeleteCourse?: () => Promise<void> }) {
  const { state } = useStore();
  const [title, setTitle] = useState(course?.title ?? ""); const [tagline, setTagline] = useState(course?.tagline ?? ""); const [category, setCategory] = useState(course?.category ?? "product"); const [level, setLevel] = useState<Course["level"]>(course?.level ?? "Beginner"); const [tags, setTags] = useState(course?.tags.join(", ") ?? ""); const [assessment, setAssessment] = useState(course?.baseAssessment ?? ""); const [published, setPublished] = useState(course?.published ?? false); const [editing, setEditing] = useState<Lesson | null>(null);
  const [lessonFormVersion, setLessonFormVersion] = useState(0);
  const [createdLesson, setCreatedLesson] = useState<{ id: string; title: string } | null>(null);
  const submit = (event: FormEvent) => { event.preventDefault(); const cleanCategory = category.trim(); if (!title.trim() || !cleanCategory) return; void onSave(course ? { ...course, title: title.trim(), tagline: tagline.trim(), category: cleanCategory, level, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), baseAssessment: assessment.trim() || undefined, cover: getCategoryCover(cleanCategory), published } : { slug: title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `course-${Date.now()}`, title: title.trim(), tagline: tagline.trim() || "New learning path.", category: cleanCategory, level, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), cover: getCategoryCover(cleanCategory), addedAt: new Date().toISOString().slice(0, 10), lessons: [], baseAssessment: assessment.trim() || undefined, published }); };
  return <Card className="space-y-4"><div className="flex items-center justify-between"><CardTitle>{course ? `Edit ${course.title}` : "New course"}</CardTitle><Button size="sm" variant="ghost" onClick={onCancel}>Close</Button></div><form onSubmit={submit} className="grid gap-3 sm:grid-cols-2"><Field label="Course title"><Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} /></Field><Field label="Tagline"><Input value={tagline} onChange={(e) => setTagline(e.target.value)} required maxLength={400} /></Field><Field label="Category"><Input list="tutor-editor-category-options" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Pick an existing one or type a new one" required maxLength={40} /><datalist id="tutor-editor-category-options">{categoryOptions(state.courses).map((c) => <option key={c} value={c} />)}</datalist></Field><Field label="Level"><Select value={level} onChange={(e) => setLevel(e.target.value as Course["level"])}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></Select></Field><Field label="Tags (comma separated)"><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field><Field label="Base assessment"><Textarea value={assessment} onChange={(e) => setAssessment(e.target.value)} maxLength={5000} /></Field><label className="flex items-center gap-2 text-sm font-medium text-zinc-800 sm:col-span-2"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 accent-primary" />Published — visible to learners{!published && <span className="font-normal text-zinc-500">(currently a private draft)</span>}</label><div className="flex items-end gap-2"><Button type="submit" disabled={saving} className="min-h-11">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save course</Button>{course && onDeleteCourse && <Button type="button" variant="danger" disabled={saving} onClick={() => void onDeleteCourse()} aria-label={`Delete ${course.title}`}><Trash2 className="h-4 w-4" /></Button>}</div></form>
    {course && onAddLesson && <section className="border-t pt-4"><h2 className="font-semibold text-zinc-900">Lessons</h2><AnimatePresence>{createdLesson && <motion.div role="status" aria-live="polite" initial={{ opacity: 0, y: -8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"><motion.span initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 24 }} className="inline-flex rounded-full bg-emerald-600 p-1 text-white"><Check className="h-3.5 w-3.5" aria-hidden="true" /></motion.span>“{createdLesson.title}” was added. The lesson list and form are refreshed.</motion.div>}</AnimatePresence><ul className="mt-2 space-y-2">{course.lessons.map((lesson) => <motion.li key={lesson.id} initial={lesson.id === createdLesson?.id ? { opacity: 0, y: 12, backgroundColor: "rgb(209 250 229)" } : false} animate={{ opacity: 1, y: 0, backgroundColor: "rgb(255 255 255)" }} transition={{ duration: .45 }} className="flex items-center justify-between rounded-xl border p-3 text-sm"><span>{lesson.title}</span><span className="flex gap-1">{lesson.format !== "reading" && !isPlaceholder(lesson.youtubeId) && <TutorNotifyButton courseSlug={course.slug} courseTitle={course.title} lesson={lesson} />}{lesson.requiresSubmission && <TutorSubmissionsButton lesson={lesson} />}<Button size="sm" variant="ghost" disabled={saving} onClick={() => { setCreatedLesson(null); setEditing(lesson); }} aria-label={`Edit ${lesson.title}`}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" disabled={saving} onClick={() => void onDeleteLesson?.(lesson)} aria-label={`Delete ${lesson.title}`}><Trash2 className="h-4 w-4 text-red-600" /></Button></span></motion.li>)}</ul><LessonEditor key={`${editing?.id ?? "new"}-${lessonFormVersion}`} courseSlug={course.slug} lesson={editing} saving={saving} onCancel={() => setEditing(null)} onSave={async (lesson) => { const isNew = !editing; setCreatedLesson(null); await onAddLesson(lesson); if (isNew) { setCreatedLesson({ id: lesson.id, title: lesson.title }); setLessonFormVersion((version) => version + 1); } setEditing(null); }} /></section>}
  </Card>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-sm font-medium text-zinc-800">{label}{children}</label>; }
function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className="focus-ring mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm">{children}</select>; }
function LessonEditor({ courseSlug, lesson, saving, onCancel, onSave }: { courseSlug: string; lesson: Lesson | null; saving: boolean; onCancel: () => void; onSave: (lesson: Lesson) => Promise<void> }) {
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [description, setDescription] = useState(lesson?.description ?? "");
  const [format, setFormat] = useState<"video" | "reading">(lesson?.format ?? "video");
  const [youtubeId, setYoutubeId] = useState(lesson?.youtubeId === "REPLACE_ME" ? "" : lesson?.youtubeId ?? "");
  const [duration, setDuration] = useState(String(lesson?.durationMin ?? 20));
  const [section, setSection] = useState(lesson?.section ?? "");
  const [assignment, setAssignment] = useState(lesson?.assignment ?? "");
  const [requiresSubmission, setRequiresSubmission] = useState(lesson?.requiresSubmission ?? false);
  const [takeaways, setTakeaways] = useState(lesson?.keyTakeaways.join("\n") ?? "");
  const [resources, setResources] = useState<Resource[]>(lesson?.resources ?? []);
  const [body, setBody] = useState(lesson?.body ?? "");
  const [bodyFileUrl, setBodyFileUrl] = useState(lesson?.bodyFileUrl);
  const [uploading, setUploading] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);
  const detectedVideoId = format === "video" && youtubeId.trim() ? extractYouTubeId(youtubeId) : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const finalResources = resources.map((resource) => {
        const label = resource.label.trim();
        if (!label) throw new Error("Each resource needs a label.");
        if (resource.type === "file") return { ...resource, label };
        const url = resource.url.trim();
        if (!url || (url !== "#" && !/^https:\/\//i.test(url))) throw new Error("Each link resource needs an https:// URL.");
        return { ...resource, label, url };
      });
      if (format === "video" && youtubeId.trim() && !detectedVideoId) throw new Error("Paste a valid YouTube URL or 11-character video ID.");
      setFormError(null);
      void onSave({
        id: lesson?.id ?? `${courseSlug}-${Date.now()}`,
        title: title.trim(), description: description.trim(), format,
        youtubeId: format === "reading" ? "" : detectedVideoId ?? PLACEHOLDER_VIDEO,
        durationMin: Math.min(1440, Math.max(1, Math.round(Number(duration) || 20))),
        section: section.trim() || undefined, assignment: assignment.trim() || undefined, requiresSubmission,
        keyTakeaways: takeaways.split("\n").map((item) => item.trim()).filter(Boolean),
        resources: finalResources,
        body: format === "reading" && body.trim() ? body.trim() : undefined,
        bodyFileUrl: format === "reading" && !body.trim() ? bodyFileUrl : undefined,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Check the lesson details.");
    }
  }

  return <form onSubmit={submit} className="mt-3 grid gap-3 rounded-xl bg-zinc-50 p-3 sm:grid-cols-2">
    <Field label="Lesson title"><Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} /></Field>
    <Field label="Format"><Select value={format} onChange={(e) => setFormat(e.target.value as "video" | "reading")}><option value="video">Video</option><option value="reading">Reading</option></Select></Field>
    <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={2000} /></Field>
    <Field label="Duration (minutes)"><Input type="number" min="1" max="1440" step="1" value={duration} onChange={(e) => setDuration(e.target.value)} required /></Field>
    {format === "video" && <Field label="YouTube URL or video ID"><Input value={youtubeId} onChange={(e) => { setYoutubeId(e.target.value); setFormError(null); }} placeholder="Paste a YouTube URL or video ID" maxLength={2048} aria-invalid={Boolean(youtubeId.trim() && !detectedVideoId)} />{youtubeId.trim() && !detectedVideoId && <span className="mt-1 block text-xs text-red-700">Enter a valid YouTube URL or 11-character video ID.</span>}{detectedVideoId && <span className="mt-2 flex items-center gap-2 text-xs text-emerald-800"><img src={youTubeThumb(detectedVideoId)} alt="" className="h-9 w-16 rounded object-cover" />Video detected and ready to embed.</span>}</Field>}
    <Field label="Section"><Input value={section} onChange={(e) => setSection(e.target.value)} maxLength={200} /></Field>
    <Field label="Assignment"><Textarea value={assignment} onChange={(e) => setAssignment(e.target.value)} maxLength={5000} /></Field>
    {format === "reading" && <div className="sm:col-span-2"><LessonContentField body={body} bodyFileUrl={bodyFileUrl} uploading={uploading} setUploading={setUploading} onChange={({ body: nextBody, bodyFileUrl: nextUrl }) => { setBody(nextBody); setBodyFileUrl(nextUrl); }} /></div>}
    <div className="sm:col-span-2 space-y-2"><label className="flex items-center gap-2 text-sm font-medium text-zinc-800"><input type="checkbox" checked={requiresSubmission} onChange={(e) => setRequiresSubmission(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 accent-primary" />Require a submitted assignment from learners{requiresSubmission && <span className="font-normal text-zinc-500">(the text above shows as their assignment brief)</span>}</label>{requiresSubmission && lesson && <Button type="button" size="sm" variant="outline" onClick={() => setRubricOpen(true)}><ListChecks className="h-3.5 w-3.5" />Grading rubric</Button>}{requiresSubmission && !lesson && <p className="text-xs text-zinc-500">Save this lesson first to set up a grading rubric.</p>}</div>
    <Field label="Key takeaways (one per line)"><Textarea value={takeaways} onChange={(e) => setTakeaways(e.target.value)} /></Field>
    <div className="sm:col-span-2"><ResourcesField resources={resources} onChange={setResources} uploading={uploading} setUploading={setUploading} error={resourceError} setError={setResourceError} /></div>
    {formError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{formError}</p>}
    <div className="flex gap-2"><Button type="submit" disabled={saving || uploading || !title.trim() || !description.trim() || Boolean(youtubeId.trim() && !detectedVideoId)} className="min-h-11">{(saving || uploading) && <Loader2 className="h-4 w-4 animate-spin" />}{lesson ? "Save lesson" : "Add lesson"}</Button>{lesson && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}</div>
    {rubricOpen && lesson && <RubricEditorPanel lesson={lesson} onClose={() => setRubricOpen(false)} />}
  </form>;
}

function LessonContentField({ body, bodyFileUrl, uploading, setUploading, onChange }: {
  body: string; bodyFileUrl?: string; uploading: boolean; setUploading: (value: boolean) => void;
  onChange: (value: { body: string; bodyFileUrl?: string }) => void;
}) {
  const [mode, setMode] = useState<"write" | "document">(bodyFileUrl ? "document" : "write");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file?: File) {
    if (!file) return;
    const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (![".pdf", ".txt"].includes(extension)) { setError("Only PDF or TXT files can be viewed inline."); return; }
    if (file.size > MAX_RESOURCE_FILE_BYTES) { setError("File is larger than 10 MB."); return; }
    setUploading(true); setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/tutor/resources-files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, dataUrl }) });
      const data = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Couldn't upload the file.");
      onChange({ body: "", bodyFileUrl: data.url });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't upload the file.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return <div className="space-y-2">
    <span className="text-sm font-medium text-zinc-800">Lesson content</span>
    <div className="flex w-fit gap-1 rounded-xl bg-zinc-100 p-1 text-xs font-medium">
      <button type="button" onClick={() => { setMode("write"); onChange({ body, bodyFileUrl: undefined }); }} className={cn("rounded-lg px-3 py-1.5", mode === "write" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600")}>Write content</button>
      <button type="button" onClick={() => { setMode("document"); onChange({ body: "", bodyFileUrl }); }} className={cn("rounded-lg px-3 py-1.5", mode === "document" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600")}>Attach document</button>
    </div>
    {mode === "write" ? <Textarea value={body} onChange={(e) => onChange({ body: e.target.value, bodyFileUrl: undefined })} placeholder="Write the lesson content here…" className="min-h-[160px]" maxLength={20000} /> :
      <div className="flex items-center gap-2">{bodyFileUrl ? <><FileText className="h-4 w-4 text-primary" /><a href={bodyFileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">View attached document</a><Button type="button" size="icon" variant="ghost" onClick={() => onChange({ body: "", bodyFileUrl: undefined })} aria-label="Remove document"><X className="h-4 w-4" /></Button></> : <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Attach PDF or TXT</Button>}<input ref={inputRef} type="file" accept=".pdf,.txt" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} /></div>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}

function ResourcesField({ resources, onChange, uploading, setUploading, error, setError }: {
  resources: Resource[]; onChange: (resources: Resource[]) => void; uploading: boolean; setUploading: (value: boolean) => void; error: string | null; setError: (value: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const atLimit = resources.length >= 20;
  function update(index: number, patch: Partial<Resource>) { onChange(resources.map((resource, i) => i === index ? { ...resource, ...patch } : resource)); }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null); setUploading(true);
    try {
      let next = resources;
      for (const file of Array.from(files).slice(0, 20 - resources.length)) {
        const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
        if (!RESOURCE_FILE_ACCEPT.split(",").includes(extension)) throw new Error(`"${file.name}" isn't a supported file type.`);
        if (file.size > MAX_RESOURCE_FILE_BYTES) throw new Error(`"${file.name}" is larger than 10 MB.`);
        const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read file.")); reader.readAsDataURL(file); });
        const response = await fetch("/api/tutor/resources-files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, dataUrl }) });
        const data = await response.json().catch(() => ({})) as { url?: string; error?: string };
        if (!response.ok || !data.url) throw new Error(data.error ?? `Couldn't upload "${file.name}".`);
        next = [...next, { label: file.name, url: data.url, type: "file" }];
        onChange(next);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't upload the file."); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }
  return <div className="space-y-2"><span className="text-sm font-medium text-zinc-800">Resources</span>
    {resources.map((resource, index) => <div key={index} className="flex items-center gap-2 rounded-xl border border-border bg-white p-2">{resource.type === "file" ? <><Paperclip className="h-4 w-4 shrink-0 text-primary" /><Input value={resource.label} onChange={(e) => update(index, { label: e.target.value })} maxLength={200} className="h-8 flex-1" /></> : <><Input value={resource.label} onChange={(e) => update(index, { label: e.target.value })} placeholder="Label" maxLength={200} className="h-8 sm:w-32" /><Input value={resource.url} onChange={(e) => update(index, { url: e.target.value })} placeholder="https://…" maxLength={2048} className="h-8 flex-1" /><select value={resource.type} onChange={(e) => update(index, { type: e.target.value as "link" | "pdf" })} className="focus-ring h-8 rounded-lg border border-border bg-white px-2 text-xs"><option value="link">Link</option><option value="pdf">PDF</option></select></>}<Button type="button" size="icon" variant="ghost" onClick={() => onChange(resources.filter((_, i) => i !== index))} aria-label={`Remove ${resource.label || "resource"}`}><X className="h-4 w-4" /></Button></div>)}
    <div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={() => !atLimit && onChange([...resources, { label: "", url: "", type: "link" }])} disabled={atLimit}><Plus className="h-3.5 w-3.5" />Add link</Button><Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={atLimit || uploading}>{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Attach file</Button><input ref={inputRef} type="file" multiple accept={RESOURCE_FILE_ACCEPT} className="hidden" onChange={(e) => void upload(e.target.files)} /><span className="text-xs text-zinc-500">PDF, TXT, Word, PowerPoint, Excel, or images · up to 10 MB · {resources.length}/20</span></div>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}

type RubricCriterionDraft = { id?: number; title: string; description: string; maxPoints: string };

/* A lesson's grading rubric — set up once, applied to every submission for
   that lesson (see grading in app/app/tutor/assignment/page.tsx). Kept as
   its own save action, independent of the lesson form's own save/revision
   flow, since a rubric edit shouldn't be entangled with course optimistic
   concurrency. */
function RubricEditorPanel({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ready" } | { status: "error"; message: string }>({ status: "loading" });
  const [criteria, setCriteria] = useState<RubricCriterionDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tutor/assignment-submissions/rubric?lessonId=${encodeURIComponent(lesson.id)}`)
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { criteria?: { id: number; title: string; description: string | null; maxPoints: number }[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Couldn't load the rubric.");
        if (!cancelled) {
          setCriteria((data.criteria ?? []).map((c) => ({ id: c.id, title: c.title, description: c.description ?? "", maxPoints: String(c.maxPoints) })));
          setState({ status: "ready" });
        }
      })
      .catch((error) => { if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Couldn't load the rubric." }); });
    return () => { cancelled = true; };
  }, [lesson.id]);

  const totalPoints = criteria.reduce((sum, c) => sum + (Number(c.maxPoints) || 0), 0);

  function updateCriterion(index: number, patch: Partial<RubricCriterionDraft>) {
    setCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }
  function removeCriterion(index: number) {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  }
  function addCriterion() {
    setCriteria((prev) => [...prev, { title: "", description: "", maxPoints: "10" }]);
  }

  async function save() {
    const cleaned = criteria.map((c) => ({ ...c, title: c.title.trim() }));
    if (cleaned.some((c) => !c.title || !(Number(c.maxPoints) > 0))) {
      setSaveError("Every criterion needs a title and a max points value greater than 0.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/tutor/assignment-submissions/rubric", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          criteria: cleaned.map((c) => ({ id: c.id, title: c.title, description: c.description.trim() || undefined, maxPoints: Number(c.maxPoints) })),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { criteria?: { id: number; title: string; description: string | null; maxPoints: number }[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn't save the rubric.");
      setCriteria((data.criteria ?? []).map((c) => ({ id: c.id, title: c.title, description: c.description ?? "", maxPoints: String(c.maxPoints) })));
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Couldn't save the rubric.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="max-h-[85vh] w-full max-w-xl space-y-3 overflow-y-auto" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <CardTitle>Grading rubric — {lesson.title}</CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <p className="text-xs text-zinc-500">
          Leave this empty to grade the old way, with a single 0-100 mark. Add criteria to score each submission against a rubric instead — the total becomes the mark.
        </p>
        {state.status === "loading" && <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>}
        {state.status === "error" && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
        {state.status === "ready" && (
          <>
            <ul className="space-y-2">
              {criteria.map((c, i) => (
                <li key={c.id ?? `new-${i}`} className="space-y-2 rounded-xl border p-3">
                  <div className="flex gap-2">
                    <Input placeholder="Criterion (e.g. Structure)" value={c.title} onChange={(e) => updateCriterion(i, { title: e.target.value })} maxLength={200} className="flex-1" />
                    <Input type="number" min={1} max={1000} placeholder="Points" value={c.maxPoints} onChange={(e) => updateCriterion(i, { maxPoints: e.target.value })} className="w-24" aria-label="Max points" />
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeCriterion(i)} aria-label={`Remove ${c.title || "criterion"}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                  </div>
                  <Textarea placeholder="What earns full marks here? (optional)" value={c.description} onChange={(e) => updateCriterion(i, { description: e.target.value })} className="min-h-[50px] text-sm" maxLength={1000} />
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between">
              <Button type="button" size="sm" variant="outline" onClick={addCriterion}><Plus className="h-3.5 w-3.5" />Add criterion</Button>
              {criteria.length > 0 && <p className="text-sm text-zinc-600">Total: {totalPoints} points</p>}
            </div>
            {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="button" onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save rubric</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
