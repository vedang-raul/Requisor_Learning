"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3, BookPlus, Calendar, Check, ChevronDown, Download, Users, GraduationCap,
  Mail, Pencil, Plus, ShieldCheck, Trash2, TrendingUp, TrendingDown, Video, X, Youtube, LayoutGrid,
  Clock, FileText, Send, RefreshCw, Star, MessageSquare, Smile, Meh, Frown, Hash, Filter, Quote,
  ThumbsUp, ThumbsDown, Layers, Copy, ShieldAlert, Tags, Angry, HelpCircle, PartyPopper,
  Gauge, Sparkles, ScanText,
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

type TabKey = "analytics" | "content" | "users" | "reviews";

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

const springHover = { type: "spring" as const, stiffness: 320, damping: 22 };
const springTab = { type: "spring" as const, stiffness: 500, damping: 35 };

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
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} className="flex items-center gap-2.5">
        <motion.div
          className="rounded-xl bg-primary/10 p-2"
          animate={{ rotate: [0, -6, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        >
          <ShieldCheck className="h-5 w-5 text-primary" />
        </motion.div>
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Admin <span className="text-gradient">Panel</span></h1>
          <p className="mt-1 text-sm text-zinc-600">Manage content, users and analytics for Requisor Learning.</p>
        </div>
      </motion.div>

      <div
        className="flex gap-1 overflow-x-auto border-b border-zinc-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ msOverflowStyle: "none" }}
        role="tablist"
      >
        {([
          ["analytics", "Analytics", BarChart3],
          ["content", "Courses & Lessons", LayoutGrid],
          ["users", "Users", Users],
          ["reviews", "Reviews & Ratings", Star],
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
              {active && <motion.span layoutId="admin-underline" transition={springTab} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-primary to-accent" />}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
          {tab === "analytics" && <Analytics analytics={analytics} loading={analyticsLoading} onRefresh={loadAnalytics} />}
          {tab === "content" && <ContentManager />}
          {tab === "users" && <UserManager analytics={analytics} loading={analyticsLoading} />}
          {tab === "reviews" && <ReviewsPanel />}
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
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ y: -4, scale: 1.01 }}
              className="group"
            >
              <Card className="flex items-center gap-4 transition-shadow duration-300 group-hover:shadow-lg">
                <motion.div
                  whileHover={{ rotate: -6, scale: 1.08 }}
                  transition={springHover}
                  className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br p-3", s.tint)}
                >
                  <motion.span
                    className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                    initial={{ x: "-150%" }}
                    whileHover={{ x: "150%" }}
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                  />
                  <Icon className="relative h-6 w-6" />
                </motion.div>
                <div className="min-w-0">
                  <p className={cn("truncate font-bold text-zinc-900", s.small ? "text-sm" : "text-2xl")}>{s.value}</p>
                  <p className="text-xs text-zinc-600">{s.label}</p>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Team completions by course (real DB data) */}
        <Card>
          <CardTitle className="mb-4 flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" />Team completions by course</CardTitle>
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
              {state.courses.map((c, i) => {
                const dbCount = analytics?.completionsByCourse.find((x) => x.courseSlug === c.slug)?.count ?? 0;
                const pct = Math.round((dbCount / maxCourseCompletions) * 100);
                return (
                  <motion.div key={c.slug} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="text-zinc-700">{c.title}</span>
                      <span className="text-zinc-500">{dbCount} completions</span>
                    </div>
                    <ProgressBar value={pct} />
                  </motion.div>
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
              <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}>
                <Button size="sm" variant="ghost" onClick={onRefresh} disabled={loading} aria-label="Refresh">
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button size="sm" variant="outline" onClick={exportReport}><Download className="h-3.5 w-3.5" />Export CSV</Button>
              </motion.div>
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
                <motion.div
                  key={u.email}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  whileHover={{ x: 2 }}
                  className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white/[0.03] px-3.5 py-2.5 transition-colors hover:border-primary/20"
                >
                  <span className="w-5 text-center text-xs font-bold text-zinc-500">{i + 1}</span>
                  <motion.div whileHover={{ scale: 1.1 }} transition={springHover} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white">{u.name[0]}</motion.div>
                  <span className="flex-1 truncate text-sm text-zinc-800">{u.name}</span>
                  <span className="text-xs text-zinc-500">{formatLoginTime(u.last_login_at)}</span>
                  <Tag tone="primary">{u.completion_count} done</Tag>
                </motion.div>
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
    <motion.div whileHover={{ scale: status === "sending" ? 1 : 1.08 }} whileTap={{ scale: status === "sending" ? 1 : 0.92 }}>
      <Button size="icon" variant="ghost" aria-label={`Email learners about ${lesson.title}`} title="Email all learners about this video" onClick={notify} disabled={status === "sending"}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={status}
            initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6, rotate: 20 }}
            transition={{ duration: 0.15 }}
            className="flex"
          >
            {status === "sent" ? <Check className="h-4 w-4 text-emerald-600" /> : status === "error" ? <X className="h-4 w-4 text-red-600" /> : <Send className={cn("h-4 w-4", status === "sending" && "animate-pulse")} />}
          </motion.span>
        </AnimatePresence>
      </Button>
    </motion.div>
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
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
            <Button size="sm" variant="outline" onClick={() => setCreatingCourse(true)}><Plus className="h-3.5 w-3.5" />New</Button>
          </motion.div>
        </div>
        <div className="space-y-2">
          {state.courses.map((c, i) => {
            const active = selected === c.slug;
            return (
              <motion.button
                key={c.slug}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ x: active ? 0 : 2 }}
                onClick={() => setSelected(c.slug)}
                className={cn(
                  "focus-ring relative flex w-full items-center gap-3 overflow-hidden rounded-xl border p-3 text-left transition-colors",
                  active ? "border-primary/50 bg-primary/10" : "border-zinc-100 bg-card/60 hover:border-zinc-300"
                )}
              >
                <motion.div whileHover={{ scale: 1.06 }} transition={springHover} className={cn("h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br", c.cover)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{c.title}</p>
                  <p className="text-[11px] text-zinc-500">{c.lessons.length} lessons</p>
                </div>
              </motion.button>
            );
          })}
        </div>
        <AnimatePresence>
          {creatingCourse && <CourseForm onClose={() => setCreatingCourse(false)} onSave={(c) => { upsertCourse(c); setSelected(c.slug); setCreatingCourse(false); }} />}
        </AnimatePresence>
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
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button size="sm" onClick={() => { setCreatingLesson(true); setEditingLesson(null); }}><BookPlus className="h-3.5 w-3.5" />Add lesson</Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button size="sm" variant="danger" onClick={() => { if (confirm(`Delete course "${course.title}" and all its lessons?`)) { deleteCourse(course.slug); setSelected(state.courses.find((c) => c.slug !== course.slug)?.slug ?? null); } }}>
                    <Trash2 className="h-3.5 w-3.5" />Delete course
                  </Button>
                </motion.div>
              </div>
            </div>
            <AnimatePresence>
              {(creatingLesson || editingLesson) && (
                <LessonForm
                  key={editingLesson?.id ?? "new"}
                  courseSlug={course.slug}
                  lesson={editingLesson}
                  nextIndex={course.lessons.length + 1}
                  onClose={() => { setCreatingLesson(false); setEditingLesson(null); }}
                  onSave={(l) => { upsertLesson(course.slug, l); setCreatingLesson(false); setEditingLesson(null); }}
                />
              )}
            </AnimatePresence>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {course.lessons.map((l, i) => (
                  <motion.div
                    key={l.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ delay: Math.min(i, 10) * 0.03, duration: 0.2 }}
                    whileHover={{ x: 2 }}
                    className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-card/60 p-3 transition-colors hover:border-primary/20"
                  >
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
                      <p className="flex items-center gap-1.5 truncate text-sm text-zinc-900">
                        {l.format === "reading" ? <FileText className="h-3 w-3 shrink-0 text-zinc-400" /> : <Video className="h-3 w-3 shrink-0 text-zinc-400" />}
                        {l.title}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {formatMinutes(l.durationMin)} · {l.format === "reading" ? "Reading lesson" : isPlaceholder(l.youtubeId) ? "No video yet" : `youtu.be/${l.youtubeId}`}
                      </p>
                    </div>
                    {l.format === "reading" ? <Tag tone="accent">Reading</Tag> : isPlaceholder(l.youtubeId) && <Tag tone="warning">Needs video</Tag>}
                    {l.format !== "reading" && !isPlaceholder(l.youtubeId) && <NotifyButton course={course} lesson={l} />}
                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                      <Button size="icon" variant="ghost" aria-label={`Edit ${l.title}`} onClick={() => { setEditingLesson(l); setCreatingLesson(false); }}><Pencil className="h-4 w-4" /></Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                      <Button size="icon" variant="ghost" aria-label={`Delete ${l.title}`} onClick={() => { if (confirm(`Delete lesson "${l.title}"?`)) deleteLesson(course.slug, l.id); }}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                    </motion.div>
                  </motion.div>
                ))}
              </AnimatePresence>
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
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle>New category / course</CardTitle>
          <motion.button whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }} transition={springHover} onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-zinc-500 hover:text-zinc-900" />
          </motion.button>
        </div>
        <Input placeholder="Course title (e.g. System Design)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="One-line tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value as CategoryKey)} className="focus-ring h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-zinc-800" aria-label="Category">
          <option value="product">Product Management</option>
          <option value="data">Data Analytics</option>
          <option value="ai">Agentic AI</option>
          <option value="security">Cyber Security</option>
        </select>
        <motion.div whileHover={{ scale: title.trim() ? 1.02 : 1 }} whileTap={{ scale: title.trim() ? 0.98 : 1 }}>
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
        </motion.div>
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
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle>{lesson ? `Edit: ${lesson.title}` : "Add lesson"}</CardTitle>
          <motion.button whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }} transition={springHover} onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-zinc-500 hover:text-zinc-900" />
          </motion.button>
        </div>
        <Input placeholder="Lesson title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div>
          <div className="relative">
            <Youtube className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-red-600" />
            <Input placeholder="Paste YouTube URL (watch, share, embed or shorts link)" value={url} onChange={(e) => setUrl(e.target.value)} className={cn("pl-10", urlInvalid && "border-red-500/50")} />
          </div>
          {urlInvalid && <p className="mt-1 text-[11px] text-red-600">Couldn&apos;t find a video ID in that URL.</p>}
          <AnimatePresence>
            {videoId && (
              <motion.div
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 flex items-center gap-3 overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={youTubeThumb(videoId)} alt="Video thumbnail preview" className="h-12 w-20 rounded-md object-cover" />
                <p className="text-xs text-emerald-700">Video detected — thumbnail, player and embed generated automatically.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex gap-3">
          <Input type="number" min={1} placeholder="Duration (min)" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-40" aria-label="Duration in minutes" />
          <Textarea placeholder="Short description" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[40px] flex-1" />
        </div>
        <motion.div whileHover={{ scale: !title.trim() || urlInvalid ? 1 : 1.02 }} whileTap={{ scale: !title.trim() || urlInvalid ? 1 : 0.98 }}>
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
        </motion.div>
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
            <th className="px-5 py-3.5 font-medium"><span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />Last login</span></th>
            <th className="px-5 py-3.5 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u, i) => {
            const open = assignOpen === u.email;
            return (
              <motion.tr
                key={u.email}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i, 10) * 0.03 }}
                className="border-b border-zinc-100 transition-colors hover:bg-white/[0.03]"
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <motion.div whileHover={{ scale: 1.1 }} transition={springHover} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white">{u.name[0]}</motion.div>
                    <div>
                      <p className="font-medium text-zinc-900">{u.name}</p>
                      <p className="flex items-center gap-1 text-xs text-zinc-500"><Mail className="h-3 w-3" />{u.email}</p>
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
                  <AnimatePresence>
                    {open && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-2 flex flex-wrap gap-1.5 overflow-hidden"
                      >
                        {state.courses.map((c) => {
                          const has = (assignments[u.email] ?? []).includes(c.slug);
                          return (
                            <motion.button
                              key={c.slug}
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => setAssignments((a) => ({ ...a, [u.email]: has ? a[u.email].filter((s) => s !== c.slug) : [...(a[u.email] ?? []), c.slug] }))}
                              className={cn("focus-ring rounded-full border px-2.5 py-1 text-[11px] transition-colors", has ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-border text-zinc-500 hover:text-zinc-700")}
                            >
                              {has ? "✓ " : "+ "}{c.title}
                            </motion.button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </td>
                <td className="px-5 py-3.5">
                  <Tag tone={u.completion_count > 0 ? "success" : "default"}>{u.completion_count} lessons</Tag>
                </td>
                <td className="px-5 py-3.5 text-xs text-zinc-600">{formatLoginTime(u.last_login_at)}</td>
                <td className="px-5 py-3.5">
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button size="sm" variant="outline" onClick={() => setAssignOpen(open ? null : u.email)}>
                      {open ? "Done" : "Assign"}
                      <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </motion.span>
                    </Button>
                  </motion.div>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

/* ---------------- Reviews & Ratings (with client-side NLP) ---------------- */

interface CourseReview {
  id: string;
  courseSlug: string;
  courseTitle: string;
  userName: string;
  rating: number; // 1-5
  body: string;
  createdAt: string;
}

// ── Lightweight, dependency-free NLP ──────────────────────────────────────
// Everything below runs in the browser with zero API cost and zero external
// calls. It trades the accuracy of a trained model for something instant,
// free, and easy to reason about — plenty to surface signal across a review
// list. Any piece here is a natural slot to later swap for a real model/API
// (OpenAI, AWS Comprehend, Perspective API, etc.) without touching the UI
// that consumes it — each function's return shape is what would change.

const SENTIMENT_LEXICON: Record<string, number> = {
  amazing: 3, excellent: 3, fantastic: 3, outstanding: 3, brilliant: 3, superb: 3,
  love: 3, loved: 3, best: 3, wonderful: 3, incredible: 3, perfect: 3, awesome: 3,
  great: 2, helpful: 2, clear: 2, engaging: 2, informative: 2, insightful: 2,
  practical: 2, useful: 2, comprehensive: 2, recommend: 2, enjoyed: 2, solid: 2,
  good: 1, nice: 1, decent: 1, interesting: 1, concise: 1, easy: 1, well: 1,
  fine: 0, okay: 0, ok: 0, average: 0, fair: 0,
  slow: -1, dry: -1, dense: -1, basic: -1, repetitive: -1, long: -1, rushed: -1,
  confusing: -2, boring: -2, outdated: -2, unclear: -2, lacking: -2, shallow: -2,
  frustrating: -2, mediocre: -2, disappointing: -2, weak: -2,
  bad: -2, poor: -2, useless: -3, terrible: -3, awful: -3, worst: -3, waste: -3,
  horrible: -3, broken: -3, irrelevant: -2,
};
const NEGATORS = new Set(["not", "no", "never", "isn't", "wasn't", "didn't", "doesn't", "don't"]);
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been", "being",
  "to", "of", "in", "on", "for", "with", "as", "at", "by", "this", "that", "it", "its",
  "i", "you", "he", "she", "we", "they", "my", "your", "our", "their", "me", "him", "her",
  "them", "us", "so", "if", "then", "than", "too", "very", "just", "really", "some", "all",
  "there", "here", "have", "has", "had", "do", "does", "did", "would", "could", "should",
  "will", "can", "about", "into", "out", "up", "down", "course", "lesson", "lessons", "video",
  "one", "get", "got", "much", "more", "most", "also", "was", "im", "it's", "i've", "i'm",
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

// 1 — Sentiment analysis (lexicon + negation handling)
function analyzeSentiment(text: string): { score: number; label: "positive" | "neutral" | "negative" } {
  const words = tokenize(text);
  let score = 0;
  let hits = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const base = SENTIMENT_LEXICON[w];
    if (base === undefined) continue;
    const negated = i > 0 && NEGATORS.has(words[i - 1]);
    score += negated ? -base : base;
    hits++;
  }
  const normalized = hits ? score / Math.max(hits, 3) : 0;
  const label = normalized > 0.25 ? "positive" : normalized < -0.25 ? "negative" : "neutral";
  return { score: normalized, label };
}

// 2 — Keyword extraction (single-word, topic-only — sentiment words excluded
// so this surfaces *what* is being discussed, not just tone)
function extractKeywords(texts: string[], topN = 10): { word: string; count: number }[] {
  const freq = new Map<string, number>();
  for (const text of texts) {
    const seenInThisReview = new Set<string>();
    for (const w of tokenize(text)) {
      if (w.length < 4 || STOPWORDS.has(w) || SENTIMENT_LEXICON[w] !== undefined) continue;
      if (seenInThisReview.has(w)) continue;
      seenInThisReview.add(w);
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([word, count]) => ({ word, count }));
}

// 3 — Key phrase / bigram extraction. Single-word frequency loses context —
// "not enough examples" and "loved the examples" both just surface
// "examples". Adjacent-word pairs (kept only when neither side is a
// stopword) recover phrases like "slow pacing" or "great examples", which
// read as actual reasons rather than isolated topics.
function extractPhrases(texts: string[], topN = 8): { phrase: string; count: number }[] {
  const freq = new Map<string, number>();
  for (const text of texts) {
    const tokens = tokenize(text);
    const seenInThisReview = new Set<string>();
    for (let i = 0; i < tokens.length - 1; i++) {
      const a = tokens[i], b = tokens[i + 1];
      if (a.length < 3 || b.length < 3 || STOPWORDS.has(a) || STOPWORDS.has(b)) continue;
      const phrase = `${a} ${b}`;
      if (seenInThisReview.has(phrase)) continue;
      seenInThisReview.add(phrase);
      freq.set(phrase, (freq.get(phrase) ?? 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([phrase, count]) => ({ phrase, count }));
}

// 4 — Aspect-based sentiment. A single overall sentiment score collapses a
// review like "great instructor, but the pacing was way too slow" into one
// vague number. This buckets mentions by product area and scores a small
// word-window around each mention, so mixed reviews contribute correctly to
// both the aspect they praise and the one they criticise.
const ASPECTS: Record<string, string[]> = {
  Content: ["content", "material", "examples", "depth", "topics", "curriculum", "explanations"],
  Instructor: ["instructor", "teacher", "presenter", "narrator", "explains", "explanation", "voice"],
  Pacing: ["pacing", "pace", "speed", "rushed", "slow", "fast"],
  Difficulty: ["difficulty", "difficult", "easy", "hard", "beginner", "advanced", "level"],
  Platform: ["platform", "player", "quiz", "app", "site", "loading", "buffering", "interface", "ui"],
};

function analyzeAspects(reviews: { body: string }[]) {
  const result: Record<string, { mentions: number; pos: number; neu: number; neg: number }> = {};
  for (const aspect of Object.keys(ASPECTS)) result[aspect] = { mentions: 0, pos: 0, neu: 0, neg: 0 };
  for (const r of reviews) {
    const tokens = tokenize(r.body);
    for (const [aspect, kws] of Object.entries(ASPECTS)) {
      const idx = tokens.findIndex((t) => kws.includes(t));
      if (idx === -1) continue;
      const windowText = tokens.slice(Math.max(0, idx - 5), Math.min(tokens.length, idx + 6)).join(" ");
      const { label } = analyzeSentiment(windowText);
      result[aspect].mentions++;
      result[aspect][label === "positive" ? "pos" : label === "negative" ? "neg" : "neu"]++;
    }
  }
  return result;
}

// 5 — Emotion classification, one step past pos/neg/neutral. "Disappointed"
// and "angry" both read as "negative" sentiment but call for different
// follow-up — one is a missed expectation, the other is a bad experience.
const EMOTION_WORDS: Record<string, string> = {
  love: "delight", loved: "delight", amazing: "delight", fantastic: "delight", excited: "delight", wonderful: "delight", brilliant: "delight",
  confusing: "confusion", unclear: "confusion", confused: "confusion", lost: "confusion",
  frustrating: "frustration", frustrated: "frustration", annoying: "frustration", rushed: "frustration",
  disappointing: "disappointment", disappointed: "disappointment", underwhelming: "disappointment",
  boring: "boredom", dry: "boredom", dull: "boredom", tedious: "boredom", repetitive: "boredom",
  terrible: "anger", awful: "anger", worst: "anger", hate: "anger", hated: "anger", horrible: "anger",
};
const EMOTION_META: Record<string, { icon: typeof Smile; color: string; bg: string; label: string }> = {
  delight: { icon: PartyPopper, color: "text-emerald-600", bg: "bg-emerald-500/10", label: "Delighted" },
  confusion: { icon: HelpCircle, color: "text-amber-600", bg: "bg-amber-500/10", label: "Confused" },
  frustration: { icon: Angry, color: "text-orange-600", bg: "bg-orange-500/10", label: "Frustrated" },
  disappointment: { icon: Frown, color: "text-red-500", bg: "bg-red-500/10", label: "Disappointed" },
  boredom: { icon: Meh, color: "text-zinc-500", bg: "bg-zinc-100", label: "Bored" },
  anger: { icon: Angry, color: "text-red-600", bg: "bg-red-500/10", label: "Angry" },
};
function detectEmotion(text: string): string | null {
  for (const w of tokenize(text)) if (EMOTION_WORDS[w]) return EMOTION_WORDS[w];
  return null;
}

// 6 — Very small rule-based entity spotting: known course titles mentioned
// by name, plus capitalised words that aren't sentence-initial. This is NOT
// a trained NER model (no person/org/product classification) — it's a
// heuristic that's good enough to flag "this review mentions something
// specific" (a tool, a name, a proper noun) for a human to glance at.
function extractEntities(text: string, knownTitles: string[]): string[] {
  const found = new Set<string>();
  for (const title of knownTitles) if (text.toLowerCase().includes(title.toLowerCase())) found.add(title);
  const words = text.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const w = words[i].replace(/[^A-Za-z]/g, "");
    if (w.length > 2 && /^[A-Z][a-z]+$/.test(w) && !STOPWORDS.has(w.toLowerCase())) found.add(w);
  }
  return [...found].slice(0, 5);
}

// 7 — Toxicity / moderation flag. Placeholder lexicon for demo purposes —
// swap for a real moderation endpoint (OpenAI moderation, Perspective API)
// before relying on this for actual moderation decisions.
const TOXIC_WORDS = new Set(["crap", "garbage", "stupid", "idiot", "scam", "sucks", "trash", "damn"]);
function isFlagged(text: string): boolean {
  return tokenize(text).some((w) => TOXIC_WORDS.has(w));
}

// 8 — Near-duplicate / spam detection via Jaccard similarity of token sets.
// Catches copy-pasted or bot-submitted reviews that would otherwise quietly
// skew a course's average rating.
function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a), sb = new Set(b);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union ? inter / union : 0;
}
function findDuplicates(reviews: CourseReview[]): Set<string> {
  const flagged = new Set<string>();
  const toks = reviews.map((r) => tokenize(r.body));
  for (let i = 0; i < reviews.length; i++) {
    for (let j = i + 1; j < reviews.length; j++) {
      if (reviews[i].courseSlug !== reviews[j].courseSlug) continue;
      if (jaccard(toks[i], toks[j]) > 0.55) { flagged.add(reviews[i].id); flagged.add(reviews[j].id); }
    }
  }
  return flagged;
}

function highlightTerms(text: string, terms: string[]) {
  if (terms.length === 0) return text;
  const pattern = new RegExp(`\\b(${terms.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    terms.some((k) => k.toLowerCase() === part.toLowerCase()) ? (
      <mark key={i} className="rounded bg-primary/15 px-0.5 font-medium text-primary">{part}</mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// ISO week bucket (Monday-start) for trend charting
function weekKey(iso: string): string {
  const d = new Date(iso);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

// Seed data used only when /api/admin/reviews isn't reachable yet, so the
// panel is fully demoable immediately. Spans ~9 weeks for the trend chart,
// includes a near-duplicate pair (spam-detection demo) and one flagged
// review (moderation demo). Swap in real data by wiring that endpoint to
// return { reviews: CourseReview[] } in this shape.
const days = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const SEED_REVIEWS: CourseReview[] = [
  { id: "r1", courseSlug: "agentic-ai", courseTitle: "Agentic AI", userName: "Maria Chen", rating: 5, body: "Excellent course — Sarah explained agent loops really clearly and the examples were practical. Loved it.", createdAt: days(2) },
  { id: "r2", courseSlug: "agentic-ai", courseTitle: "Agentic AI", userName: "Devon Lee", rating: 3, body: "Decent overview but some sections felt rushed and a bit confusing around tool calling. Could use more diagrams.", createdAt: days(6) },
  { id: "r3", courseSlug: "data-analytics", courseTitle: "Data Analytics", userName: "Priya Nair", rating: 4, body: "Really helpful and comprehensive. The SQL examples were great practice, though the pacing was slow in the middle.", createdAt: days(4) },
  { id: "r4", courseSlug: "data-analytics", courseTitle: "Data Analytics", userName: "Tom Rivera", rating: 2, body: "Found this outdated and a bit boring — the dashboards shown are from an old Tableau version. Disappointing.", createdAt: days(11) },
  { id: "r5", courseSlug: "product-management", courseTitle: "Product Management", userName: "Sara Kim", rating: 5, body: "Fantastic, engaging, and immediately useful. I recommend this to every new PM on the team.", createdAt: days(9) },
  { id: "r6", courseSlug: "product-management", courseTitle: "Product Management", userName: "Alex Wong", rating: 4, body: "Good structure and insightful case studies from Figma and Notion. A few sections repeat earlier material though.", createdAt: days(16) },
  { id: "r7", courseSlug: "cyber-security", courseTitle: "Cyber Security", userName: "Jordan Blake", rating: 1, body: "This course sucks, terrible pacing, very dry delivery, and the quiz questions didn't match the lesson content.", createdAt: days(14) },
  { id: "r8", courseSlug: "cyber-security", courseTitle: "Cyber Security", userName: "Nina Patel", rating: 5, body: "Clear, practical, and well organized. The phishing simulation module was brilliant and very engaging.", createdAt: days(20) },
  { id: "r9", courseSlug: "agentic-ai", courseTitle: "Agentic AI", userName: "Chris Yu", rating: 4, body: "The instructor explains things well and the examples were practical, though the platform kept buffering during videos.", createdAt: days(23) },
  { id: "r10", courseSlug: "agentic-ai", courseTitle: "Agentic AI", userName: "Ravi Shah", rating: 4, body: "The instructor explains things well and the examples were practical, though the app kept buffering during videos.", createdAt: days(24) },
  { id: "r11", courseSlug: "data-analytics", courseTitle: "Data Analytics", userName: "Emma Brooks", rating: 5, body: "Loved the hands-on examples and the instructor's explanations were clear even for a beginner like me.", createdAt: days(29) },
  { id: "r12", courseSlug: "product-management", courseTitle: "Product Management", userName: "Liam Foster", rating: 2, body: "The interface kept crashing and the quiz never loaded properly. Frustrating experience, garbage platform stability.", createdAt: days(33) },
  { id: "r13", courseSlug: "cyber-security", courseTitle: "Cyber Security", userName: "Grace Oduya", rating: 5, body: "Amazing depth on real incidents. The instructor's explanations of phishing were excellent and very clear.", createdAt: days(38) },
  { id: "r14", courseSlug: "data-analytics", courseTitle: "Data Analytics", userName: "Ben Turner", rating: 3, body: "Content was fine but the pacing was way too slow and repetitive in the middle sections. Got boring quickly.", createdAt: days(44) },
  { id: "r15", courseSlug: "agentic-ai", courseTitle: "Agentic AI", userName: "Wei Zhang", rating: 5, body: "One of the best courses I've taken — engaging, well organized, and the examples were genuinely useful at work.", createdAt: days(49) },
  { id: "r16", courseSlug: "product-management", courseTitle: "Product Management", userName: "Hannah Cole", rating: 4, body: "Great case studies and the instructor's explanations were insightful, though a bit basic in the early lessons.", createdAt: days(55) },
  { id: "r17", courseSlug: "cyber-security", courseTitle: "Cyber Security", userName: "Omar Farouk", rating: 2, body: "The platform loading was slow and the difficulty jumped around unpredictably. Confusing structure overall.", createdAt: days(60) },
  { id: "r18", courseSlug: "data-analytics", courseTitle: "Data Analytics", userName: "Zoe Bennett", rating: 5, body: "Excellent, practical, and the examples using real Notion dashboards made everything click. Highly recommend.", createdAt: days(63) },
];

const SENTIMENT_META: Record<string, { icon: typeof Smile; color: string; bg: string; label: string }> = {
  positive: { icon: Smile, color: "text-emerald-600", bg: "bg-emerald-500/10", label: "Positive" },
  neutral: { icon: Meh, color: "text-zinc-500", bg: "bg-zinc-100", label: "Neutral" },
  negative: { icon: Frown, color: "text-red-600", bg: "bg-red-500/10", label: "Negative" },
};

function StarRating({ value, size = "h-3.5 w-3.5" }: { value: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(size, n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-zinc-300")} />
      ))}
    </div>
  );
}

const springHover2 = { type: "spring" as const, stiffness: 320, damping: 22 };

type ReviewSection = "overview" | "loved-hated" | "aspects" | "trends" | "list";

function ReviewsPanel() {
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [usingSeed, setUsingSeed] = useState(false);
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [sentimentFilter, setSentimentFilter] = useState<"all" | "positive" | "neutral" | "negative">("all");
  const [section, setSection] = useState<ReviewSection>("overview");

  const load = () => {
    setLoading(true);
    fetch("/api/admin/reviews")
      .then((r) => { if (!r.ok) throw new Error("no endpoint"); return r.json(); })
      .then((d: { reviews: CourseReview[] }) => { setReviews(d.reviews ?? []); setUsingSeed(false); })
      .catch(() => { setReviews(SEED_REVIEWS); setUsingSeed(true); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const withSentiment = useMemo(
    () => reviews.map((r) => ({ ...r, sentiment: analyzeSentiment(r.body), emotion: detectEmotion(r.body) })),
    [reviews]
  );

  const courses = useMemo(() => {
    const map = new Map<string, { slug: string; title: string }>();
    for (const r of reviews) map.set(r.courseSlug, { slug: r.courseSlug, title: r.courseTitle });
    return [...map.values()];
  }, [reviews]);
  const courseTitles = useMemo(() => courses.map((c) => c.title), [courses]);

  const duplicateIds = useMemo(() => findDuplicates(reviews), [reviews]);

  const filtered = withSentiment.filter(
    (r) => (courseFilter === "all" || r.courseSlug === courseFilter) && (sentimentFilter === "all" || r.sentiment.label === sentimentFilter)
  );

  const avgRating = filtered.length ? filtered.reduce((a, r) => a + r.rating, 0) / filtered.length : 0;
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  for (const r of filtered) sentimentCounts[r.sentiment.label]++;
  const total = filtered.length || 1;

  const topKeywords = useMemo(() => extractKeywords(filtered.map((r) => r.body), 12), [filtered]);
  const topPhrases = useMemo(() => extractPhrases(filtered.map((r) => r.body), 10), [filtered]);
  const maxKeywordCount = Math.max(1, ...topKeywords.map((k) => k.count));
  const maxPhraseCount = Math.max(1, ...topPhrases.map((k) => k.count));

  const lovedPhrases = useMemo(() => extractPhrases(filtered.filter((r) => r.sentiment.label === "positive").map((r) => r.body), 6), [filtered]);
  const hatedPhrases = useMemo(() => extractPhrases(filtered.filter((r) => r.sentiment.label === "negative").map((r) => r.body), 6), [filtered]);
  const findQuote = (phrase: string, pool: typeof filtered) => pool.find((r) => r.body.toLowerCase().includes(phrase))?.body ?? "";

  const aspectData = useMemo(() => analyzeAspects(filtered), [filtered]);

  const trendWeeks = useMemo(() => {
    const buckets = new Map<string, { ratingSum: number; count: number; pos: number }>();
    for (const r of filtered) {
      const k = weekKey(r.createdAt);
      const b = buckets.get(k) ?? { ratingSum: 0, count: 0, pos: 0 };
      b.ratingSum += r.rating; b.count += 1; if (r.sentiment.label === "positive") b.pos += 1;
      buckets.set(k, b);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, b]) => ({ week, avg: b.ratingSum / b.count, count: b.count, posPct: b.pos / b.count }));
  }, [filtered]);

  const perCourse = useMemo(() => {
    return courses.map((c) => {
      const rs = withSentiment.filter((r) => r.courseSlug === c.slug);
      const avg = rs.length ? rs.reduce((a, r) => a + r.rating, 0) / rs.length : 0;
      const pos = rs.filter((r) => r.sentiment.label === "positive").length;
      const neg = rs.filter((r) => r.sentiment.label === "negative").length;
      const kws = extractKeywords(rs.map((r) => r.body), 3);
      const bestQuote = rs.filter((r) => r.sentiment.label === "positive").sort((a, b) => b.sentiment.score - a.sentiment.score)[0];
      const worstQuote = rs.filter((r) => r.sentiment.label === "negative").sort((a, b) => a.sentiment.score - b.sentiment.score)[0];
      return { ...c, count: rs.length, avg, pos, neg, neu: rs.length - pos - neg, kws, bestQuote, worstQuote };
    }).sort((a, b) => b.count - a.count);
  }, [courses, withSentiment]);

  const sections: { key: ReviewSection; label: string; icon: typeof BarChart3 }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "loved-hated", label: "Loved vs Hated", icon: ThumbsUp },
    { key: "aspects", label: "Aspects", icon: Layers },
    { key: "trends", label: "Trends", icon: TrendingUp },
    { key: "list", label: "All Reviews", icon: MessageSquare },
  ];

  return (
    <div className="space-y-6">
      {usingSeed && !loading && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700">
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          Showing demo reviews — connect a <code className="rounded bg-amber-500/15 px-1 py-0.5 font-mono">/api/admin/reviews</code> endpoint returning <code className="rounded bg-amber-500/15 px-1 py-0.5 font-mono">{"{ reviews: [...] }"}</code> to see live data.
        </motion.div>
      )}

      {/* Overview stats — always visible regardless of section */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total Reviews", value: loading ? "…" : String(filtered.length), icon: MessageSquare, tint: "text-primary from-indigo-500/20 to-indigo-500/5" },
          { label: "Average Rating", value: loading ? "…" : avgRating.toFixed(1), icon: Star, tint: "text-amber-600 from-amber-500/20 to-amber-500/5" },
          { label: "Positive Sentiment", value: loading ? "…" : `${Math.round((sentimentCounts.positive / total) * 100)}%`, icon: TrendingUp, tint: "text-emerald-600 from-emerald-500/20 to-emerald-500/5" },
          { label: "Negative Sentiment", value: loading ? "…" : `${Math.round((sentimentCounts.negative / total) * 100)}%`, icon: TrendingDown, tint: "text-red-600 from-red-500/20 to-red-500/5" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} whileHover={{ y: -4, scale: 1.01 }} className="group">
              <Card className="flex items-center gap-4 transition-shadow duration-300 group-hover:shadow-lg">
                <motion.div whileHover={{ rotate: -6, scale: 1.08 }} transition={springHover2} className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br p-3", s.tint)}>
                  <motion.span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent" initial={{ x: "-150%" }} whileHover={{ x: "150%" }} transition={{ duration: 0.6, ease: "easeInOut" }} />
                  <Icon className="relative h-6 w-6" />
                </motion.div>
                <div>
                  <p className="text-2xl font-bold text-zinc-900">{s.value}</p>
                  <p className="text-xs text-zinc-600">{s.label}</p>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Inner section switcher */}
      <div
        className="flex gap-1 overflow-x-auto border-b border-zinc-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ msOverflowStyle: "none" }}
        role="tablist"
      >
        {sections.map((s) => {
          const active = section === s.key;
          const Icon = s.icon;
          return (
            <motion.button
              key={s.key}
              role="tab"
              aria-selected={active}
              onClick={() => setSection(s.key)}
              whileHover={{ y: active ? 0 : -1 }}
              whileTap={{ scale: 0.97 }}
              className={cn("focus-ring relative flex shrink-0 items-center gap-1.5 px-3.5 py-2 text-xs font-medium transition-colors", active ? "text-primary" : "text-zinc-500 hover:text-zinc-700")}
            >
              <motion.span animate={{ scale: active ? 1.1 : 1 }} transition={springTab} className="inline-flex"><Icon className="h-3.5 w-3.5" /></motion.span>
              {s.label}
              {active && <motion.span layoutId="reviews-underline" transition={springTab} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-primary to-accent" />}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>

          {/* ---- Overview: ratings by course + key phrases/keywords ---- */}
          {section === "overview" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardTitle className="mb-4 flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" />Ratings by course</CardTitle>
                {loading ? (
                  <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-100" />)}</div>
                ) : perCourse.length === 0 ? (
                  <p className="text-xs text-zinc-500">No reviews yet.</p>
                ) : (
                  <div className="space-y-3">
                    {perCourse.map((c, i) => (
                      <motion.div key={c.slug} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="rounded-xl border border-zinc-100 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-zinc-800">{c.title}</p>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <StarRating value={c.avg} />
                            <span className="text-xs font-semibold text-zinc-700">{c.avg.toFixed(1)}</span>
                          </div>
                        </div>
                        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-zinc-100">
                          {c.pos > 0 && <motion.span initial={{ width: 0 }} animate={{ width: `${(c.pos / c.count) * 100}%` }} transition={{ duration: 0.5 }} className="bg-emerald-500" />}
                          {c.neu > 0 && <motion.span initial={{ width: 0 }} animate={{ width: `${(c.neu / c.count) * 100}%` }} transition={{ duration: 0.5, delay: 0.05 }} className="bg-zinc-300" />}
                          {c.neg > 0 && <motion.span initial={{ width: 0 }} animate={{ width: `${(c.neg / c.count) * 100}%` }} transition={{ duration: 0.5, delay: 0.1 }} className="bg-red-400" />}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-zinc-400">{c.count} review{c.count !== 1 ? "s" : ""} ·</span>
                          {c.kws.map((k) => <span key={k.word} className="flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"><Hash className="h-2.5 w-2.5" />{k.word}</span>)}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <CardTitle className="mb-1 flex items-center gap-2"><Tags className="h-4 w-4 text-primary" />Key phrases</CardTitle>
                <p className="mb-4 text-[11px] text-zinc-500">Two-word phrases extracted from review text — more context than single keywords.</p>
                {loading ? (
                  <div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-6 w-24 animate-pulse rounded-full bg-zinc-100" />)}</div>
                ) : topPhrases.length === 0 ? (
                  <p className="text-xs text-zinc-500">Not enough review text yet.</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {topPhrases.map((k, i) => {
                      const scale = 0.8 + (k.count / maxPhraseCount) * 0.55;
                      return (
                        <motion.span key={k.phrase} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ scale: scale * 1.06 }} transition={{ delay: i * 0.03, ...springHover2 }} style={{ fontSize: `${scale}rem` }} className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 font-medium text-primary">
                          {k.phrase} <span className="text-primary/50">· {k.count}</span>
                        </motion.span>
                      );
                    })}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-4">
                  {topKeywords.slice(0, 8).map((k) => <span key={k.word} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500">{k.word}</span>)}
                </div>
              </Card>
            </div>
          )}

          {/* ---- Loved vs Hated ---- */}
          {section === "loved-hated" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="border-emerald-500/20">
                  <CardTitle className="mb-1 flex items-center gap-2 text-emerald-700"><ThumbsUp className="h-4 w-4" />What learners love most</CardTitle>
                  <p className="mb-4 text-[11px] text-zinc-500">Top phrases pulled from reviews scored positive by sentiment analysis.</p>
                  {lovedPhrases.length === 0 ? <p className="text-xs text-zinc-500">Nothing surfaced yet.</p> : (
                    <div className="space-y-2.5">
                      {lovedPhrases.map((p, i) => (
                        <motion.div key={p.phrase} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium capitalize text-emerald-800">{p.phrase}</span>
                            <span className="text-[10px] text-emerald-600">{p.count} mention{p.count !== 1 ? "s" : ""}</span>
                          </div>
                          <p className="mt-1 truncate text-[11px] italic text-zinc-500">"{findQuote(p.phrase, filtered)}"</p>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </Card>
                <Card className="border-red-500/20">
                  <CardTitle className="mb-1 flex items-center gap-2 text-red-700"><ThumbsDown className="h-4 w-4" />What learners dislike most</CardTitle>
                  <p className="mb-4 text-[11px] text-zinc-500">Top phrases pulled from reviews scored negative by sentiment analysis.</p>
                  {hatedPhrases.length === 0 ? <p className="text-xs text-zinc-500">Nothing surfaced yet — that's a good sign.</p> : (
                    <div className="space-y-2.5">
                      {hatedPhrases.map((p, i) => (
                        <motion.div key={p.phrase} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="rounded-xl border border-red-500/15 bg-red-500/5 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium capitalize text-red-800">{p.phrase}</span>
                            <span className="text-[10px] text-red-600">{p.count} mention{p.count !== 1 ? "s" : ""}</span>
                          </div>
                          <p className="mt-1 truncate text-[11px] italic text-zinc-500">"{findQuote(p.phrase, filtered)}"</p>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <Card>
                <CardTitle className="mb-1 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Course highlights (auto-extracted)</CardTitle>
                <p className="mb-4 text-[11px] text-zinc-500">The single most positive and most negative review picked per course — extractive, not generated, so every quote is a real learner's words.</p>
                <div className="space-y-3">
                  {perCourse.filter((c) => c.bestQuote || c.worstQuote).map((c) => (
                    <div key={c.slug} className="rounded-xl border border-zinc-100 p-3">
                      <p className="mb-2 text-sm font-medium text-zinc-800">{c.title}</p>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {c.bestQuote && (
                          <div className="flex items-start gap-2 rounded-lg bg-emerald-500/5 p-2.5">
                            <Smile className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            <p className="text-xs leading-relaxed text-zinc-700">"{c.bestQuote.body}" <span className="text-zinc-400">— {c.bestQuote.userName}</span></p>
                          </div>
                        )}
                        {c.worstQuote && (
                          <div className="flex items-start gap-2 rounded-lg bg-red-500/5 p-2.5">
                            <Frown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                            <p className="text-xs leading-relaxed text-zinc-700">"{c.worstQuote.body}" <span className="text-zinc-400">— {c.worstQuote.userName}</span></p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ---- Aspect-based sentiment ---- */}
          {section === "aspects" && (
            <Card>
              <CardTitle className="mb-1 flex items-center gap-2"><Layers className="h-4 w-4 text-primary" />Aspect-based sentiment</CardTitle>
              <p className="mb-4 text-[11px] text-zinc-500">Sentiment scored in a word-window around each aspect mention, so a mixed review contributes correctly to both the aspect it praises and the one it criticises.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Object.entries(aspectData).map(([aspect, d], i) => {
                  const verdict = d.mentions === 0 ? "No signal yet" : d.pos > d.neg * 1.5 ? "Learners love this" : d.neg > d.pos * 1.5 ? "Common complaint" : "Mixed feedback";
                  const verdictColor = d.mentions === 0 ? "text-zinc-400" : d.pos > d.neg * 1.5 ? "text-emerald-600" : d.neg > d.pos * 1.5 ? "text-red-600" : "text-amber-600";
                  return (
                    <motion.div key={aspect} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} whileHover={{ y: -3 }} className="rounded-xl border border-zinc-100 p-3.5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-zinc-800">{aspect}</p>
                        <span className="text-[10px] text-zinc-400">{d.mentions} mention{d.mentions !== 1 ? "s" : ""}</span>
                      </div>
                      <p className={cn("mt-0.5 text-[11px] font-medium", verdictColor)}>{verdict}</p>
                      {d.mentions > 0 && (
                        <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-zinc-100">
                          {d.pos > 0 && <motion.span initial={{ width: 0 }} animate={{ width: `${(d.pos / d.mentions) * 100}%` }} className="bg-emerald-500" />}
                          {d.neu > 0 && <motion.span initial={{ width: 0 }} animate={{ width: `${(d.neu / d.mentions) * 100}%` }} className="bg-zinc-300" />}
                          {d.neg > 0 && <motion.span initial={{ width: 0 }} animate={{ width: `${(d.neg / d.mentions) * 100}%` }} className="bg-red-400" />}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ---- Trends over time ---- */}
          {section === "trends" && (
            <Card>
              <CardTitle className="mb-1 flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" />Sentiment & rating trend</CardTitle>
              <p className="mb-5 text-[11px] text-zinc-500">Average rating and share of positive-sentiment reviews, bucketed by week.</p>
              {trendWeeks.length === 0 ? (
                <p className="text-xs text-zinc-500">Not enough reviews yet to chart a trend.</p>
              ) : (
                <div className="flex items-end gap-3 overflow-x-auto pb-2">
                  {trendWeeks.map((w, i) => (
                    <div key={w.week} className="flex shrink-0 flex-col items-center gap-1.5" style={{ width: 44 }}>
                      <span className="text-[10px] font-semibold text-zinc-600">{w.avg.toFixed(1)}</span>
                      <div className="flex h-32 w-6 items-end overflow-hidden rounded-full bg-zinc-100">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${(w.avg / 5) * 100}%` }}
                          transition={{ delay: i * 0.04, duration: 0.5, ease: "easeOut" }}
                          className={cn("w-full rounded-full", w.posPct >= 0.6 ? "bg-emerald-500" : w.posPct >= 0.3 ? "bg-amber-400" : "bg-red-400")}
                        />
                      </div>
                      <span className="text-[9px] text-zinc-400">{new Date(w.week).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                      <span className="text-[9px] text-zinc-300">{w.count} rev.</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* ---- Full review list ---- */}
          {section === "list" && (
            <Card className="p-0">
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-4">
                <Filter className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="focus-ring h-8 rounded-lg border border-border bg-card px-2 text-xs text-zinc-700" aria-label="Filter by course">
                  <option value="all">All courses</option>
                  {courses.map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
                </select>
                <div className="flex gap-1">
                  {(["all", "positive", "neutral", "negative"] as const).map((s) => {
                    const active = sentimentFilter === s;
                    const meta = s !== "all" ? SENTIMENT_META[s] : null;
                    return (
                      <motion.button key={s} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => setSentimentFilter(s)} className={cn("focus-ring flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] capitalize transition-colors", active ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-zinc-500 hover:text-zinc-700")}>
                        {meta && <meta.icon className="h-3 w-3" />}{s}
                      </motion.button>
                    );
                  })}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400">{filtered.length} of {reviews.length}</span>
                  <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}>
                    <Button size="sm" variant="ghost" onClick={load} disabled={loading} aria-label="Refresh reviews"><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /></Button>
                  </motion.div>
                </div>
              </div>

              <div className="max-h-[560px] space-y-2 overflow-y-auto p-3">
                {loading ? (
                  [1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-100" />)
                ) : filtered.length === 0 ? (
                  <p className="py-10 text-center text-sm text-zinc-500">No reviews match these filters.</p>
                ) : (
                  <AnimatePresence initial={false}>
                    {filtered.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((r, i) => {
                      const meta = SENTIMENT_META[r.sentiment.label];
                      const SentimentIcon = meta.icon;
                      const emo = r.emotion ? EMOTION_META[r.emotion] : null;
                      const entities = extractEntities(r.body, courseTitles);
                      const flagged = isFlagged(r.body);
                      const dup = duplicateIds.has(r.id);
                      return (
                        <motion.div key={r.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(i, 10) * 0.03, duration: 0.2 }} whileHover={{ x: 2 }} className={cn("rounded-xl border bg-white/[0.03] p-3.5 transition-colors", flagged ? "border-red-300/60" : "border-zinc-100 hover:border-primary/20")}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white">{r.userName[0]}</div>
                              <div>
                                <p className="text-sm font-medium text-zinc-900">{r.userName}</p>
                                <p className="flex items-center gap-1 text-[11px] text-zinc-500">
                                  <Tag tone="accent">{r.courseTitle}</Tag>
                                  <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                              <StarRating value={r.rating} />
                              <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", meta.bg, meta.color)}><SentimentIcon className="h-3 w-3" />{meta.label}</span>
                              {emo && <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", emo.bg, emo.color)}><emo.icon className="h-3 w-3" />{emo.label}</span>}
                              {dup && <span className="flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-600"><Copy className="h-3 w-3" />Possible duplicate</span>}
                              {flagged && <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600"><ShieldAlert className="h-3 w-3" />Needs moderation</span>}
                            </div>
                          </div>
                          <p className="mt-2.5 flex items-start gap-1.5 text-sm leading-relaxed text-zinc-700">
                            <Quote className="mt-0.5 h-3 w-3 shrink-0 text-zinc-300" />
                            <span>{highlightTerms(r.body, topKeywords.map((k) => k.word))}</span>
                          </p>
                          {entities.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-zinc-100 pt-2">
                              <ScanText className="h-3 w-3 text-zinc-300" />
                              {entities.map((e) => <span key={e} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500">{e}</span>)}
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}