"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, FileText, Link2,
  ListChecks, MessageSquare, NotebookPen, PlayCircle, Bookmark, BookmarkCheck,
  Sparkles, SearchX, FileDown, GraduationCap, SkipForward, Trash2,
} from "lucide-react";
import { useStore, useCourseProgress } from "@/lib/store";
import { cn, formatMinutes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/input";
import { VideoEmbed } from "@/components/video-embed";
import { Confetti } from "@/components/confetti";
import { PageTransition } from "@/components/motion";
import { LessonQuiz } from "@/components/lesson-quiz";

/* ─── Personalised Assignment ─────────────────────────────────────────────── */
function PersonalisedAssignment({ lesson }: { lesson: import("@/lib/types").Lesson }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (fetched) return;
    setFetched(true);
    setLoading(true);
    fetch("/api/assignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lessonTitle: lesson.title,
        description: lesson.description,
        keyTakeaways: lesson.keyTakeaways,
        assignment: lesson.assignment,
      }),
    })
      .then((r) => r.json() as Promise<{ assignment?: string }>)
      .then((data) => setText(data.assignment ?? lesson.assignment ?? null))
      .catch(() => setText(lesson.assignment ?? null))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  return (
    <div className="gradient-border rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-amber-500/10 p-2.5"><ListChecks className="h-5 w-5 text-amber-600" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900">Assignment</p>
          {loading ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
              <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
              Personalising for you…
            </div>
          ) : (
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-700">{text}</p>
          )}
          <p className="mt-3 text-xs text-zinc-500">Submit via your onboarding buddy or the #learning Slack channel.</p>
        </div>
      </div>
    </div>
  );
}

type TabKey = "description" | "resources" | "notes" | "assignment" | "discussion";

const tabs: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: "description", label: "Description", icon: FileText },
  { key: "resources", label: "Resources", icon: Link2 },
  { key: "notes", label: "Notes", icon: NotebookPen },
  { key: "assignment", label: "Assignment", icon: ListChecks },
  { key: "discussion", label: "Discussion", icon: MessageSquare },
];

interface Comment {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  body: string;
  created_at: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Sync a completion/un-completion event to the DB (best-effort). */
function syncCompletion(lessonId: string, courseSlug: string, completed: boolean) {
  fetch("/api/completions", {
    method: completed ? "POST" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId, courseSlug }),
  }).catch(() => {});
}

function LearnView() {
  const params = useSearchParams();
  const router = useRouter();
  const courseSlug = params.get("course");
  const lessonId = params.get("lesson");
  const { state, toggleComplete, recordView, setNote, toggleSavedLesson, setWatchPct } = useStore();

  const [tab, setTab] = useState<TabKey>("description");
  const [celebrate, setCelebrate] = useState(false);
  const [courseDone, setCourseDone] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  // Auto-advance countdown (seconds remaining, null = not counting)
  const [autoAdvance, setAutoAdvance] = useState<number | null>(null);

  // Discussion comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const course = state.courses.find((c) => c.slug === courseSlug);
  const lesson = course?.lessons.find((l) => l.id === lessonId);
  const { pct } = useCourseProgress(course);

  // ── View tracking ─────────────────────────────────────────────────────
  useEffect(() => {
    if (course && lesson) {
      recordView(course.slug, lesson.id);
      const t = setTimeout(() => setWatchPct(lesson.id, 25), 15000);
      return () => clearTimeout(t);
    }
  }, [course, lesson, recordView, setWatchPct]);

  // Reset auto-advance when lesson changes
  useEffect(() => {
    setAutoAdvance(null);
  }, [lessonId]);

  // ── Auto-advance countdown ────────────────────────────────────────────
  useEffect(() => {
    if (autoAdvance === null) return;
    if (autoAdvance <= 0) {
      if (course && lesson) {
        const next = course.lessons[course.lessons.indexOf(lesson) + 1];
        if (next) router.push(`/app/learn/?course=${course.slug}&lesson=${next.id}`);
      }
      return;
    }
    const t = setTimeout(() => setAutoAdvance((a) => (a !== null ? a - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [autoAdvance, course, lesson, router]);

  // ── Lesson comments ───────────────────────────────────────────────────
  const loadComments = useCallback((lid: string) => {
    setCommentsLoading(true);
    setCommentsError(null);
    fetch(`/api/comments?lessonId=${encodeURIComponent(lid)}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `Failed to load comments (${r.status})`);
        }
        return r.json();
      })
      .then((d) => setComments(d.comments ?? []))
      .catch((e: Error) => setCommentsError(e.message || "Failed to load comments."))
      .finally(() => setCommentsLoading(false));
  }, []);

  // Load comments as soon as the lesson loads so the Discussion tab
  // shows persisted comments immediately after a refresh.
  useEffect(() => {
    setComments([]);
    if (lessonId) loadComments(lessonId);
  }, [lessonId, loadComments]);

  const postComment = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newComment.trim() || !lessonId || submitting) return;
      setSubmitting(true);
      setCommentsError(null);
      try {
        const res = await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId, body: newComment.trim() }),
        });
        if (res.ok) {
          const { comment } = await res.json();
          setComments((cs) => [comment, ...cs]);
          setNewComment("");
        } else {
          const d = await res.json().catch(() => ({} as { error?: string }));
          setCommentsError(
            res.status === 401
              ? "Your session has expired — please sign in again to post."
              : d.error || `Couldn't post your comment (${res.status}). Please try again.`
          );
        }
      } catch {
        setCommentsError("Couldn't post your comment — check your connection and try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [newComment, lessonId, submitting]
  );

  const deleteComment = useCallback(async (commentId: number) => {
    setCommentsError(null);
    try {
      const res = await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
      if (res.ok) {
        setComments((cs) => cs.filter((c) => c.id !== commentId));
      } else {
        const d = await res.json().catch(() => ({} as { error?: string }));
        setCommentsError(d.error || `Couldn't delete the comment (${res.status}).`);
      }
    } catch {
      setCommentsError("Couldn't delete the comment — check your connection and try again.");
    }
  }, []);

  const idx = useMemo(() => (course && lesson ? course.lessons.indexOf(lesson) : -1), [course, lesson]);

  if (!course || !lesson) {
    return (
      <div className="glass-card mx-auto mt-16 flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <SearchX className="h-10 w-10 text-zinc-600" />
        <p className="text-sm font-medium text-zinc-800">Lesson not found</p>
        <p className="text-xs text-zinc-500">The link may be outdated, or the lesson was removed.</p>
        <Link href="/app/paths/"><Button variant="outline" size="sm">Back to Learning Paths</Button></Link>
      </div>
    );
  }

  const progress = state.progress[lesson.id];
  const completed = !!progress?.completed;
  const prev = idx > 0 ? course.lessons[idx - 1] : null;
  const next = idx < course.lessons.length - 1 ? course.lessons[idx + 1] : null;
  const saved = state.savedLessons.includes(lesson.id);

  const onToggleComplete = () => {
    const nowCompleting = !completed;
    const { courseCompleted } = toggleComplete(course.slug, lesson.id);
    if (nowCompleting) {
      setCelebrate(true);
      setCourseDone(courseCompleted);
    }
    syncCompletion(lesson.id, course.slug, nowCompleting);
  };

  // Called by VideoEmbed when the YouTube video finishes playing
  const onVideoEnded = () => {
    if (!state.progress[lesson.id]?.completed) {
      const { courseCompleted } = toggleComplete(course.slug, lesson.id);
      setCelebrate(true);
      if (courseCompleted) setCourseDone(true);
      syncCompletion(lesson.id, course.slug, true);
    }
    if (next) setAutoAdvance(5);
  };

  return (
    <PageTransition>
      <Confetti fire={celebrate} onDone={() => setCelebrate(false)} />
      <AnimatePresence>{quizOpen && <LessonQuiz lesson={lesson} onClose={() => setQuizOpen(false)} />}</AnimatePresence>

      {/* Course completion banner */}
      <AnimatePresence>
        {courseDone && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="gradient-border mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎉</span>
              <div>
                <p className="text-sm font-semibold text-zinc-900">Learning path completed — outstanding work!</p>
                <p className="text-xs text-zinc-600">Your badge for {course.title} is ready.</p>
              </div>
            </div>
            <Link href="/app/badges/"><Button size="sm"><Sparkles className="h-3.5 w-3.5" />View badge</Button></Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/app/course/?slug=${course.slug}`} className="focus-ring text-xs text-primary hover:text-primary">← {course.title}</Link>
          <h1 className="mt-0.5 truncate text-xl font-bold md:text-2xl">{lesson.title}</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <Tag><Clock className="h-3 w-3" />{formatMinutes(lesson.durationMin)} est.</Tag>
          <Tag tone={completed ? "success" : "default"}>
            {completed ? "Completed" : progress?.watchPct ? `${progress.watchPct}% ${lesson.format === "reading" ? "read" : "watched"}` : "Not started"}
          </Tag>
          <button
            onClick={() => toggleSavedLesson(lesson.id)}
            aria-label={saved ? "Remove from saved" : "Save lesson"}
            className="focus-ring rounded-lg border border-border bg-white p-1.5 text-zinc-600 transition hover:text-zinc-900"
          >
            {saved ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <Bookmark className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
        {/* Main column */}
        <div className="min-w-0 space-y-5">
          <VideoEmbed
            youtubeId={lesson.youtubeId}
            title={lesson.title}
            format={lesson.format}
            resourceUrl={lesson.format === "reading" ? lesson.resources[0]?.url : undefined}
            onEnded={onVideoEnded}
          />

          {/* Auto-advance banner */}
          <AnimatePresence>
            {autoAdvance !== null && next && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3"
              >
                <div className="flex items-center gap-2.5">
                  <SkipForward className="h-4 w-4 text-primary" />
                  <span className="text-sm text-zinc-800">
                    Next: <span className="font-medium">{next.title}</span>
                    <span className="ml-1.5 text-zinc-500">— starting in {autoAdvance}s</span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => router.push(`/app/learn/?course=${course.slug}&lesson=${next.id}`)}>
                    <SkipForward className="h-3.5 w-3.5" />Play now
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAutoAdvance(null)}>Stay</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action bar */}
          <Card className="flex flex-wrap items-center gap-4 py-4">
            <Button onClick={onToggleComplete} variant={completed ? "secondary" : "primary"}>
              <CheckCircle2 className="h-4 w-4" />
              {completed ? "Completed ✓ (click to undo)" : "Mark as Complete"}
            </Button>
            <Button onClick={() => setQuizOpen(true)} variant="outline">
              <GraduationCap className="h-4 w-4" />
              Test yourself
            </Button>
            <div className="min-w-[160px] flex-1">
              <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
                <span>Course progress</span><span>{pct}%</span>
              </div>
              <ProgressBar value={pct} />
            </div>
            <div className="flex gap-2">
              {prev && (
                <Link href={`/app/learn/?course=${course.slug}&lesson=${prev.id}`}>
                  <Button variant="outline" size="sm"><ChevronLeft className="h-4 w-4" />Previous</Button>
                </Link>
              )}
              {next && (
                <Link href={`/app/learn/?course=${course.slug}&lesson=${next.id}`}>
                  <Button variant="outline" size="sm">Next<ChevronRight className="h-4 w-4" /></Button>
                </Link>
              )}
            </div>
          </Card>

          {/* Tabs */}
          <div>
            <div className="flex gap-1 overflow-x-auto border-b border-zinc-200" role="tablist">
              {tabs.map((t) => {
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
                    {tab === t.key && (
                      <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-primary to-accent" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-5">
              <AnimatePresence mode="wait">
                <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  {tab === "description" && (
                    <div className="space-y-5">
                      <p className="text-sm leading-relaxed text-zinc-700">{lesson.description}</p>
                      <div>
                        <CardTitle className="mb-3">Key Takeaways</CardTitle>
                        <ul className="space-y-2">
                          {lesson.keyTakeaways.map((k, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-700">
                              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{k}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                  {tab === "resources" && (
                    <div className="space-y-2.5">
                      {lesson.resources.map((r, i) => (
                        <a
                          key={i}
                          href={r.url}
                          className="focus-ring group flex items-center gap-3 rounded-xl border border-zinc-100 bg-white/[0.03] p-3.5 transition hover:border-primary/40"
                        >
                          <div className="rounded-lg bg-primary/10 p-2">
                            {r.type === "pdf" ? <FileDown className="h-4 w-4 text-primary" /> : <Link2 className="h-4 w-4 text-cyan-400" />}
                          </div>
                          <span className="flex-1 text-sm text-zinc-800 group-hover:text-zinc-900">{r.label}</span>
                          <Tag tone={r.type === "pdf" ? "primary" : "accent"}>{r.type.toUpperCase()}</Tag>
                        </a>
                      ))}
                      <p className="pt-1 text-[11px] text-zinc-600">Resource links are placeholders — admins can point them at real PDFs and docs.</p>
                    </div>
                  )}
                  {tab === "notes" && (
                    <div className="space-y-2">
                      <Textarea
                        value={state.notes[lesson.id] ?? ""}
                        onChange={(e) => setNote(lesson.id, e.target.value)}
                        placeholder="Write your notes for this lesson… (auto-saved locally)"
                        className="min-h-[160px]"
                        aria-label="Lesson notes"
                      />
                      <p className="text-[11px] text-zinc-600">Notes are saved automatically on this device.</p>
                    </div>
                  )}
                  {tab === "assignment" && (
                    lesson.assignment ? (
                      <PersonalisedAssignment lesson={lesson} />
                    ) : (
                      <p className="py-6 text-center text-sm text-zinc-500">No assignment for this lesson — enjoy the video and move on. 🎬</p>
                    )
                  )}
                  {tab === "discussion" && (
                    <div className="space-y-4">
                      {commentsError && (
                        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {commentsError}
                        </div>
                      )}
                      {commentsLoading ? (
                        <div className="space-y-3">
                          {[1, 2].map((i) => (
                            <div key={i} className="flex gap-3 animate-pulse">
                              <div className="h-8 w-8 shrink-0 rounded-lg bg-zinc-200" />
                              <div className="flex-1 space-y-2 rounded-xl border border-zinc-100 p-3">
                                <div className="h-3 w-24 rounded bg-zinc-200" />
                                <div className="h-3 w-full rounded bg-zinc-200" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : comments.length === 0 ? (
                        <p className="py-4 text-center text-sm text-zinc-500">No comments yet — be the first to start the discussion.</p>
                      ) : (
                        comments.map((c) => (
                          <div key={c.id} className="flex gap-3 group">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white">
                              {c.user_name[0]}
                            </div>
                            <div className="flex-1 rounded-xl border border-zinc-100 bg-white/[0.03] p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-xs font-medium text-zinc-800">{c.user_name}</span>
                                  <span className="text-[11px] text-zinc-500">{relativeTime(c.created_at)}</span>
                                </div>
                                {(c.user_email === state.user?.email || state.user?.role === "admin") && (
                                  <button
                                    onClick={() => deleteComment(c.id)}
                                    aria-label="Delete comment"
                                    className="opacity-0 group-hover:opacity-100 focus-ring rounded p-0.5 text-zinc-400 transition hover:text-red-600"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="mt-1 text-sm leading-relaxed text-zinc-700">{c.body}</p>
                            </div>
                          </div>
                        ))
                      )}
                      <form onSubmit={postComment} className="flex gap-2">
                        <Textarea
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="Add to the discussion…"
                          className="min-h-[44px] flex-1"
                          aria-label="New comment"
                        />
                        <Button type="submit" size="md" className="self-end" disabled={submitting || !newComment.trim()}>
                          {submitting ? "Posting…" : "Post"}
                        </Button>
                      </form>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Contents sidebar */}
        <aside className="xl:sticky xl:top-20 xl:h-[calc(100vh-6rem)]">
          <Card className="flex h-full flex-col p-0">
            <div className="border-b border-zinc-200 p-4">
              <CardTitle>Course Contents</CardTitle>
              <p className="mt-1 text-xs text-zinc-500">{course.lessons.length} lessons · {pct}% complete</p>
              <ProgressBar value={pct} className="mt-2.5" />
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2.5">
              {course.lessons.map((l, i) => {
                const p = state.progress[l.id];
                const current = l.id === lesson.id;
                return (
                  <Link
                    key={l.id}
                    href={`/app/learn/?course=${course.slug}&lesson=${l.id}`}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "focus-ring group flex items-center gap-2.5 rounded-xl p-2.5 text-sm transition",
                      current ? "bg-primary/10 text-primary" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-800"
                    )}
                  >
                    {p?.completed ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : current ? (
                      <PlayCircle className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-zinc-700" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{i + 1}. {l.title}</span>
                      <span className="block text-[11px] text-zinc-600">{formatMinutes(l.durationMin)}{current ? " · Now playing" : ""}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </Card>
        </aside>
      </div>
    </PageTransition>
  );
}

export default function LearnPage() {
  return (
    <Suspense>
      <LearnView />
    </Suspense>
  );
}
