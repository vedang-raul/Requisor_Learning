"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen, CheckCircle2, Clock, Trophy, Megaphone, ArrowRight,
  PlayCircle, Rocket, Network, MessageSquare, Cloud, Compass, Bot, Shield,
} from "lucide-react";
import { useStore, useOverallStats, useContinueWatching } from "@/lib/store";
import { announcements, upcomingPaths } from "@/lib/data";
import { Card, CardTitle } from "@/components/ui/card";
import { ProgressRing } from "@/components/progress-ring";
import { Counter } from "@/components/counter";
import { CourseCard } from "@/components/course-card";
import { PageTransition, Reveal } from "@/components/motion";
import { ProgressBar } from "@/components/ui/progress";
import { formatMinutes } from "@/lib/utils";

const upcomingIcons = { network: Network, message: MessageSquare, cloud: Cloud } as const;

export default function DashboardPage() {
  const { state } = useStore();
  const stats = useOverallStats();
  const watching = useContinueWatching();

  const statCards = [
    { label: "Courses Available", value: stats.coursesAvailable, icon: BookOpen, tint: "from-indigo-500/20 to-indigo-500/5 text-primary" },
    { label: "Completed", value: stats.completedCourses, icon: CheckCircle2, tint: "from-emerald-500/20 to-emerald-500/5 text-emerald-600" },
    { label: "Hours Learned", value: stats.hoursLearned, icon: Clock, decimals: 1, tint: "from-cyan-500/20 to-cyan-500/5 text-cyan-400" },
    { label: "Badges Earned", value: stats.badges, icon: Trophy, tint: "from-amber-500/20 to-amber-500/5 text-amber-600" },
  ];

  // Recommend courses that are not started yet (or least progressed)
  const recommended = state.courses
    .map((c) => ({ c, done: c.lessons.filter((l) => state.progress[l.id]?.completed).length / Math.max(1, c.lessons.length) }))
    .sort((a, b) => a.done - b.done)
    .slice(0, 3)
    .map((x) => x.c);

  return (
    <PageTransition className="space-y-8">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <motion.h1 initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="text-2xl font-bold md:text-3xl">
            Welcome back, <span className="text-gradient">{state.user?.name?.split(" ")[0] ?? "there"}</span> 👋
          </motion.h1>
          <p className="mt-1 text-sm text-zinc-600">Pick up where you left off — your learning paths are waiting.</p>
        </div>
        <Link href="/app/paths/" className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition hover:border-primary/50 hover:text-zinc-900">
          <Compass className="h-4 w-4 text-primary" /> Explore paths
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((s, i) => {
          const Icon = s.icon;
          return (
            <Reveal key={s.label} delay={i * 0.06}>
              <motion.div whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                <Card className="flex items-center gap-4">
                  <div className={`rounded-2xl bg-gradient-to-br p-3 ${s.tint}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-zinc-900"><Counter to={s.value} decimals={s.decimals ?? 0} /></p>
                    <p className="text-xs text-zinc-600">{s.label}</p>
                  </div>
                </Card>
              </motion.div>
            </Reveal>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Overall progress */}
        <Reveal>
          <Card className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CardTitle>Overall Learning Progress</CardTitle>
            <ProgressRing value={stats.overallPct} label="complete" />
            <p className="text-xs text-zinc-600">{stats.completedLessonCount} of {stats.totalLessonCount} lessons completed</p>
          </Card>
        </Reveal>

        {/* Continue watching */}
        <Reveal delay={0.08} className="lg:col-span-2">
          <Card className="h-full">
            <div className="mb-4 flex items-center justify-between">
              <CardTitle>Continue Watching</CardTitle>
              <Link href="/app/my-learning/" className="focus-ring flex items-center gap-1 text-xs text-primary hover:text-primary">View all <ArrowRight className="h-3 w-3" /></Link>
            </div>
            {watching.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="rounded-2xl bg-primary/10 p-4"><PlayCircle className="h-8 w-8 text-primary" /></div>
                <p className="text-sm text-zinc-700">Nothing in progress yet</p>
                <p className="max-w-xs text-xs text-zinc-500">Open any learning path and start your first lesson — it will show up here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {watching.slice(0, 3).map(({ course, lesson, progress }) => (
                  <Link
                    key={lesson.id}
                    href={`/app/learn/?course=${course.slug}&lesson=${lesson.id}`}
                    className="focus-ring group flex items-center gap-4 rounded-xl border border-zinc-100 bg-white/[0.03] p-3 transition hover:border-primary/40 hover:bg-white/[0.06]"
                  >
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${course.cover}`}>
                      <PlayCircle className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900 group-hover:text-zinc-900">{lesson.title}</p>
                      <p className="truncate text-xs text-zinc-500">{course.title} · {formatMinutes(lesson.durationMin)}</p>
                      <ProgressBar value={progress?.completed ? 100 : progress?.watchPct ?? 0} className="mt-2" />
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-1 group-hover:text-primary" />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </Reveal>
      </div>

      {/* Recommended */}
      <section>
        <Reveal>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recommended Learning</h2>
            <Link href="/app/paths/" className="focus-ring flex items-center gap-1 text-xs text-primary hover:text-primary">All paths <ArrowRight className="h-3 w-3" /></Link>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {recommended.map((c, i) => (
            <Reveal key={c.slug} delay={i * 0.07}><CourseCard course={c} /></Reveal>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Announcements */}
        <Reveal>
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              <CardTitle>Announcements</CardTitle>
            </div>
            <div className="space-y-3">
              {announcements.map((a) => (
                <div key={a.id} className="rounded-xl border border-zinc-100 bg-white/[0.03] p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-900">{a.title}</p>
                    <span className="shrink-0 text-[11px] text-zinc-500">{a.at}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-600">{a.body}</p>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>

        {/* Upcoming paths */}
        <Reveal delay={0.08}>
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Rocket className="h-4 w-4 text-cyan-400" />
              <CardTitle>Upcoming Learning Paths</CardTitle>
            </div>
            <div className="space-y-3">
              {upcomingPaths.map((u) => {
                const Icon = upcomingIcons[u.icon as keyof typeof upcomingIcons] ?? Rocket;
                return (
                  <div key={u.id} className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white/[0.03] p-3.5">
                    <div className="rounded-xl bg-accent/10 p-2.5"><Icon className="h-5 w-5 text-cyan-400" /></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-zinc-900">{u.title}</p>
                      <p className="text-xs text-zinc-500">Arriving {u.eta}</p>
                    </div>
                    <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[10px] font-medium text-cyan-700">Soon</span>
                  </div>
                );
              })}
            </div>
            {/* Quick access */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <Link href="/app/course/?slug=agentic-ai" className="focus-ring flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-xs font-medium text-zinc-800 transition hover:border-violet-500/50 hover:text-zinc-900"><Bot className="h-4 w-4 text-violet-600" />Agentic AI</Link>
              <Link href="/app/course/?slug=cyber-security" className="focus-ring flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-xs font-medium text-zinc-800 transition hover:border-emerald-500/50 hover:text-zinc-900"><Shield className="h-4 w-4 text-emerald-600" />Cyber Security</Link>
              <Link href="/app/badges/" className="focus-ring flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-xs font-medium text-zinc-800 transition hover:border-amber-500/50 hover:text-zinc-900"><Trophy className="h-4 w-4 text-amber-600" />My Badges</Link>
              <Link href="/app/my-learning/" className="focus-ring flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-xs font-medium text-zinc-800 transition hover:border-primary/50 hover:text-zinc-900"><PlayCircle className="h-4 w-4 text-primary" />My Learning</Link>
            </div>
          </Card>
        </Reveal>
      </div>
    </PageTransition>
  );
}
