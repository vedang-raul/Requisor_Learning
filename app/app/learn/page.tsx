"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, FileText, Link2,
  ListChecks, MessageSquare, NotebookPen, PlayCircle, Bookmark, BookmarkCheck, Sparkles, SearchX, FileDown,
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

type TabKey = "description" | "resources" | "notes" | "assignment" | "discussion";

const tabs: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: "description", label: "Description", icon: FileText },
  { key: "resources", label: "Resources", icon: Link2 },
  { key: "notes", label: "Notes", icon: NotebookPen },
  { key: "assignment", label: "Assignment", icon: ListChecks },
  { key: "discussion", label: "Discussion", icon: MessageSquare },
];

const seedComments = [
  { author: "Sara Iyer", at: "2d ago", text: "The examples in this one made it click for me — recommend watching at 1.25x." },
  { author: "Dev Patel", at: "5d ago", text: "Sharing my notes in the #learning channel if anyone wants them." },
];

function LearnView() {
  const params = useSearchParams();
  const courseSlug = params.get("course");
  const lessonId = params.get("lesson");
  const { state, toggleComplete, recordView, setNote, toggleSavedLesson, setWatchPct } = useStore();
  const [tab, setTab] = useState<TabKey>("description");
  const [celebrate, setCelebrate] = useState(false);
  const [courseDone, setCourseDone] = useState(false);
  const [comments, setComments] = useState(seedComments);
  const [newComment, setNewComment] = useState("");

  const course = state.courses.find((c) => c.slug === courseSlug);
  const lesson = course?.lessons.find((l) => l.id === lessonId);
  const { pct } = useCourseProgress(course);

  // Record the view + simulate watch progress accruing while the page is open
  useEffect(() => {
    if (course && lesson) {
      recordView(course.slug, lesson.id);
      const t = setTimeout(() => setWatchPct(lesson.id, 25), 15000);
      return () => clearTimeout(t);
    }
  }, [course, lesson, recordView, setWatchPct]);

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
    const { courseCompleted } = toggleComplete(course.slug, lesson.id);
    if (!completed) {
      setCelebrate(true);
      setCourseDone(courseCompleted);
    }
  };

  return (
    <PageTransition>
      <Confetti fire={celebrate} onDone={() => setCelebrate(false)} />

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
          <Tag tone={completed ? "success" : "default"}>{completed ? "Completed" : progress?.watchPct ? `${progress.watchPct}% watched` : "Not started"}</Tag>
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
          <VideoEmbed youtubeId={lesson.youtubeId} title={lesson.title} />

          {/* Action bar */}
          <Card className="flex flex-wrap items-center gap-4 py-4">
            <Button onClick={onToggleComplete} variant={completed ? "secondary" : "primary"}>
              <CheckCircle2 className="h-4 w-4" />
              {completed ? "Completed ✓ (click to undo)" : "Mark as Complete"}
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
                      <div className="gradient-border rounded-2xl p-5">
                        <div className="flex items-start gap-3">
                          <div className="rounded-xl bg-amber-500/10 p-2.5"><ListChecks className="h-5 w-5 text-amber-600" /></div>
                          <div>
                            <p className="text-sm font-semibold text-zinc-900">Assignment</p>
                            <p className="mt-1.5 text-sm leading-relaxed text-zinc-700">{lesson.assignment}</p>
                            <p className="mt-3 text-xs text-zinc-500">Submit via your onboarding buddy or the #learning Slack channel.</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="py-6 text-center text-sm text-zinc-500">No assignment for this lesson — enjoy the video and move on. 🎬</p>
                    )
                  )}
                  {tab === "discussion" && (
                    <div className="space-y-4">
                      {comments.map((c, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white">{c.author[0]}</div>
                          <div className="flex-1 rounded-xl border border-zinc-100 bg-white/[0.03] p-3">
                            <div className="flex justify-between text-xs"><span className="font-medium text-zinc-800">{c.author}</span><span className="text-zinc-600">{c.at}</span></div>
                            <p className="mt-1 text-sm leading-relaxed text-zinc-700">{c.text}</p>
                          </div>
                        </div>
                      ))}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!newComment.trim()) return;
                          setComments((cs) => [...cs, { author: state.user?.name ?? "You", at: "just now", text: newComment.trim() }]);
                          setNewComment("");
                        }}
                        className="flex gap-2"
                      >
                        <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add to the discussion…" className="min-h-[44px] flex-1" aria-label="New comment" />
                        <Button type="submit" size="md" className="self-end">Post</Button>
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
