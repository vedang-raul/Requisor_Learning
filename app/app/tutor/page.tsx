"use client";

import { FormEvent, ReactNode, SelectHTMLAttributes, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, BarChart3, BookPlus, Check, CheckCircle2, Loader2, Pencil, Plus, Star, Trash2, TrendingUp, Users, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { CategoryKey, Course, Lesson } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { PageTransition } from "@/components/motion";
import { extractYouTubeId, PLACEHOLDER_VIDEO, youTubeThumb } from "@/lib/utils";

type TutorCourse = { course: Course; averageRating: number; ratingCount: number; ratingDistribution: number[] | Record<string, number> };
const covers: Record<CategoryKey, string> = {
  product: "from-indigo-500 via-violet-500 to-fuchsia-500", data: "from-cyan-500 via-sky-500 to-blue-600",
  ai: "from-violet-500 via-purple-500 to-indigo-600", security: "from-emerald-500 via-teal-500 to-cyan-600",
};

function distributionCount(distribution: TutorCourse["ratingDistribution"], rating: number) {
  return Array.isArray(distribution) ? distribution[rating] ?? distribution[rating - 1] ?? 0 : distribution[String(rating)] ?? 0;
}

export default function TutorPage() {
  const { state, hydrated, upsertCourse, upsertLesson, deleteLesson, deleteCourse } = useStore();
  const router = useRouter();
  const [items, setItems] = useState<TutorCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Course | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/tutor/courses");
      const data = await response.json().catch(() => ({})) as { courses?: TutorCourse[]; error?: string };
      if (!response.ok || !Array.isArray(data.courses)) throw new Error(data.error ?? "Couldn't load your courses.");
      setItems(data.courses);
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

  return <PageTransition className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-zinc-900 md:text-3xl">Tutor workspace</h1><p className="mt-1 text-sm text-zinc-600">Create and manage your courses. Ratings update from learner feedback.</p></div>
      <Button className="min-h-11" onClick={() => { setSelected(null); setCreating(true); }}><Plus className="h-4 w-4" /> Create course</Button>
    </header>
    {error && <div role="alert" className="flex flex-col items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center">{error}<Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button></div>}
    {creating && <CourseForm saving={saving} onCancel={() => setCreating(false)} onSave={saveCourse} />}
    {loading ? <Card className="flex items-center gap-2 py-10 text-sm text-zinc-600"><Loader2 className="h-5 w-5 animate-spin" /> Loading your courses…</Card> :
      items.length === 0 ? <Card className="py-12 text-center"><BookPlus className="mx-auto h-8 w-8 text-primary" /><CardTitle className="mt-3">No courses yet</CardTitle><p className="mt-1 text-sm text-zinc-600">Create your first course to start building a learning path.</p></Card> :
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <button key={item.course.slug} onClick={() => { setCreating(false); setSelected(item.course); }} className="focus-ring min-h-32 rounded-2xl text-left"><Card className="h-full transition hover:border-primary/40"><div className={`mb-3 h-2 rounded-full bg-gradient-to-r ${item.course.cover}`} /><CardTitle>{item.course.title}</CardTitle><p className="mt-1 text-xs text-zinc-600">{item.course.lessons.length} lessons · <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />{item.averageRating.toFixed(1)} ({item.ratingCount})</span></p><div className="mt-3 flex gap-1" aria-hidden="true">{[5,4,3,2,1].map((rating) => <span key={rating} title={`${rating} stars: ${distributionCount(item.ratingDistribution, rating)}`} className="h-1 flex-1 rounded bg-primary/20" style={{ opacity: item.ratingCount ? Math.max(.2, distributionCount(item.ratingDistribution, rating) / item.ratingCount) : .2 }} />)}</div><span className="sr-only">{[5,4,3,2,1].map((rating) => `${rating} stars: ${distributionCount(item.ratingDistribution, rating)}`).join(", ")}</span></Card></button>)}</div>}
    {selected && <><CourseInsights course={selected} /><CourseEditor course={selected} saving={saving} onCancel={() => setSelected(null)} onSave={saveCourse} onAddLesson={updateLessons} onDeleteLesson={(lesson) => updateLessons(lesson, true)} onDeleteCourse={async () => { if (!confirm(`Delete "${selected.title}"?`)) return; setSaving(true); try { await deleteCourse(selected.slug); setSelected(null); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't delete the course."); } finally { setSaving(false); } }} /></>}
  </PageTransition>;
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

function CourseForm({ saving, onCancel, onSave }: { saving: boolean; onCancel: () => void; onSave: (course: Course) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState<CategoryKey>("product");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    void onSave({
      slug: cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `course-${Date.now()}`,
      title: cleanTitle,
      tagline: tagline.trim() || "New learning path.",
      category,
      level: "Beginner",
      tags: [cleanTitle],
      cover: covers[category],
      addedAt: new Date().toISOString().slice(0, 10),
      lessons: [],
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
          <select value={category} onChange={(event) => setCategory(event.target.value as CategoryKey)} className="focus-ring mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm">
            <option value="product">Product Management</option>
            <option value="data">Data Analytics</option>
            <option value="ai">Agentic AI</option>
            <option value="security">Cyber Security</option>
          </select>
        </label>
        <Button type="submit" disabled={saving || !title.trim()} className="min-h-11">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Create course
        </Button>
      </form>
    </Card>
  );
}

function CourseEditor({ course, saving, onCancel, onSave, onAddLesson, onDeleteLesson, onDeleteCourse }: { course?: Course | null; saving: boolean; onCancel: () => void; onSave: (course: Course) => Promise<void>; onAddLesson?: (lesson: Lesson) => Promise<void>; onDeleteLesson?: (lesson: Lesson) => Promise<void>; onDeleteCourse?: () => Promise<void> }) {
  const [title, setTitle] = useState(course?.title ?? ""); const [tagline, setTagline] = useState(course?.tagline ?? ""); const [category, setCategory] = useState<CategoryKey>(course?.category ?? "product"); const [level, setLevel] = useState<Course["level"]>(course?.level ?? "Beginner"); const [tags, setTags] = useState(course?.tags.join(", ") ?? ""); const [assessment, setAssessment] = useState(course?.baseAssessment ?? ""); const [editing, setEditing] = useState<Lesson | null>(null);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim()) return; void onSave(course ? { ...course, title: title.trim(), tagline: tagline.trim(), category, level, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), baseAssessment: assessment.trim() || undefined, cover: covers[category] } : { slug: title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `course-${Date.now()}`, title: title.trim(), tagline: tagline.trim() || "New learning path.", category, level, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), cover: covers[category], addedAt: new Date().toISOString().slice(0, 10), lessons: [], baseAssessment: assessment.trim() || undefined }); };
  return <Card className="space-y-4"><div className="flex items-center justify-between"><CardTitle>{course ? `Edit ${course.title}` : "New course"}</CardTitle><Button size="sm" variant="ghost" onClick={onCancel}>Close</Button></div><form onSubmit={submit} className="grid gap-3 sm:grid-cols-2"><Field label="Course title"><Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} /></Field><Field label="Tagline"><Input value={tagline} onChange={(e) => setTagline(e.target.value)} required maxLength={400} /></Field><Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value as CategoryKey)}><option value="product">Product</option><option value="data">Data</option><option value="ai">AI</option><option value="security">Security</option></Select></Field><Field label="Level"><Select value={level} onChange={(e) => setLevel(e.target.value as Course["level"])}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></Select></Field><Field label="Tags (comma separated)"><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field><Field label="Base assessment"><Textarea value={assessment} onChange={(e) => setAssessment(e.target.value)} maxLength={5000} /></Field><div className="flex items-end gap-2"><Button type="submit" disabled={saving} className="min-h-11">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save course</Button>{course && onDeleteCourse && <Button type="button" variant="danger" disabled={saving} onClick={() => void onDeleteCourse()} aria-label={`Delete ${course.title}`}><Trash2 className="h-4 w-4" /></Button>}</div></form>
    {course && onAddLesson && <section className="border-t pt-4"><h2 className="font-semibold text-zinc-900">Lessons</h2><ul className="mt-2 space-y-2">{course.lessons.map((lesson) => <li key={lesson.id} className="flex items-center justify-between rounded-xl border p-3 text-sm"><span>{lesson.title}</span><span className="flex gap-1"><Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(lesson)} aria-label={`Edit ${lesson.title}`}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" disabled={saving} onClick={() => void onDeleteLesson?.(lesson)} aria-label={`Delete ${lesson.title}`}><Trash2 className="h-4 w-4 text-red-600" /></Button></span></li>)}</ul><LessonEditor key={editing?.id ?? "new"} courseSlug={course.slug} lesson={editing} saving={saving} onCancel={() => setEditing(null)} onSave={async (lesson) => { await onAddLesson(lesson); setEditing(null); }} /></section>}
  </Card>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-sm font-medium text-zinc-800">{label}{children}</label>; }
function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className="focus-ring mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm">{children}</select>; }
function LessonEditor({ courseSlug, lesson, saving, onCancel, onSave }: { courseSlug: string; lesson: Lesson | null; saving: boolean; onCancel: () => void; onSave: (lesson: Lesson) => Promise<void> }) {
  const [title, setTitle] = useState(lesson?.title ?? ""); const [description, setDescription] = useState(lesson?.description ?? ""); const [format, setFormat] = useState<"video" | "reading">(lesson?.format ?? "video"); const [youtubeId, setYoutubeId] = useState(lesson?.youtubeId === "REPLACE_ME" ? "" : lesson?.youtubeId ?? ""); const [duration, setDuration] = useState(String(lesson?.durationMin ?? 20)); const [section, setSection] = useState(lesson?.section ?? ""); const [assignment, setAssignment] = useState(lesson?.assignment ?? ""); const [takeaways, setTakeaways] = useState(lesson?.keyTakeaways.join("\n") ?? ""); const [resources, setResources] = useState(lesson?.resources.map((r) => `${r.label}|${r.url}|${r.type}`).join("\n") ?? ""); const [formError, setFormError] = useState<string | null>(null);
  const detectedVideoId = format === "video" && youtubeId.trim() ? extractYouTubeId(youtubeId) : null;
  const submit = (event: FormEvent) => { event.preventDefault(); try { const parsedResources = resources.split("\n").filter(Boolean).map((line) => { const [label, url, type] = line.split("|").map((part) => part.trim()); if (!label || !url || (type !== "link" && type !== "pdf") || (url !== "#" && !/^https:\/\//i.test(url))) throw new Error("Resources must be Label|https://url|link or pdf."); return { label, url, type: type as "link" | "pdf" }; }); if (format === "video" && youtubeId.trim() && !detectedVideoId) throw new Error("Paste a valid YouTube URL or 11-character video ID."); setFormError(null); void onSave({ id: lesson?.id ?? `${courseSlug}-${Date.now()}`, title: title.trim(), description: description.trim(), format, youtubeId: format === "reading" ? "" : detectedVideoId ?? PLACEHOLDER_VIDEO, durationMin: Math.min(1440, Math.max(1, Math.round(Number(duration) || 20))), section: section.trim() || undefined, assignment: assignment.trim() || undefined, keyTakeaways: takeaways.split("\n").map((item) => item.trim()).filter(Boolean), resources: parsedResources }); } catch (error) { setFormError(error instanceof Error ? error.message : "Check the lesson details."); } };
  return <form onSubmit={submit} className="mt-3 grid gap-3 rounded-xl bg-zinc-50 p-3 sm:grid-cols-2"><Field label="Lesson title"><Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} /></Field><Field label="Format"><Select value={format} onChange={(e) => setFormat(e.target.value as "video" | "reading")}><option value="video">Video</option><option value="reading">Reading</option></Select></Field><Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={2000} /></Field><Field label="Duration (minutes)"><Input type="number" min="1" max="1440" step="1" value={duration} onChange={(e) => setDuration(e.target.value)} required /></Field>{format === "video" && <Field label="YouTube URL or video ID"><Input value={youtubeId} onChange={(e) => { setYoutubeId(e.target.value); setFormError(null); }} placeholder="Paste youtube.com/watch, youtu.be, Shorts, Live, or an ID" maxLength={2048} aria-invalid={Boolean(youtubeId.trim() && !detectedVideoId)} />{youtubeId.trim() && !detectedVideoId && <span className="mt-1 block text-xs text-red-700">Enter a valid YouTube URL or 11-character video ID.</span>}{detectedVideoId && <span className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800"><img src={youTubeThumb(detectedVideoId)} alt="" className="h-9 w-16 rounded object-cover" />Video detected and ready to embed.</span>}</Field>}<Field label="Section"><Input value={section} onChange={(e) => setSection(e.target.value)} maxLength={200} /></Field><Field label="Assignment"><Textarea value={assignment} onChange={(e) => setAssignment(e.target.value)} maxLength={5000} /></Field><Field label="Key takeaways (one per line)"><Textarea value={takeaways} onChange={(e) => setTakeaways(e.target.value)} /></Field><Field label="Resources (Label|https://url|link or pdf)"><Textarea value={resources} onChange={(e) => setResources(e.target.value)} /></Field>{formError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{formError}</p>}<div className="flex gap-2"><Button type="submit" disabled={saving || !title.trim() || !description.trim() || Boolean(youtubeId.trim() && !detectedVideoId)} className="min-h-11">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{lesson ? "Save lesson" : "Add lesson"}</Button>{lesson && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}</div></form>;
}