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

const springHover = { type: "spring" as const, stiffness: 320, damping: 22 };

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
            Welcome back{" "}
            <motion.span
              className="text-gradient inline-block"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              {state.user?.name?.split(" ")[0] ?? "there"}
            </motion.span>{" "}
            <motion.span
              className="inline-block"
              animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
              transition={{ duration: 1.4, delay: 0.4, ease: "easeInOut" }}
              style={{ transformOrigin: "70% 70%" }}
            >
              👋
            </motion.span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mt-1 text-sm text-zinc-600"
          >
            Pick up where you left off your learning paths are waiting.
          </motion.p>
        </div>
        <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={springHover}>
          <Link
            href="/app/paths/"
            className="focus-ring group inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:border-primary/50 hover:text-zinc-900"
          >
            <motion.span
              className="inline-flex"
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              <Compass className="h-4 w-4 text-primary" />
            </motion.span>
            Explore paths
            <ArrowRight className="h-3.5 w-3.5 text-zinc-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        </motion.div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((s, i) => {
          const Icon = s.icon;
          return (
            <Reveal key={s.label} delay={i * 0.06}>
              <motion.div
                whileHover={{ y: -6, scale: 1.015 }}
                transition={springHover}
                className="group"
              >
                <Card className="flex items-center gap-4 transition-shadow duration-300 group-hover:shadow-lg">
                  <motion.div
                    className={`relative overflow-hidden rounded-2xl bg-gradient-to-br p-3 ${s.tint}`}
                    whileHover={{ rotate: -6, scale: 1.08 }}
                    transition={springHover}
                  >
                    <motion.span
                      className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                      initial={{ x: "-150%" }}
                      whileHover={{ x: "150%" }}
                      transition={{ duration: 0.6, ease: "easeInOut" }}
                    />
                    <Icon className="relative h-6 w-6" />
                  </motion.div>
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
          <motion.div whileHover={{ y: -3 }} transition={springHover} className="h-full">
            <Card className="flex h-full flex-col items-center justify-center gap-3 text-center transition-shadow duration-300 hover:shadow-lg">
              <CardTitle>Overall Learning Progress</CardTitle>
              <motion.div whileHover={{ scale: 1.04 }} transition={springHover}>
                <ProgressRing value={stats.overallPct} label="complete" />
              </motion.div>
              <p className="text-xs text-zinc-600">{stats.completedLessonCount} of {stats.totalLessonCount} lessons completed</p>
            </Card>
          </motion.div>
        </Reveal>

        {/* Continue watching */}
        <Reveal delay={0.08} className="lg:col-span-2">
          <Card className="h-full">
            <div className="mb-4 flex items-center justify-between">
              <CardTitle>Continue Watching</CardTitle>
              <Link href="/app/my-learning/" className="focus-ring group flex items-center gap-1 text-xs text-primary hover:text-primary">
                View all <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </div>
            {watching.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-3 py-8 text-center"
              >
                <motion.div
                  className="rounded-2xl bg-primary/10 p-4"
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <PlayCircle className="h-8 w-8 text-primary" />
                </motion.div>
                <p className="text-sm text-zinc-700">Nothing in progress yet</p>
                <p className="max-w-xs text-xs text-zinc-500">Open any learning path and start your first lesson — it will show up here.</p>
              </motion.div>
            ) : (
              <div className="space-y-3">
                {watching.slice(0, 3).map(({ course, lesson, progress }, i) => (
                  <motion.div
                    key={lesson.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.25 }}
                    whileHover={{ x: 3 }}
                  >
                    <Link
                      href={`/app/learn/?course=${course.slug}&lesson=${lesson.id}`}
                      className="focus-ring group flex items-center gap-4 rounded-xl border border-zinc-100 bg-white/[0.03] p-3 transition-colors duration-200 hover:border-primary/40 hover:bg-white/[0.06] hover:shadow-sm"
                    >
                      <motion.div
                        whileHover={{ scale: 1.1 }}
                        transition={springHover}
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm ${course.cover}`}
                      >
                        <PlayCircle className="h-5 w-5 text-white" />
                      </motion.div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900 group-hover:text-zinc-900">{lesson.title}</p>
                        <p className="truncate text-xs text-zinc-500">{course.title} · {formatMinutes(lesson.durationMin)}</p>
                        <ProgressBar value={progress?.completed ? 100 : progress?.watchPct ?? 0} className="mt-2" />
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary" />
                    </Link>
                  </motion.div>
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
            <Link href="/app/paths/" className="focus-ring group flex items-center gap-1 text-xs text-primary hover:text-primary">
              All paths <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {recommended.map((c, i) => (
            <Reveal key={c.slug} delay={i * 0.07}>
              <motion.div whileHover={{ y: -4 }} transition={springHover}>
                <CourseCard course={c} />
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Announcements */}
        <Reveal>
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <motion.span animate={{ rotate: [0, -12, 12, -8, 0] }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 3 }}>
                <Megaphone className="h-4 w-4 text-primary" />
              </motion.span>
              <CardTitle>Announcements</CardTitle>
            </div>
            <div className="space-y-3">
              {announcements.map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ x: 3 }}
                  className="group relative overflow-hidden rounded-xl border border-zinc-100 bg-white/[0.03] p-3.5 transition-colors duration-200 hover:border-primary/30 hover:shadow-sm"
                >
                  <span className="absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-gradient-to-b from-primary to-secondary transition-transform duration-300 group-hover:scale-y-100" />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-900">{a.title}</p>
                    <span className="shrink-0 text-[11px] text-zinc-500">{a.at}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-600">{a.body}</p>
                </motion.div>
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
              {upcomingPaths.map((u, i) => {
                const Icon = upcomingIcons[u.icon as keyof typeof upcomingIcons] ?? Rocket;
                return (
                  <motion.div
                    key={u.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ x: 3 }}
                    className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white/[0.03] p-3.5 transition-colors duration-200 hover:border-cyan-400/30 hover:shadow-sm"
                  >
                    <motion.div whileHover={{ scale: 1.1, rotate: -6 }} transition={springHover} className="rounded-xl bg-accent/10 p-2.5">
                      <Icon className="h-5 w-5 text-cyan-400" />
                    </motion.div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-zinc-900">{u.title}</p>
                      <p className="text-xs text-zinc-500">Arriving {u.eta}</p>
                    </div>
                    <motion.span
                      className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[10px] font-medium text-cyan-700"
                      animate={{ opacity: [1, 0.6, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      Soon
                    </motion.span>
                  </motion.div>
                );
              })}
            </div>
            {/* Quick access */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {[
                { href: "/app/course/?slug=agentic-ai", icon: Bot, label: "Agentic AI", ring: "hover:border-violet-500/50", color: "text-violet-600" },
                { href: "/app/course/?slug=cyber-security", icon: Shield, label: "Cyber Security", ring: "hover:border-emerald-500/50", color: "text-emerald-600" },
                { href: "/app/badges/", icon: Trophy, label: "My Badges", ring: "hover:border-amber-500/50", color: "text-amber-600" },
                { href: "/app/my-learning/", icon: PlayCircle, label: "My Learning", ring: "hover:border-primary/50", color: "text-primary" },
              ].map(({ href, icon: Icon, label, ring, color }) => (
                <motion.div key={href} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={springHover}>
                  <Link
                    href={href}
                    className={`focus-ring group flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-xs font-medium text-zinc-800 shadow-sm transition-colors ${ring} hover:text-zinc-900`}
                  >
                    <motion.span whileHover={{ scale: 1.15 }} transition={springHover}>
                      <Icon className={`h-4 w-4 ${color}`} />
                    </motion.span>
                    {label}
                  </Link>
                </motion.div>
              ))}
            </div>
          </Card>
        </Reveal>
      </div>
    </PageTransition>
  );
}