"use client";

import { FormEvent, ReactNode, SelectHTMLAttributes, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, BarChart3, BookPlus, Check, CheckCircle2, Download, Eye, EyeOff, FileText, GraduationCap, Inbox, LayoutGrid, Paperclip, Upload,
  ListChecks, Loader2, Pencil, Plus, Send, Star, Trash2, TrendingUp, Users, X,BookOpen, ChevronDown, ChevronLeft, ChevronRight, Clock, Layers, Sparkles, Video, Youtube
} from "lucide-react";
import { RecordStudio } from "@/components/video-recorder";
import { SyllabusPanel } from "@/components/syllabus-editor";
import { isLessonScheduled } from "@/lib/utils";
import { DATA_CHANGED_EVENT } from "@/components/assistant-action-card";
import { useStore } from "@/lib/store";
import { Course, Lesson, Resource } from "@/lib/types";
import { cn, extractYouTubeId, isPlaceholder, PLACEHOLDER_VIDEO, youTubeThumb } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { parseCanvasCartridge, type CanvasImportSummary } from "@/lib/canvas-import";
import { courseFolderToZip, MAX_COURSE_IMPORT_BYTES } from "@/lib/course-folder-import";
import { Input, Textarea } from "@/components/ui/input";
import { PageTransition } from "@/components/motion";
import { getCategoryCover, DEFAULT_CATEGORIES } from "@/components/category-icon";
import { MAX_RESOURCE_FILE_BYTES, RESOURCE_FILE_ACCEPT } from "@/lib/resource-files";
import { mergeSavedTutorCourse, reconcileTutorCourses, type TutorCourseSummary } from "@/lib/tutor-course-sync";
import { SubmissionSourceBadge } from "@/components/submission-source-badge";
import type { SubmissionSource } from "@/lib/submission-source";

type TabKey = "analytics" | "courses" | "learners" | "ratings";
type TutorCourse = TutorCourseSummary;
const AI_COURSE_DRAFT_KEY = "requisor-ai-course-draft";
const AI_COURSE_DRAFT_EVENT = "requisor:open-ai-course-draft";

const springTab = { type: "spring" as const, stiffness: 500, damping: 35 };

type ImportState =
  | { status: "idle" }
  | { status: "importing" }
  | { status: "error"; message: string }
  | { status: "summary"; summary: CanvasImportSummary };

function ImportCourseButton({ onImported }: { onImported: (course: Course) => void | Promise<void> }) {
  const [state, setState] = useState<ImportState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  async function applyImport(payload: unknown) {
    const response = await fetch("/api/tutor/courses/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({})) as { course?: Course; error?: string };
    if (!response.ok || !result.course) throw new Error(result.error || "Couldn't import the course.");
    await onImported(result.course);
  }

  async function handleFile(file: File) {
    setState({ status: "importing" });
    const isCanvas = /\.(imscc|zip)$/i.test(file.name);
    try {
      if (file.size > MAX_COURSE_IMPORT_BYTES) throw new Error("Course import files must be 200 MB or smaller.");
      if (isCanvas) {
        const { payload, summary } = await parseCanvasCartridge(await file.arrayBuffer());
        await applyImport(payload);
        setState({ status: "summary", summary });
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(await file.text());
        } catch {
          throw new Error("That doesn't look like a valid export file.");
        }
        await applyImport(parsed);
        setState({ status: "idle" });
      }
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Couldn't import the course." });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleFolder(files: FileList) {
    setState({ status: "importing" });
    try {
      const archive = await courseFolderToZip(files);
      const { payload, summary } = await parseCanvasCartridge(archive);
      await applyImport(payload);
      setState({ status: "summary", summary });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Couldn't import the course folder." });
    } finally {
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json,.imscc,.zip"
        className="sr-only"
        aria-label="Import course JSON file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="sr-only"
        aria-label="Import extracted course folder"
        {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={(event) => { if (event.target.files?.length) void handleFolder(event.target.files); }}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={state.status === "importing"} onClick={() => inputRef.current?.click()}>
          {state.status === "importing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Import file
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={state.status === "importing"} onClick={() => folderInputRef.current?.click()}>
          Import folder
        </Button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="absolute right-0 top-full z-10 mt-1 w-64 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {state.message}
        </p>
      )}
       {state.status === "summary" && <CanvasImportSummaryPanel summary={state.summary} onClose={() => setState({ status: "idle" })} />}
    </div>
  );
}

function CanvasImportSummaryPanel({ summary, onClose }: { summary: CanvasImportSummary; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="max-h-[80vh] w-full max-w-lg space-y-3 overflow-y-auto text-left" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <CardTitle>Imported "{summary.courseTitle}"</CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <p className="text-sm text-zinc-700">{summary.lessonCount} lesson{summary.lessonCount === 1 ? "" : "s"} imported as a draft — review before publishing.</p>

        {summary.rubricsFound.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">{summary.rubricsFound.length} rubric{summary.rubricsFound.length === 1 ? "" : "s"} found in this export</p>
            <p className="mt-1 text-xs text-amber-800">Canvas doesn&apos;t export which assignment a rubric belongs to, so these weren&apos;t attached automatically — set them up per-lesson from the Grading rubric editor if you want them.</p>
            <ul className="mt-2 space-y-1 text-xs text-amber-800">
              {summary.rubricsFound.map((r, i) => <li key={i}>• {r.title} — {r.criteriaCount} criteria, {r.totalPoints} points</li>)}
            </ul>
          </div>
        )}

        {summary.skippedItems.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-sm font-medium text-zinc-800">{summary.skippedItems.length} item{summary.skippedItems.length === 1 ? "" : "s"} skipped</p>
            <p className="mt-1 text-xs text-zinc-500">Quizzes, discussions, files, and instructor-only content have no equivalent in Requisor.</p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-zinc-600">
              {summary.skippedItems.map((item, i) => <li key={i} className="truncate">• {item.title} — {item.reason}</li>)}
            </ul>
          </div>
        )}

        <Button size="sm" onClick={onClose}>Done</Button>
      </Card>
    </div>
  );
}

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
  const [aiDraft, setAiDraft] = useState(false);
  const [aiDraftVersion, setAiDraftVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [analyticsSlug, setAnalyticsSlug] = useState<string | null>(null);

  const load = useCallback(async (selectedSlug?: string | null) => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/tutor/courses");
      const data = await response.json().catch(() => ({})) as { courses?: TutorCourse[]; error?: string };
      if (!response.ok || !Array.isArray(data.courses)) throw new Error(data.error ?? "Couldn't load your courses.");
      const reconciled = reconcileTutorCourses(data.courses, selectedSlug);
      setItems(reconciled.items);
      if (selectedSlug !== undefined) setSelected(reconciled.selected);
      setAnalyticsSlug((prev) => prev && data.courses!.some((i) => i.course.slug === prev) ? prev : data.courses![0]?.course.slug ?? null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't load your courses.");
      return false;
    } finally { setLoading(false); }
  }, []);

  // When the AI assistant changes a course (after the tutor confirms), reload
  // so this screen — and the open course's revision — stays current.
  const selectedSlugRef = useRef<string | null>(null);
  useEffect(() => { selectedSlugRef.current = selected?.slug ?? null; }, [selected]);
  useEffect(() => {
    const reload = () => void load(selectedSlugRef.current ?? undefined);
    window.addEventListener(DATA_CHANGED_EVENT, reload);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, reload);
  }, [load]);

  useEffect(() => {
    if (hydrated && state.user && state.user.role !== "tutor" && state.user.role !== "admin") router.replace("/app/dashboard/");
  }, [hydrated, router, state.user]);
  useEffect(() => { if (hydrated && state.user && (state.user.role === "tutor" || state.user.role === "admin")) void load(); }, [hydrated, state.user, load]);
  useEffect(() => {
    if (!hydrated || state.user?.role !== "tutor") return;
    const openDraft = (value: unknown) => {
      try {
      const course = value as Course;
      if (!course || typeof course !== "object" || !course.slug || !Array.isArray(course.lessons)) throw new Error("invalid");
      setTab("courses");
      setCreating(false);
      setAiDraft(true);
      setAiDraftVersion((version) => version + 1);
      setSelected({ ...course, published: false });
      sessionStorage.removeItem(AI_COURSE_DRAFT_KEY);
    } catch {
      setError("The AI course draft could not be opened. Please generate it again.");
    }
    };
    const onDraft = (event: Event) => openDraft((event as CustomEvent<unknown>).detail);
    window.addEventListener(AI_COURSE_DRAFT_EVENT, onDraft);
    try {
      const stored = sessionStorage.getItem(AI_COURSE_DRAFT_KEY);
      if (stored) openDraft(JSON.parse(stored));
    } catch {
      sessionStorage.removeItem(AI_COURSE_DRAFT_KEY);
      setError("The AI course draft could not be opened. Please generate it again.");
    }
    return () => window.removeEventListener(AI_COURSE_DRAFT_EVENT, onDraft);
  }, [hydrated, state.user?.role]);

  if (!hydrated || !state.user || (state.user.role !== "tutor" && state.user.role !== "admin")) return null;
  const saveCourse = async (course: Course) => {
    setSaving(true); setError(null);
    try {
      const saved = await upsertCourse(course);
      const refreshed = await load(saved.slug);
      setCreating(false);
      setAiDraft(false);
      if (!refreshed) {
        setItems((current) => mergeSavedTutorCourse(current, saved));
        setSelected(saved);
      }
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't save the course."); }
    finally { setSaving(false); }
  };
  const updateLessons = async (lesson: Lesson, remove = false): Promise<boolean> => {
    if (!selected) return false;
    setSaving(true); setError(null);
    try {
      const updated = remove
        ? await deleteLesson(selected.slug, lesson.id, selected)
        : await upsertLesson(selected.slug, lesson, selected);
      const refreshed = await load(updated.slug);
      if (!refreshed) {
        setItems((current) => mergeSavedTutorCourse(current, updated));
        setSelected(updated);
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save the lesson.");
      return false;
    }
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
                <div className="flex justify-end gap-2">
                  <ImportCourseButton onImported={async (course) => { setCreating(false); setSelected(course); await load(); }} />

                <Button className="min-h-11" onClick={() => { setSelected(null); setAiDraft(false); setCreating(true); }}><Plus className="h-4 w-4" /> Create course</Button>
              </div>
              {creating && <CourseForm saving={saving} onCancel={() => setCreating(false)} onSave={saveCourse} />}
              {loading ? <Card className="flex items-center gap-2 py-10 text-sm text-zinc-600"><Loader2 className="h-5 w-5 animate-spin" /> Loading your courses…</Card> :
                items.length === 0 ? <EmptyCoursesState /> :
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <button key={item.course.slug} onClick={() => { setCreating(false); setAiDraft(false); setSelected(item.course); }} className="focus-ring group min-h-32 rounded-2xl text-left"><Card className="relative h-full transition hover:border-primary/40">{item.course.published === false && <span className="absolute left-3 top-3 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">Draft</span>}<span className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-transparent px-2 py-1 text-[11px] font-medium text-zinc-400 opacity-0 transition group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary group-hover:opacity-100"><Pencil className="h-3 w-3" aria-hidden="true" />Edit</span><div className={`mb-3 h-2 rounded-full bg-gradient-to-r ${item.course.cover}`} /><CardTitle>{item.course.title}</CardTitle><p className="mt-1 text-xs text-zinc-600">{item.course.lessons.length} lessons · <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />{item.averageRating.toFixed(1)} ({item.ratingCount})</span></p><div className="mt-3 flex gap-1" aria-hidden="true">{[5,4,3,2,1].map((rating) => <span key={rating} title={`${rating} stars: ${distributionCount(item.ratingDistribution, rating)}`} className="h-1 flex-1 rounded bg-primary/20" style={{ opacity: item.ratingCount ? Math.max(.2, distributionCount(item.ratingDistribution, rating) / item.ratingCount) : .2 }} />)}</div><span className="sr-only">{[5,4,3,2,1].map((rating) => `${rating} stars: ${distributionCount(item.ratingDistribution, rating)}`).join(", ")}</span></Card></button>)}</div>}
              {selected && <>
                {aiDraft && <div role="status" className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900"><strong>AI-generated draft:</strong> Review every field and lesson below. It is unpublished and has not been saved yet.</div>}
                {!aiDraft && (
                  <CourseVisibilityBanner
                    course={selected}
                    saving={saving}
                    onChange={(published) => void saveCourse({ ...selected, published })}
                  />
                )}
                {!aiDraft && (
                  <SyllabusPanel
                    key={`syllabus-${selected.slug}`}
                    course={selected}
                    onSaved={(syllabus) => {
                      // Keep the open course and the course list in step, without a reload.
                      setSelected((current) => (current && current.slug === selected.slug ? { ...current, syllabus } : current));
                      setItems((list) => list.map((item) => (item.course.slug === selected.slug ? { ...item, course: { ...item.course, syllabus } } : item)));
                    }}
                  />
                )}
                <CourseEditor
                  key={`${selected.slug}-${aiDraft ? `ai-${aiDraftVersion}` : `saved-${selected.revision ?? 0}`}`}
                  course={selected}
                  saving={saving}
                  onCancel={() => { setSelected(null); setAiDraft(false); }}
                  onSave={saveCourse}
                  allowUploads={!aiDraft}
                  onAddLesson={aiDraft ? async (lesson) => { setSelected((current) => current ? { ...current, lessons: [...current.lessons.filter((item) => item.id !== lesson.id), lesson] } : current); return true; } : updateLessons}
                  onDeleteLesson={aiDraft ? async (lesson) => { setSelected((current) => current ? { ...current, lessons: current.lessons.filter((item) => item.id !== lesson.id) } : current); return true; } : (lesson) => updateLessons(lesson, true)}
                  onDeleteCourse={aiDraft ? undefined : async () => { if (!confirm(`Delete "${selected.title}"?`)) return; setSaving(true); try { await deleteCourse(selected.slug); setSelected(null); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't delete the course."); } finally { setSaving(false); } }}
                />
              </>}
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

/** Makes a course's visibility unmissable. New courses start as private
 *  drafts, and the only other publish control is a checkbox deep in the
 *  course form, so tutors could believe a course was live when it wasn't. */
/** A Date as a datetime-local input value, in the browser's time zone. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const formatLaunch = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function CourseVisibilityBanner({ course, saving, onChange }: { course: Course; saving: boolean; onChange: (published: boolean) => void }) {
  if (course.published === false) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="font-semibold text-amber-900">Draft — students can&apos;t see this course yet</p>
            <p className="mt-0.5 text-sm text-amber-800">
              Only you can see it here. Publish it to make it and its {course.lessons.length} lesson{course.lessons.length === 1 ? "" : "s"} visible to all students.
            </p>
          </div>
        </div>
        <Button className="shrink-0" onClick={() => onChange(true)} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Publish to all students
        </Button>
      </div>
    );
  }
  return (
    <div role="status" className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-2 text-sm text-emerald-900">
        <Eye className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        <span><strong>Live</strong> — visible to all students. Changes you save appear for them right away.</span>
      </p>
      <Button size="sm" variant="ghost" className="shrink-0 text-emerald-800" onClick={() => onChange(false)} disabled={saving}>
        <EyeOff className="h-3.5 w-3.5" />
        Unpublish
      </Button>
    </div>
  );
}

type SubmissionRow = { id: number; studentName: string; studentEmail: string; fileName: string; fileSize: number; submittedAt: string; marks: number | null; gradedAt: string | null; source: SubmissionSource };

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
                  <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-medium text-zinc-900">
                    <span className="truncate">{s.studentName}</span>
                    <SubmissionSourceBadge source={s.source} />
                    {s.marks !== null && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">{s.marks}%</span>
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

const DURATION_PRESETS = [5, 10, 15, 20, 30, 45, 60];

function CourseEditor({ course, saving, onCancel, onSave, onAddLesson, onDeleteLesson, onDeleteCourse, allowUploads = true }: { course?: Course | null; saving: boolean; onCancel: () => void; onSave: (course: Course) => Promise<void>; onAddLesson?: (lesson: Lesson) => Promise<boolean>; onDeleteLesson?: (lesson: Lesson) => Promise<boolean>; onDeleteCourse?: () => Promise<void>; allowUploads?: boolean }) {
  const { state } = useStore();
  const [title, setTitle] = useState(course?.title ?? ""); const [tagline, setTagline] = useState(course?.tagline ?? ""); const [category, setCategory] = useState(course?.category ?? "product"); const [level, setLevel] = useState<Course["level"]>(course?.level ?? "Beginner"); const [tags, setTags] = useState(course?.tags.join(", ") ?? ""); const [assessment, setAssessment] = useState(course?.baseAssessment ?? ""); const [published, setPublished] = useState(course?.published ?? false);
  const submit = (event: FormEvent) => { event.preventDefault(); const cleanCategory = category.trim(); if (!title.trim() || !cleanCategory) return; void onSave(course ? { ...course, title: title.trim(), tagline: tagline.trim(), category: cleanCategory, level, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), baseAssessment: assessment.trim() || undefined, cover: getCategoryCover(cleanCategory), published } : { slug: title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `course-${Date.now()}`, title: title.trim(), tagline: tagline.trim() || "New learning path.", category: cleanCategory, level, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), cover: getCategoryCover(cleanCategory), addedAt: new Date().toISOString().slice(0, 10), lessons: [], baseAssessment: assessment.trim() || undefined, published }); };
    return <Card className="space-y-4"><div className="flex items-center justify-between"><CardTitle>{course ? `Edit ${course.title}` : "New course"}</CardTitle><div className="flex gap-1">{course && <Button type="button" size="sm" variant="outline" onClick={() => window.open(`/api/courses/export?slug=${encodeURIComponent(course.slug)}`, "_blank")}><Download className="h-3.5 w-3.5" />Export ZIP</Button>}<Button size="sm" variant="ghost" onClick={onCancel}>Close</Button></div></div><form onSubmit={submit} className="grid gap-3 sm:grid-cols-2"><Field label="Course title"><Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} /></Field><Field label="Tagline"><Input value={tagline} onChange={(e) => setTagline(e.target.value)} required maxLength={400} /></Field><Field label="Category"><Input list="tutor-editor-category-options" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Pick an existing one or type a new one" required maxLength={40} /><datalist id="tutor-editor-category-options">{categoryOptions(state.courses).map((c) => <option key={c} value={c} />)}</datalist></Field><Field label="Level"><Select value={level} onChange={(e) => setLevel(e.target.value as Course["level"])}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></Select></Field><Field label="Tags (comma separated)"><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field><Field label="Base assessment"><Textarea value={assessment} onChange={(e) => setAssessment(e.target.value)} maxLength={5000} /></Field><label className="flex items-center gap-2 text-sm font-medium text-zinc-800 sm:col-span-2"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 accent-primary" />Published — visible to learners{!published && <span className="font-normal text-zinc-500">(currently a private draft)</span>}</label><div className="flex items-end gap-2"><Button type="submit" disabled={saving} className="min-h-11">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save course</Button>{course && onDeleteCourse && <Button type="button" variant="danger" disabled={saving} onClick={() => void onDeleteCourse()} aria-label={`Delete ${course.title}`}><Trash2 className="h-4 w-4" /></Button>}</div></form>
    {course && onAddLesson && <LessonsSection course={course} saving={saving} onAddLesson={onAddLesson} onDeleteLesson={onDeleteLesson} allowUploads={allowUploads} />}
  </Card>;
}

/* ---------------- Lessons list + create/edit flow ---------------- */
function LessonsSection({ course, saving, onAddLesson, onDeleteLesson, allowUploads }: { course: Course; saving: boolean; onAddLesson: (lesson: Lesson) => Promise<boolean>; onDeleteLesson?: (lesson: Lesson) => Promise<boolean>; allowUploads: boolean }) {
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [adding, setAdding] = useState(false);
  const [lessonFormVersion, setLessonFormVersion] = useState(0);
  const [createdLesson, setCreatedLesson] = useState<{ id: string; title: string } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const formOpen = adding || editing !== null;
  const totalMinutes = course.lessons.reduce((sum, l) => sum + (l.durationMin || 0), 0);
  const videoCount = course.lessons.filter((l) => l.format !== "reading").length;

  function openNew() { setCreatedLesson(null); setEditing(null); setAdding(true); queueMicrotask(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })); }
  function openEdit(lesson: Lesson) { setCreatedLesson(null); setAdding(false); setEditing(lesson); queueMicrotask(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })); }
  function closeForm() { setAdding(false); setEditing(null); }

  return (
    <section className="border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-zinc-900"><Layers className="h-4 w-4 text-primary" aria-hidden="true" />Lessons</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {course.lessons.length === 0 ? "Nothing here yet — add the first lesson to start building the path." : `${course.lessons.length} lesson${course.lessons.length === 1 ? "" : "s"} · ${videoCount} video · ${course.lessons.length - videoCount} reading · ~${totalMinutes} min total`}
          </p>
        </div>
        <motion.div whileTap={{ scale: 0.97 }}>
          <Button size="sm" onClick={openNew} disabled={saving || adding} className="shadow-sm"><Plus className="h-4 w-4" />Add lesson</Button>
        </motion.div>
      </div>

      <AnimatePresence>
        {createdLesson && (
          <motion.div role="status" aria-live="polite" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            <motion.span initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 24 }} className="inline-flex rounded-full bg-emerald-600 p-1 text-white"><Check className="h-3.5 w-3.5" aria-hidden="true" /></motion.span>
            “{createdLesson.title}” was added to the course.
            <button type="button" onClick={openNew} className="ml-auto text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline">Add another</button>
          </motion.div>
        )}
      </AnimatePresence>

      {course.lessons.length === 0 && !formOpen ? (
        <motion.button type="button" onClick={openNew} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="focus-ring mt-3 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5">
          <motion.span animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }} className="rounded-xl bg-primary/10 p-2.5"><Sparkles className="h-5 w-5 text-primary" aria-hidden="true" /></motion.span>
          <span className="text-sm font-medium text-zinc-800">Create your first lesson</span>
          <span className="text-xs text-zinc-500">A video with a YouTube link, or a reading with written content or an attached PDF.</span>
        </motion.button>
      ) : (
        <motion.ol layout className="mt-3 space-y-2">
          <AnimatePresence initial={false}>
            {course.lessons.map((lesson, index) => {
              const isVideo = lesson.format !== "reading";
              const missingVideo = isVideo && isPlaceholder(lesson.youtubeId);
              const isEditing = editing?.id === lesson.id;
              return (
                <motion.li
                  key={lesson.id}
                  layout
                  initial={lesson.id === createdLesson?.id ? { opacity: 0, y: 12, backgroundColor: "rgb(209 250 229)" } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, backgroundColor: "rgb(255 255 255)" }}
                  exit={{ opacity: 0, x: -12, height: 0, marginTop: 0, overflow: "hidden" }}
                  transition={{ duration: 0.3, delay: lesson.id === createdLesson?.id ? 0 : Math.min(index * 0.03, 0.2) }}
                  className={cn("group flex items-center gap-3 rounded-xl border p-3 text-sm transition-colors", isEditing ? "border-primary/50 ring-2 ring-primary/15" : "hover:border-zinc-300")}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", isVideo ? "bg-rose-50 text-rose-600" : "bg-sky-50 text-sky-600")} title={isVideo ? "Video lesson" : "Reading lesson"}>
                    {isVideo ? <Video className="h-4 w-4" aria-hidden="true" /> : <BookOpen className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-900">{lesson.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{lesson.durationMin} min</span>
                      {lesson.section && <><span>·</span><span className="truncate">{lesson.section}</span></>}
                      {lesson.requiresSubmission && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">Submission</span>}
                      {missingVideo && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">No video yet</span>}
                      {lesson.published === false && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">Draft</span>}
                      {isLessonScheduled(lesson) && <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800"><Clock className="h-3 w-3" aria-hidden="true" />Scheduled · {formatLaunch(lesson.publishAt!)}</span>}
                    </p>
                  </div>
                  <span className="flex shrink-0 gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                    {isVideo && !missingVideo && lesson.published !== false && !isLessonScheduled(lesson) && <TutorNotifyButton courseSlug={course.slug} courseTitle={course.title} lesson={lesson} />}
                    {lesson.requiresSubmission && <TutorSubmissionsButton lesson={lesson} />}
                    <Button size="sm" variant="ghost" disabled={saving} onClick={() => openEdit(lesson)} aria-label={`Edit ${lesson.title}`}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" disabled={saving} onClick={() => void onDeleteLesson?.(lesson)} aria-label={`Delete ${lesson.title}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ol>
      )}

      <AnimatePresence>
        {formOpen && (
          <motion.div
            ref={formRef}
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <LessonWizard
              key={`${editing?.id ?? "new"}-${lessonFormVersion}`}
              courseSlug={course.slug}
              coursePublished={course.published !== false}
              lesson={editing}
              saving={saving}
              allowUploads={allowUploads}
              onCancel={closeForm}
              onSave={async (lesson) => {
                const isNew = editing === null;
                setCreatedLesson(null);
                const saved = await onAddLesson(lesson);
                if (!saved) return;
                if (isNew) {
                  setCreatedLesson({ id: lesson.id, title: lesson.title });
                  setLessonFormVersion((version) => version + 1);
                }
                closeForm();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-sm font-medium text-zinc-800">{label}{children}</label>; }
function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className="focus-ring mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm">{children}</select>; }
/* ---------- lesson wizard ----------
   A lesson is built in five steps shown side by side with a tracker:
   details → video/content → assignment → takeaways & resources → publish.
   Every step is optional to visit (the tracker jumps anywhere) and a draft
   can be saved from any step; publishing checks the lesson is complete. */
const WIZARD_STEPS = [
  { key: "details", label: "Details" },
  { key: "video", label: "Video or text" },
  { key: "assignment", label: "Assignment" },
  { key: "takeaways", label: "Takeaways & resources" },
  { key: "publish", label: "Publish" },
] as const;
type WizardStep = (typeof WIZARD_STEPS)[number]["key"];

function WizardTracker({ current, completed, onJump }: { current: number; completed: boolean[]; onJump: (index: number) => void }) {
  return (
    <nav aria-label="Lesson steps" className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-center">
        {WIZARD_STEPS.map((step, index) => {
          const active = index === current;
          const done = completed[index] && !active;
          return (
            <li key={step.key} className="flex items-center">
              <button
                type="button"
                onClick={() => onJump(index)}
                aria-current={active ? "step" : undefined}
                className="focus-ring group flex items-center gap-2 rounded-full py-1 pr-2 text-left"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                    active && "border-primary bg-primary text-white shadow-sm shadow-primary/30",
                    done && "border-primary bg-primary/10 text-primary",
                    !active && !done && "border-zinc-200 bg-white text-zinc-400 group-hover:border-zinc-300"
                  )}
                >
                  {done ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
                </span>
                <span className={cn("text-sm font-medium", active ? "text-zinc-900" : done ? "text-primary" : "text-zinc-500")}>
                  {step.label}
                </span>
              </button>
              {index < WIZARD_STEPS.length - 1 && (
                <span aria-hidden="true" className={cn("mx-2 h-0.5 w-8 rounded-full sm:w-12", completed[index] ? "bg-primary/60" : "bg-zinc-200")} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function LessonWizard({ courseSlug, coursePublished, lesson, saving, onCancel, onSave, allowUploads }: {
  courseSlug: string; coursePublished: boolean; lesson: Lesson | null; saving: boolean;
  onCancel: () => void; onSave: (lesson: Lesson) => Promise<void>; allowUploads: boolean;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [visited, setVisited] = useState<boolean[]>(() => WIZARD_STEPS.map((_, i) => i === 0 || Boolean(lesson)));
  // Step 1 — details
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [description, setDescription] = useState(lesson?.description ?? "");
  const [duration, setDuration] = useState(String(lesson?.durationMin ?? 20));
  const [section, setSection] = useState(lesson?.section ?? "");
  // Step 2 — video or reading content
  // Step 2 decides the lesson format: a YouTube video (pasted, or made by
  // recorded in the Record tab) or a text lesson. Neither is mandatory until publishing.
  const [videoMode, setVideoMode] = useState<"youtube" | "edit" | "text">(lesson?.format === "reading" ? "text" : "youtube");
  const [editJobId, setEditJobId] = useState<number | null>(null);
  const format: "video" | "reading" = videoMode === "text" ? "reading" : "video";
  const [youtubeId, setYoutubeId] = useState(lesson?.youtubeId === "REPLACE_ME" ? "" : lesson?.youtubeId ?? "");
  const [body, setBody] = useState(lesson?.body ?? "");
  const [bodyFileUrl, setBodyFileUrl] = useState(lesson?.bodyFileUrl);
  // Step 3 — assignment
  const [assignment, setAssignment] = useState(lesson?.assignment ?? "");
  const [requiresSubmission, setRequiresSubmission] = useState(lesson?.requiresSubmission ?? false);
  const [assignmentMarks, setAssignmentMarks] = useState(lesson?.assignmentMarks ? String(lesson.assignmentMarks) : "");
  const [assignmentDueDate, setAssignmentDueDate] = useState(lesson?.assignmentDueDate ?? "");
  const [rubricOpen, setRubricOpen] = useState(false);
  // Step 4 — takeaways & resources
  const [takeaways, setTakeaways] = useState(lesson?.keyTakeaways.join("\n") ?? "");
  const [resources, setResources] = useState<Resource[]>(lesson?.resources ?? []);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const step: WizardStep = WIZARD_STEPS[stepIndex].key;
  const detectedVideoId = format === "video" && youtubeId.trim() ? extractYouTubeId(youtubeId) : null;
  const wasPublished = lesson !== null && lesson.published !== false;
  // Step 5 — go live now, or at a chosen time (kept in the tutor's local time).
  const [scheduleOn, setScheduleOn] = useState(() => lesson !== null && isLessonScheduled(lesson));
  const [scheduleAt, setScheduleAt] = useState(() => (lesson && isLessonScheduled(lesson) ? toLocalInput(new Date(lesson.publishAt!)) : ""));
  const takeawayList = takeaways.split("\n").map((item) => item.trim()).filter(Boolean);

  // What each step needs; used for the tracker ticks and the publish checklist.
  const detailsOk = Boolean(title.trim() && description.trim());
  const contentOk = format === "video" ? Boolean(detectedVideoId) : Boolean(body.trim() || bodyFileUrl);
  const assignmentOk = !requiresSubmission || Boolean(assignment.trim() && assignmentMarks && assignmentDueDate);
  const completed = [
    detailsOk,
    visited[1] && contentOk,
    visited[2] && assignmentOk,
    visited[3],
    false,
  ];

  function goTo(index: number) {
    if (index === stepIndex) return;
    if (stepIndex === 0 && index > 0 && !detailsOk) { setFormError("Add a title and description first."); return; }
    setFormError(null);
    setDirection(index > stepIndex ? 1 : -1);
    setStepIndex(index);
    setVisited((v) => v.map((seen, i) => seen || i === index));
  }

  function buildLesson(published: boolean): Lesson {
    const finalResources = resources.map((resource) => {
      const label = resource.label.trim();
      if (!label) throw new Error("Each resource needs a label (step 4).");
      if (resource.type === "file") return { ...resource, label };
      const url = resource.url.trim();
      if (!url || (url !== "#" && !/^https:\/\//i.test(url))) throw new Error("Each link resource needs an https:// URL (step 4).");
      return { ...resource, label, url };
    });
    if (!detailsOk) throw new Error("Add a title and description (step 1).");
    if (format === "video" && youtubeId.trim() && !detectedVideoId) throw new Error("Paste a valid YouTube URL or video ID (step 2).");
    if (requiresSubmission && (!assignmentMarks || !assignmentDueDate)) throw new Error("Set total points and a due date for the submission (step 3).");
    if (published && !contentOk) {
      throw new Error("Add a YouTube video or write a text lesson (step 2) before publishing — or save it as a draft.");
    }
    let publishAt: string | undefined;
    if (published && scheduleOn) {
      const when = scheduleAt ? new Date(scheduleAt) : null;
      if (!when || Number.isNaN(when.getTime())) throw new Error("Pick the date and time this lesson should go live.");
      if (when.getTime() <= Date.now()) throw new Error("The go-live time has to be in the future — or choose Right away.");
      publishAt = when.toISOString();
    }
    return {
      id: lesson?.id ?? `${courseSlug}-${Date.now()}`,
      title: title.trim(), description: description.trim(), format,
      youtubeId: format === "reading" ? "" : detectedVideoId ?? PLACEHOLDER_VIDEO,
      durationMin: Math.min(1440, Math.max(1, Math.round(Number(duration) || 20))),
      section: section.trim() || undefined, assignment: assignment.trim() || undefined, requiresSubmission,
      assignmentMarks: requiresSubmission && assignmentMarks ? Number(assignmentMarks) : undefined,
      assignmentDueDate: requiresSubmission && assignmentDueDate ? assignmentDueDate : undefined,
      keyTakeaways: takeawayList,
      resources: finalResources,
      body: format === "reading" && body.trim() ? body.trim() : undefined,
      bodyFileUrl: format === "reading" && !body.trim() ? bodyFileUrl : undefined,
      published,
      publishAt,
    };
  }

  function save(published: boolean) {
    try {
      const built = buildLesson(published);
      setFormError(null);
      void onSave(built);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Check the lesson details.");
    }
  }

  const busy = saving || uploading;
  const checklist: { label: string; ok: boolean; optional?: boolean; step: number }[] = [
    { label: "Title and description", ok: detailsOk, step: 0 },
    { label: contentOk ? (format === "video" ? "YouTube video" : "Text lesson") : "Video or text content", ok: contentOk, step: 1 },
    { label: requiresSubmission ? "Graded assignment (points + due date)" : "Assignment", ok: requiresSubmission ? assignmentOk : Boolean(assignment.trim()), optional: !requiresSubmission, step: 2 },
    { label: `Key takeaways (${takeawayList.length})`, ok: takeawayList.length > 0, optional: true, step: 3 },
    { label: `Resources (${resources.length})`, ok: resources.length > 0, optional: true, step: 3 },
  ];

  return (
    <div className="mt-3 space-y-4 rounded-2xl border border-border bg-zinc-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900">
          {lesson ? `Edit “${lesson.title}”` : "New lesson"}
          {lesson && <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold", wasPublished ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-700")}>{wasPublished ? "Published" : "Draft"}</span>}
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}><X className="h-4 w-4" />Close</Button>
      </div>

      <WizardTracker current={stepIndex} completed={completed} onJump={goTo} />

      <div className="relative overflow-hidden">
          {/* Keyed so each step mounts fresh and slides in from the side it is
              coming from. (An AnimatePresence "wait" exit here could stall and
              leave the previous step on screen.) */}
          <motion.section
            key={step}
            initial={{ opacity: 0, x: direction * 48 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            aria-labelledby={`wizard-step-${step}`}
            className="rounded-xl border border-border bg-white p-4"
          >
            <h3 id={`wizard-step-${step}`} className="mb-3 text-base font-semibold text-zinc-900">
              Step {stepIndex + 1} of {WIZARD_STEPS.length}: {WIZARD_STEPS[stepIndex].label}
            </h3>

            {step === "details" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Lesson title"><Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} autoFocus /></Field>
                <div className="sm:col-span-2"><Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={2000} placeholder="What will learners get out of this lesson?" /></Field></div>
                <Field label="Duration (minutes)"><Input type="number" min="1" max="1440" step="1" value={duration} onChange={(e) => setDuration(e.target.value)} required /></Field>
                <Field label="Section (optional)"><Input value={section} onChange={(e) => setSection(e.target.value)} maxLength={200} placeholder="e.g. Module 1" /></Field>
              </div>
            )}

            {step === "video" && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600">Paste a YouTube link, record your video here, or write a text lesson. You only need one.</p>
                <div className="flex w-fit flex-wrap gap-1 rounded-xl bg-zinc-100 p-1 text-xs font-medium" role="tablist" aria-label="Lesson content type">
                  <button type="button" role="tab" aria-selected={videoMode === "youtube"} onClick={() => setVideoMode("youtube")} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5", videoMode === "youtube" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600")}><Youtube className="h-3.5 w-3.5" />YouTube link</button>
                  <button type="button" role="tab" aria-selected={videoMode === "edit"} onClick={() => setVideoMode("edit")} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5", videoMode === "edit" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600")}><Video className="h-3.5 w-3.5" />Record</button>
                  <button type="button" role="tab" aria-selected={videoMode === "text"} onClick={() => setVideoMode("text")} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5", videoMode === "text" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600")}><BookOpen className="h-3.5 w-3.5" />Text lesson</button>
                </div>
                {videoMode === "youtube" && (
                  <Field label="YouTube URL or video ID (optional)">
                    <Input value={youtubeId} onChange={(e) => { setYoutubeId(e.target.value); setFormError(null); }} placeholder="Paste a YouTube URL or video ID" maxLength={2048} aria-invalid={Boolean(youtubeId.trim() && !detectedVideoId)} />
                    {youtubeId.trim() && !detectedVideoId && <span className="mt-1 block text-xs text-red-700">Enter a valid YouTube URL or 11-character video ID.</span>}
                    {detectedVideoId && <span className="mt-2 flex items-center gap-2 text-xs text-emerald-800"><img src={youTubeThumb(detectedVideoId)} alt="" className="h-9 w-16 rounded object-cover" />Video detected and ready to embed.</span>}
                    {!youtubeId.trim() && <span className="mt-1 block text-xs font-normal text-zinc-500">No video yet? <strong>Record</strong> one right here. No video at all? Use <strong>Text lesson</strong>, or save a draft and add it later.</span>}
                  </Field>
                )}
                {videoMode === "edit" && (
                  <RecordStudio
                    lessonTitle={title}
                    courseSlug={courseSlug}
                    jobId={editJobId}
                    onJobChange={setEditJobId}
                    onReadyToLink={() => setVideoMode("youtube")}
                    onVideoPosted={(videoId) => { setYoutubeId(videoId); setVideoMode("youtube"); }}
                  />
                )}
                {videoMode === "text" && (
                  <LessonContentField body={body} bodyFileUrl={bodyFileUrl} uploading={uploading} setUploading={setUploading} allowUploads={allowUploads} onChange={({ body: nextBody, bodyFileUrl: nextUrl }) => { setBody(nextBody); setBodyFileUrl(nextUrl); }} />
                )}
              </div>
            )}

            {step === "assignment" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label="Assignment"><Textarea value={assignment} onChange={(e) => setAssignment(e.target.value)} maxLength={5000} placeholder="What should learners do after this lesson? (optional)" /></Field></div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-zinc-800">
                    <input type="checkbox" checked={requiresSubmission} onChange={(e) => setRequiresSubmission(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 accent-primary" />
                    Require learners to submit a file for grading
                  </label>
                  <p className="text-xs text-zinc-500">
                    {requiresSubmission ? "Learners see the text above as their assignment brief and upload a PDF or Word file." : "Without this, learners can still generate a personalised AI practice assignment from the lesson."}
                  </p>
                </div>
                {requiresSubmission && <Field label="Total points"><Input type="number" min="1" max="10000" step="1" value={assignmentMarks} onChange={(e) => setAssignmentMarks(e.target.value)} placeholder="e.g. 100" required /></Field>}
                {requiresSubmission && <Field label="Due date"><Input type="date" value={assignmentDueDate} onChange={(e) => setAssignmentDueDate(e.target.value)} required /></Field>}
                {requiresSubmission && (
                  <div className="sm:col-span-2">
                    {lesson
                      ? <Button type="button" size="sm" variant="outline" onClick={() => setRubricOpen(true)}><ListChecks className="h-3.5 w-3.5" />Grading rubric</Button>
                      : <p className="text-xs text-zinc-500">Save the lesson (as a draft is fine) to set up a grading rubric.</p>}
                  </div>
                )}
              </div>
            )}

            {step === "takeaways" && (
              <div className="space-y-4">
                <Field label="Key takeaways (one per line)">
                  <Textarea value={takeaways} onChange={(e) => setTakeaways(e.target.value)} placeholder={"e.g. Agents pursue goals; automation follows rules\nWhen an agent is overkill"} />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">Takeaways also help the AI build better practice assignments and quizzes.</span>
                </Field>
                <ResourcesField resources={resources} onChange={setResources} uploading={uploading} setUploading={setUploading} error={resourceError} setError={setResourceError} allowUploads={allowUploads} />
              </div>
            )}

            {step === "publish" && (
              <div className="space-y-4">
                <ul className="space-y-2">
                  {checklist.map((item) => (
                    <li key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        {item.ok
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                          : <span aria-hidden="true" className={cn("h-4 w-4 rounded-full border-2", item.optional ? "border-zinc-300" : "border-amber-400")} />}
                        <span className={item.ok ? "text-zinc-800" : "text-zinc-500"}>{item.label}</span>
                        {!item.ok && <span className={cn("text-xs", item.optional ? "text-zinc-400" : "text-amber-700")}>{item.optional ? "optional" : "missing"}</span>}
                      </span>
                      {!item.ok && <button type="button" onClick={() => goTo(item.step)} className="text-xs font-medium text-primary hover:underline">Add</button>}
                    </li>
                  ))}
                </ul>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border p-3 text-sm">
                    <p className="font-semibold text-zinc-900">Save as draft</p>
                    <p className="mt-1 text-zinc-600">Only you can see it. Keep working on it any time.</p>
                  </div>
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                    <p className="font-semibold text-zinc-900">Publish</p>
                    <p className="mt-1 text-zinc-600">
                      {coursePublished ? "Learners see this lesson straight away, or from the time you schedule." : "The course itself is still a draft — learners will see this lesson once the course is published."}
                    </p>
                  </div>
                </div>
                <fieldset className="rounded-xl border border-border p-3 text-sm">
                  <legend className="px-1 font-semibold text-zinc-900">When should it go live?</legend>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <label className="flex items-center gap-2"><input type="radio" name="lesson-launch" checked={!scheduleOn} onChange={() => setScheduleOn(false)} className="accent-primary" />Right away</label>
                    <label className="flex items-center gap-2"><input type="radio" name="lesson-launch" checked={scheduleOn} onChange={() => setScheduleOn(true)} className="accent-primary" />Schedule for later</label>
                    {scheduleOn && (
                      <input
                        type="datetime-local" aria-label="Go-live date and time" value={scheduleAt} min={toLocalInput(new Date())}
                        onChange={(e) => setScheduleAt(e.target.value)}
                        className="focus-ring h-9 rounded-lg border border-border bg-white px-2 text-sm"
                      />
                    )}
                  </div>
                  {scheduleOn && <p className="mt-2 text-xs text-zinc-500">Your local time. Students can&apos;t see or open the lesson until then; it appears on its own, with nothing more for you to do.</p>}
                </fieldset>
              </div>
            )}
          </motion.section>
      </div>

      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0 || busy}>
          <ChevronLeft className="h-4 w-4" />Back
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => save(false)} disabled={busy || !detailsOk}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{wasPublished ? "Move to drafts" : "Save as draft"}
          </Button>
          {step === "publish" ? (
            <Button type="button" onClick={() => save(true)} disabled={busy || !detailsOk}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : scheduleOn ? <Clock className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {scheduleOn ? "Schedule lesson" : wasPublished ? "Save changes" : "Publish lesson"}
            </Button>
          ) : (
            <Button type="button" onClick={() => goTo(stepIndex + 1)} disabled={busy}>
              Next<ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {rubricOpen && lesson && <RubricEditorPanel lesson={lesson} onClose={() => setRubricOpen(false)} />}
    </div>
  );
}

function LessonContentField({ body, bodyFileUrl, uploading, setUploading, onChange, allowUploads }: {
  body: string; bodyFileUrl?: string; uploading: boolean; setUploading: (value: boolean) => void;
  onChange: (value: { body: string; bodyFileUrl?: string }) => void; allowUploads: boolean;
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
      <button type="button" disabled={!allowUploads} title={!allowUploads ? "Save the course draft before attaching files" : undefined} onClick={() => { setMode("document"); onChange({ body: "", bodyFileUrl }); }} className={cn("rounded-lg px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50", mode === "document" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600")}>Attach document</button>
    </div>
    {mode === "write" ? <Textarea value={body} onChange={(e) => onChange({ body: e.target.value, bodyFileUrl: undefined })} placeholder="Write the lesson content here…" className="min-h-[160px]" maxLength={20000} /> :
      <div className="flex items-center gap-2">{bodyFileUrl ? <><FileText className="h-4 w-4 text-primary" /><a href={bodyFileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">View attached document</a><Button type="button" size="icon" variant="ghost" onClick={() => onChange({ body: "", bodyFileUrl: undefined })} aria-label="Remove document"><X className="h-4 w-4" /></Button></> : <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Attach PDF or TXT</Button>}<input ref={inputRef} type="file" accept=".pdf,.txt" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} /></div>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}

function ResourcesField({ resources, onChange, uploading, setUploading, error, setError, allowUploads }: {
  resources: Resource[]; onChange: (resources: Resource[]) => void; uploading: boolean; setUploading: (value: boolean) => void; error: string | null; setError: (value: string | null) => void;
  allowUploads: boolean;
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
    <div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={() => !atLimit && onChange([...resources, { label: "", url: "", type: "link" }])} disabled={atLimit}><Plus className="h-3.5 w-3.5" />Add link</Button><Button type="button" size="sm" variant="outline" title={!allowUploads ? "Save the course draft before attaching files" : undefined} onClick={() => inputRef.current?.click()} disabled={atLimit || uploading || !allowUploads}>{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Attach file</Button><input ref={inputRef} type="file" multiple accept={RESOURCE_FILE_ACCEPT} className="hidden" onChange={(e) => void upload(e.target.files)} /><span className="text-xs text-zinc-500">{allowUploads ? `PDF, TXT, Word, PowerPoint, Excel, or images · up to 10 MB · ${resources.length}/20` : "Save this course draft before attaching files."}</span></div>
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
                  <Textarea placeholder="What earns full points here? (optional)" value={c.description} onChange={(e) => updateCriterion(i, { description: e.target.value })} className="min-h-[50px] text-sm" maxLength={1000} />
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
