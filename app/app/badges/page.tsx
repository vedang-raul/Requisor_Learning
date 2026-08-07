"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Award, Calendar, Crown, Hash, Medal, Star, Trophy, User,
} from "lucide-react";
import { useStore, useEarnedBadges, useOverallStats } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { PageTransition, Reveal } from "@/components/motion";
import { Tag } from "@/components/ui/badge";
import { Counter } from "@/components/counter";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry, LeaderboardResponse } from "@/app/api/leaderboard/route";

const springHover = { type: "spring" as const, stiffness: 320, damping: 22 };

function LeaderboardRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const { rank, name, xp, isSelf } = entry;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      whileHover={{ x: 2 }}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200",
        isSelf ? "bg-primary/10" : "hover:bg-zinc-50"
      )}
    >
      <span className="flex w-6 shrink-0 items-center justify-center">
        {rank === 1 ? (
          <motion.span animate={{ rotate: [0, -10, 10, 0] }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2 }}>
            <Crown className="h-4 w-4 fill-amber-400 text-amber-500" />
          </motion.span>
        ) : (
          <span className={cn("text-sm font-bold", rank === 2 ? "text-zinc-700" : rank === 3 ? "text-amber-700" : "text-zinc-400")}>
            {rank}
          </span>
        )}
      </span>
      <motion.div
        whileHover={{ scale: 1.08 }}
        transition={springHover}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm",
          isSelf
            ? "bg-gradient-to-br from-primary to-secondary"
            : "bg-gradient-to-br from-primary/60 to-secondary/60"
        )}
      >
        {(name[0] ?? "?").toUpperCase()}
      </motion.div>
      <span className={cn("min-w-0 flex-1 truncate text-sm", isSelf ? "font-semibold text-primary" : "text-zinc-800")}>
        {name}{isSelf ? " (you)" : ""}
      </span>
      <span className="text-xs font-semibold text-primary">{xp.toLocaleString()} XP</span>
    </motion.div>
  );
}

export default function BadgesPage() {
  const { state } = useStore();
  const badges = useEarnedBadges();
  const stats = useOverallStats();

  const [lbTop, setLbTop] = useState<LeaderboardEntry[]>([]);
  const [lbSelf, setLbSelf] = useState<LeaderboardEntry | null>(null);
  const [lbLoading, setLbLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json() as Promise<LeaderboardResponse>)
      .then((data) => {
        setLbTop(data.top ?? []);
        setLbSelf(data.self ?? null);
      })
      .catch(() => {})
      .finally(() => setLbLoading(false));
  }, []);

  return (
    <PageTransition className="space-y-8">
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <h1 className="text-2xl font-bold md:text-3xl">Badges & <span className="text-gradient">Achievements</span></h1>
        <p className="mt-1 text-sm text-zinc-600">Complete learning paths to earn badges and rack up XP.</p>
      </motion.div>

      {/* Gamification stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { label: "XP Points", value: state.xp, icon: Medal, tint: "text-primary from-indigo-500/20 to-indigo-500/5" },
          { label: "Badges Earned", value: badges.length, icon: Trophy, tint: "text-emerald-600 from-emerald-500/20 to-emerald-500/5" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <Reveal key={s.label} delay={i * 0.06}>
              <motion.div whileHover={{ y: -4, scale: 1.01 }} transition={springHover} className="group">
                <Card className="flex items-center gap-4 transition-shadow duration-300 group-hover:shadow-lg">
                  <motion.div
                    whileHover={{ rotate: -8, scale: 1.08 }}
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
                  <div>
                    <p className="text-2xl font-bold text-zinc-900"><Counter to={s.value} suffix="" /></p>
                    <p className="text-xs text-zinc-600">{s.label}</p>
                  </div>
                </Card>
              </motion.div>
            </Reveal>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Badge certificates */}
        <div className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">Your Badges</h2>
          {badges.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="glass-card flex flex-col items-center gap-3 py-16 text-center"
            >
              <motion.div animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }} className="rounded-2xl bg-amber-500/10 p-5">
                <Medal className="h-10 w-10 text-amber-600" />
              </motion.div>
              <p className="text-sm font-medium text-zinc-800">No badges yet — your first one is waiting</p>
              <p className="max-w-sm text-xs leading-relaxed text-zinc-500">
                Complete all lessons in any learning path to earn its badge. You&apos;re {stats.overallPct}% of the way through the catalog.
              </p>
              <motion.div whileHover={{ y: -2, scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={springHover}>
                <Link href="/app/paths/" className="focus-ring mt-1 flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-secondary px-4 py-2 text-sm font-medium text-white shadow-glow-sm hover:shadow-glow">
                  Keep learning
                </Link>
              </motion.div>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {badges.map((b, i) => (
                <Reveal key={b.id} delay={i * 0.08}>
                  <motion.div
                    whileHover={{ y: -6, rotate: -0.5, scale: 1.015 }}
                    transition={springHover}
                    className="gradient-border group relative overflow-hidden rounded-2xl p-6 shadow-soft transition-shadow duration-300 hover:shadow-xl"
                  >
                    <motion.div
                      className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-500/10 blur-2xl"
                      animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.span
                      className="absolute right-4 top-4 text-amber-400"
                      animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.15, 1] }}
                      transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" }}
                    >
                      <Star className="h-3.5 w-3.5 fill-amber-400" />
                    </motion.span>
                    <div className="mb-4 flex items-center justify-between">
                      <motion.div
                        whileHover={{ rotate: -6, scale: 1.08 }}
                        transition={springHover}
                        className="rounded-2xl bg-gradient-to-br from-amber-400/25 to-amber-600/10 p-3"
                      >
                        <Award className="h-7 w-7 text-amber-600" />
                      </motion.div>
                      <Tag tone="warning">Completed</Tag>
                    </div>
                    <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Certificate of Completion</p>
                    <h3 className="mt-1 text-lg font-bold">{b.courseTitle}</h3>
                    <div className="mt-4 space-y-1.5 border-t border-zinc-200 pt-4 text-xs text-zinc-600">
                      <p className="flex items-center gap-1.5"><User className="h-3 w-3 shrink-0 text-zinc-400" /><span className="text-zinc-600">Employee:</span> {state.user?.name}</p>
                      <p className="flex items-center gap-1.5"><Calendar className="h-3 w-3 shrink-0 text-zinc-400" /><span className="text-zinc-600">Completed:</span> {new Date(b.earnedAt).toLocaleDateString(undefined, { dateStyle: "long" })}</p>
                      <p className="flex items-center gap-1.5"><Hash className="h-3 w-3 shrink-0 text-zinc-400" /><span className="text-zinc-600">Badge ID:</span> <span className="font-mono text-primary">{b.id}</span></p>
                    </div>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            Leaderboard
            <motion.span animate={{ y: [0, -2, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}>
              <Crown className="h-4 w-4 text-amber-500" />
            </motion.span>
          </h2>
          <Card className="p-0">
            <div className="border-b border-zinc-200 px-4 py-3 text-xs text-zinc-500">All-time · XP earned</div>
            <div className="p-2">
              {lbLoading ? (
                /* Skeleton */
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                    <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-zinc-200" />
                    <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-zinc-200" />
                    <div className="h-3 flex-1 animate-pulse rounded bg-zinc-200" style={{ animationDelay: `${i * 80}ms` }} />
                    <div className="h-3 w-14 animate-pulse rounded bg-zinc-200" />
                  </div>
                ))
              ) : lbTop.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Trophy className="h-8 w-8 text-zinc-300" />
                  <p className="text-sm text-zinc-500">No one has earned XP yet.</p>
                  <p className="text-xs text-zinc-400">Complete your first lesson to claim the top spot!</p>
                </div>
              ) : (
                <>
                  {lbTop.map((p, i) => (
                    <LeaderboardRow key={p.rank} entry={p} index={i} />
                  ))}

                  {/* Caller is outside top-10: show a visual separator then their row */}
                  {lbSelf && (
                    <>
                      <div className="my-1 flex items-center gap-2 px-3">
                        <div className="h-px flex-1 border-t border-dashed border-zinc-300" />
                        <span className="text-[10px] text-zinc-400">your rank</span>
                        <div className="h-px flex-1 border-t border-dashed border-zinc-300" />
                      </div>
                      <LeaderboardRow entry={lbSelf} index={lbSelf.rank - 1} />
                    </>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}