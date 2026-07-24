"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3, BookPlus, Check, Download, Users, Pencil, Plus,
  Trash2, TrendingUp, X, Youtube, LayoutGrid, Clock, FileText, Send,
  RefreshCw,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { Course, Lesson, CategoryKey } from "@/lib/types";
import { cn, extractYouTubeId, formatMinutes, youTubeThumb, isPlaceholder, PLACEHOLDER_VIDEO } from "@/lib/utils";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Tag } from "@/components/ui/badge";
import { PageTransition } from "@/components/motion";
import { ProgressBar } from "@/components/ui/progress";
import { TeamInsights } from "@/components/team-insights";

type TabKey = "analytics" | "content" | "users";

interface AnalyticsUser {
  id: number;
  name: string;
  email: string;
  employment_type: string | null;
  position: string | null;
  last_login_at: string | null;
  completion_count: number;
}

interface AnalyticsData {
  totalUsers: number;
  activeThisWeek: number;
  totalCompletions: number;
  users: AnalyticsUser[];
  completionsByCourse: Array<{ courseSlug: string; count: number }>;
}

function formatLoginTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  if (hrs < 48) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AdminPage() {
  const { state, hydrated } = useStore();
  const [tab, setTab] = useState<TabKey>("analytics");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (hydrated && state.user && state.user.role !== "admin") router.replace("/app/dashboard/");
  }, [hydrated, state.user, router]);

  const loadAnalytics = () => {
    setAnalyticsLoading(true);
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then((d) => setAnalytics(d))
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  };

  useEffect(() => {
    if (hydrated && state.user?.role === "admin") loadAnalytics();
  }, [hydrated, state.user]);

  if (!hydrated || !state.user || state.user.role !== "admin") return null;

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Admin <span className="text-gradient">Panel</span></h1>
        <p className="mt-1 text-sm text-zinc-600">Manage content, users and analytics for Requisor Learning.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200" role="tablist">
        {([
          ["analytics", "Analytics", BarChart3],
          ["content", "Courses & Lessons", LayoutGrid],
          ["users", "Users", Users],
        ] as [TabKey, string, typeof BarChart3][]).map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn("focus-ring relative flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition", tab === key ? "text-primary" : "text-zinc-500 hover:text-zinc-700")}
          >
            <Icon className="h-3.5 w-3.5" />{label}
            {tab === key && <motion.span layoutId="admin-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-primary to-accent" />}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
          {tab === "analytics" && <Analytics analytics={analytics} loading={analyticsLoading} onRefresh={loadAnalytics} />}
          {tab === "content" && <ContentManager />}
          {tab === "users" && <UserManager analytics={analytics} loading={analyticsLoading} />}
        </motion.div>
      </AnimatePresence>
    </PageTransition>
  );
}

/* ---------------- Analytics ---------------- */

function Analytics({ analytics, loading, onRefresh }: { analytics: AnalyticsData | null; loading: boolean; onRefresh: () => void }) {
  const { state } = useStore();

  // Local admin's own completion stats
  const totalLessons = state.courses.reduce((a, c) => a + c.lessons.length, 0);
  const completed = Object.values(state.progress).filter((p) => p.completed).length;
  const watchMin = state.courses.flatMap((c) => c.lessons).filter((l) => state.progress[l.id]?.completed).reduce((a, l) => a + l.durationMin, 0);
  const popular = [...state.courses].sort((a, b) => {
    const pa = a.lessons.filter((l) => state.progress[l.id]?.completed).length;
    const pb = b.lessons.filter((l) => state.progress[l.id]?.completed).length;
    return pb - pa;
  })[0];

  const exportReport = () => {
    const rows = [["Employee", "Email", "Position", "Completions", "Last Login"]];
    for (const u of (analytics?.users ?? [])) {
      rows.push([u.name, u.email, u.position ?? "", String(u.completion_count), formatLoginTime(u.last_login_at)]);
    }
    const csv = rows.map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `requisor-learning-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Max completions per course for normalising bar width
  const maxCourseCompletions = Math.max(1, ...(analytics?.completionsByCourse.map((c) => c.count) ?? [0]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Registered Employees",
            value: loading ? "…" : String(analytics?.totalUsers ?? 0),
            icon: Users,
            tint: "text-primary from-indigo-500/20 to-indigo-500/5",
          },
          {
            label: "Active This Week",
            value: loading ? "…" : String(analytics?.activeThisWeek ?? 0),
            icon: TrendingUp,
            tint: "text-emerald-600 from-emerald-500/20 to-emerald-500/5",
          },
          {
            label: "Total Completions",
            value: loading ? "…" : String(analytics?.totalCompletions ?? 0),
            icon: BarChart3,
            tint: "text-cyan-400 from-cyan-500/20 to-cyan-500/5",
          },
          {
            label: "Most Popular",
            value: popular?.title ?? "—",
            icon: Clock,
            tint: "text-amber-600 from-amber-500/20 to-amber-500/5",
            small: true,
          },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="flex items-center gap-4">
              <div className={cn("rounded-2xl bg-gradient-to-br p-3", s.tint)}><Icon className="h-6 w-6" /></div>
              <div className="min-w-0">
                <p className={cn("truncate font-bold text-zinc-900", s.small ? "text-sm" : "text-2xl")}>{s.value}</p>
                <p className="text-xs text-zinc-600">{s.label}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Team completions by course (real DB data) */}
        <Card>
          <CardTitle className="mb-4">Team completions by course</CardTitle>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse space-y-1.5">
                  <div className="h-3 w-1/2 rounded bg-zinc-200" />
                  <div className="h-2 w-full rounded bg-zinc-200" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {state.courses.map((c) => {
                const dbCount = analytics?.completionsByCourse.find((x) => x.courseSlug === c.slug)?.count ?? 0;
                const pct = Math.round((dbCount / maxCourseCompletions) * 100);
                return (
                  <div key={c.slug}>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="text-zinc-700">{c.title}</span>
                      <span className="text-zinc-500">{dbCount} completions</span>
                    </div>
                    <ProgressBar value={pct} />
                  </div>
                );
              })}
              {(analytics?.totalCompletions ?? 0) === 0 && (
                <p className="text-xs text-zinc-500">No completions recorded yet — data updates as employees finish lessons.</p>
              )}
            </div>
          )}
        </Card>

        {/* Most active employees (real DB data) */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <CardTitle>Most active employees</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={onRefresh} disabled={loading} aria-label="Refresh">
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </Button>
              <Button size="sm" variant="outline" onClick={exportReport}><Download className="h-3.5 w-3.5" />Export CSV</Button>
            </div>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-zinc-100" />)}
            </div>
          ) : (analytics?.users ?? []).length === 0 ? (
            <p className="py-4 text-sm text-zinc-500">No employees have signed up yet.</p>
          ) : (
            <div className="space-y-2">
              {(analytics?.users ?? []).slice(0, 8).map((u, i) => (
                <div key={u.email} className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white/[0.03] px-3.5 py-2.5">
                  <span className="w-5 text-center text-xs font-bold text-zinc-500">{i + 1}</span>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white">{u.name[0]}</div>
                  <span className="flex-1 truncate text-sm text-zinc-800">{u.name}</span>
                  <span className="text-xs text-zinc-500">{formatLoginTime(u.last_login_at)}</span>
                  <Tag tone="primary">{u.completion_count} done</Tag>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <TeamInsights courses={state.courses} progress={state.progress} mockUsers={[]} />
    </div>
  );
}

/* ---------------- Notify learners about a new video ---------------- */

function NotifyButton({ course, lesson }: { course: Course; lesson: Lesson }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const notify = async () => {
    if (status === "sending") return;
    if (!confirm(`Email all learners about "${lesson.title}"? Sent from support@requisor.io.`)) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/admin/notify-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseSlug: course.slug, courseTitle: course.title, lessonId: lesson.id, lessonTitle: lesson.title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus("sent");
      setTimeout(() => setStatus("idle"), 4000);
    } catch (e) {
      console.error(e);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  };

  return (
    <Button size="icon" variant="ghost" aria-label={`Email learners about ${lesson.title}`} title="Email all learners about this video" onClick={notify} disabled={status === "sending"}>
      {status === "sent" ? <Check className="h-4 w-4 text-emerald-600" /> : status === "error" ? <X className="h-4 w-4 text-red-600" /> : <Send className={cn("h-4 w-4", status === "sending" && "animate-pulse")} />}
    </Button>
  );
}

/* ---------------- Content manager ---------------- */

function ContentManager() {
  const { state, upsertCourse, deleteCourse, upsertLesson, deleteLesson } = useStore();
  const [selected, setSelected] = useState<string | null>(state.courses[0]?.slug ?? null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [creatingLesson, setCreatingLesson] = useState(false);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const course = state.courses.find((c) => c.slug === selected);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle>Courses</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setCreatingCourse(true)}><Plus className="h-3.5 w-3.5" />New</Button>
        </div>
        <div className="space-y-2">
          {state.courses.map((c) => (
            <button
              key={c.slug}
              onClick={() => setSelected(c.slug)}
              className={cn(
                "focus-ring flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
                selected === c.slug ? "border-primary/50 bg-primary/10" : "border-zinc-100 bg-card/60 hover:border-zinc-300"
              )}
            >
              <div className={cn("h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br", c.cover)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">{c.title}</p>
                <p className="text-[11px] text-zinc-500">{c.lessons.length} lessons</p>
              </div>
            </button>
          ))}
        </div>
        {creatingCourse && <CourseForm onClose={() => setCreatingCourse(false)} onSave={(c) => { upsertCourse(c); setSelected(c.slug); setCreatingCourse(false); }} />}
      </div>

      <div className="space-y-3">
        {course ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>{course.title} — Lessons</CardTitle>
                <CardDescription className="text-xs">Paste a YouTube URL on any lesson; thumbnail, player and title wire up automatically.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setCreatingLesson(true); setEditingLesson(null); }}><BookPlus className="h-3.5 w-3.5" />Add lesson</Button>
                <Button size="sm" variant="danger" onClick={() => { if (confirm(`Delete course "${course.title}" and all its lessons?`)) { deleteCourse(course.slug); setSelected(state.courses.find((c) => c.slug !== course.slug)?.slug ?? null); } }}>
                  <Trash2 className="h-3.5 w-3.5" />Delete course
                </Button>
              </div>
            </div>

            {(creatingLesson || editingLesson) && (
              <LessonForm
                courseSlug={course.slug}
                lesson={editingLesson}
                nextIndex={course.lessons.length + 1}
                onClose={() => { setCreatingLesson(false); setEditingLesson(null); }}
                onSave={(l) => { upsertLesson(course.slug, l); setCreatingLesson(false); setEditingLesson(null); }}
              />
            )}

            <div className="space-y-2">
              {course.lessons.map((l, i) => (
                <div key={l.id} className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-card/60 p-3">
                  <span className="w-6 text-center text-xs font-semibold text-zinc-600">{i + 1}</span>
                  <div className="relative hidden h-10 w-16 shrink-0 overflow-hidden rounded-md sm:block">
                    {l.format === "reading" ? (
                      <div className="flex h-full w-full items-center justify-center bg-zinc-200"><FileText className="h-4 w-4 text-zinc-600" /></div>
                    ) : isPlaceholder(l.youtubeId) ? (
                      <div className="flex h-full w-full items-center justify-center bg-zinc-200"><Youtube className="h-4 w-4 text-zinc-600" /></div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={youTubeThumb(l.youtubeId)} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-900">{l.title}</p>
                    <p className="text-[11px] text-zinc-500">
                      {formatMinutes(l.durationMin)} · {l.format === "reading" ? "Reading lesson" : isPlaceholder(l.youtubeId) ? "No video yet" : `youtu.be/${l.youtubeId}`}
                    </p>
                  </div>
                  {l.format === "reading" ? <Tag tone="accent">Reading</Tag> : isPlaceholder(l.youtubeId) && <Tag tone="warning">Needs video</Tag>}
                  {l.format !== "reading" && !isPlaceholder(l.youtubeId) && <NotifyButton course={course} lesson={l} />}
                  <Button size="icon" variant="ghost" aria-label={`Edit ${l.title}`} onClick={() => { setEditingLesson(l); setCreatingLesson(false); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${l.title}`} onClick={() => { if (confirm(`Delete lesson "${l.title}"?`)) deleteLesson(course.slug, l.id); }}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-500">Select or create a course to manage its lessons.</p>
        )}
      </div>
    </div>
  );
}

function CourseForm({ onSave, onClose }: { onSave: (c: Course) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState<CategoryKey>("product");

  const covers: Record<CategoryKey, string> = {
    product: "from-indigo-500 via-violet-500 to-fuchsia-500",
    data: "from-cyan-500 via-sky-500 to-blue-600",
    ai: "from-violet-500 via-purple-500 to-indigo-600",
    security: "from-emerald-500 via-teal-500 to-cyan-600",
  };

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
      <Card className="space-y-3">
        <div className="flex items-center justify-between"><CardTitle>New category / course</CardTitle><button onClick={onClose} aria-label="Close"><X className="h-4 w-4 text-zinc-500 hover:text-zinc-900" /></button></div>
        <Input placeholder="Course title (e.g. System Design)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="One-line tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value as CategoryKey)} className="focus-ring h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-zinc-800" aria-label="Category">
          <option value="product">Product Management</option>
          <option value="data">Data Analytics</option>
          <option value="ai">Agentic AI</option>
          <option value="security">Cyber Security</option>
        </select>
        <Button
          disabled={!title.trim()}
          onClick={() =>
            onSave({
              slug: title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `course-${Date.now()}`,
              title: title.trim(),
              tagline: tagline.trim() || "New learning path.",
              category,
              level: "Beginner",
              tags: [title.trim()],
              cover: covers[category],
              addedAt: new Date().toISOString().slice(0, 10),
              lessons: [],
            })
          }
        >
          <Check className="h-4 w-4" />Create course
        </Button>
      </Card>
    </motion.div>
  );
}

function LessonForm({ courseSlug, lesson, nextIndex, onSave, onClose }: { courseSlug: string; lesson: Lesson | null; nextIndex: number; onSave: (l: Lesson) => void; onClose: () => void }) {
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [url, setUrl] = useState(lesson && !isPlaceholder(lesson.youtubeId) ? `https://youtu.be/${lesson.youtubeId}` : "");
  const [duration, setDuration] = useState(String(lesson?.durationMin ?? 20));
  const [description, setDescription] = useState(lesson?.description ?? "");
  const videoId = useMemo(() => (url.trim() ? extractYouTubeId(url) : null), [url]);
  const urlInvalid = url.trim().length > 0 && !videoId;

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
      <Card className="space-y-3">
        <div className="flex items-center justify-between"><CardTitle>{lesson ? `Edit: ${lesson.title}` : "Add lesson"}</CardTitle><button onClick={onClose} aria-label="Close"><X className="h-4 w-4 text-zinc-500 hover:text-zinc-900" /></button></div>
        <Input placeholder="Lesson title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div>
          <div className="relative">
            <Youtube className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-red-600" />
            <Input placeholder="Paste YouTube URL (watch, share, embed or shorts link)" value={url} onChange={(e) => setUrl(e.target.value)} className={cn("pl-10", urlInvalid && "border-red-500/50")} />
          </div>
          {urlInvalid && <p className="mt-1 text-[11px] text-red-600">Couldn&apos;t find a video ID in that URL.</p>}
          {videoId && (
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={youTubeThumb(videoId)} alt="Video thumbnail preview" className="h-12 w-20 rounded-md object-cover" />
              <p className="text-xs text-emerald-700">Video detected — thumbnail, player and embed generated automatically.</p>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Input type="number" min={1} placeholder="Duration (min)" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-40" aria-label="Duration in minutes" />
          <Textarea placeholder="Short description" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[40px] flex-1" />
        </div>
        <Button
          disabled={!title.trim() || urlInvalid}
          onClick={() =>
            onSave({
              id: lesson?.id ?? `${courseSlug}-${String(nextIndex).padStart(2, "0")}-${Date.now().toString(36)}`,
              title: title.trim(),
              description: description.trim() || "New lesson.",
              youtubeId: videoId ?? lesson?.youtubeId ?? PLACEHOLDER_VIDEO,
              durationMin: Math.max(1, parseInt(duration) || 20),
              resources: lesson?.resources ?? [],
              keyTakeaways: lesson?.keyTakeaways ?? [],
              assignment: lesson?.assignment,
              format: lesson?.format,
            })
          }
        >
          <Check className="h-4 w-4" />{lesson ? "Save changes" : "Add lesson"}
        </Button>
      </Card>
    </motion.div>
  );
}

/* ---------------- Users ---------------- */

function UserManager({ analytics, loading }: { analytics: AnalyticsData | null; loading: boolean }) {
  const { state } = useStore();
  const [assignOpen, setAssignOpen] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});

  if (loading) {
    return (
      <Card className="space-y-3 p-5">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-100" />)}
      </Card>
    );
  }

  const users = analytics?.users ?? [];

  if (users.length === 0) {
    return (
      <Card className="py-12 text-center">
        <p className="text-sm text-zinc-500">No employees have signed up yet.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-500">
            <th className="px-5 py-3.5 font-medium">Employee</th>
            <th className="px-5 py-3.5 font-medium">Type / Position</th>
            <th className="px-5 py-3.5 font-medium">Assigned courses</th>
            <th className="px-5 py-3.5 font-medium">Completions</th>
            <th className="px-5 py-3.5 font-medium">Last login</th>
            <th className="px-5 py-3.5 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.email} className="border-b border-zinc-100 transition hover:bg-white/[0.03]">
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white">{u.name[0]}</div>
                  <div>
                    <p className="font-medium text-zinc-900">{u.name}</p>
                    <p className="text-xs text-zinc-500">{u.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <div className="space-y-0.5">
                  {u.employment_type && <p className="text-xs font-medium text-zinc-700">{u.employment_type}</p>}
                  {u.position && <p className="text-[11px] text-zinc-500">{u.position}</p>}
                  {!u.employment_type && !u.position && <span className="text-xs text-zinc-400">—</span>}
                </div>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex flex-wrap gap-1.5">
                  {(assignments[u.email] ?? []).map((slug) => {
                    const c = state.courses.find((x) => x.slug === slug);
                    return c ? <Tag key={slug} tone="primary">{c.title}</Tag> : null;
                  })}
                  {(assignments[u.email] ?? []).length === 0 && <span className="text-xs text-zinc-400">None</span>}
                </div>
                {assignOpen === u.email && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {state.courses.map((c) => {
                      const has = (assignments[u.email] ?? []).includes(c.slug);
                      return (
                        <button
                          key={c.slug}
                          onClick={() => setAssignments((a) => ({ ...a, [u.email]: has ? a[u.email].filter((s) => s !== c.slug) : [...(a[u.email] ?? []), c.slug] }))}
                          className={cn("focus-ring rounded-full border px-2.5 py-1 text-[11px] transition", has ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-border text-zinc-500 hover:text-zinc-700")}
                        >
                          {has ? "✓ " : "+ "}{c.title}
                        </button>
                      );
                    })}
                  </div>
                )}
              </td>
              <td className="px-5 py-3.5">
                <Tag tone={u.completion_count > 0 ? "success" : "default"}>{u.completion_count} lessons</Tag>
              </td>
              <td className="px-5 py-3.5 text-xs text-zinc-600">{formatLoginTime(u.last_login_at)}</td>
              <td className="px-5 py-3.5">
                <Button size="sm" variant="outline" onClick={() => setAssignOpen(assignOpen === u.email ? null : u.email)}>
                  {assignOpen === u.email ? "Done" : "Assign"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
