"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDown, ArrowUp, BookOpen, Clock, GraduationCap, Laptop, Loader2, LogIn, MapPin, RefreshCw,
  Search, Smartphone, Tablet, UserRound, X,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AREA_LABELS, formatDuration, loginMethodLabel } from "@/lib/activity/describe";
import { ACCESSIBILITY_OPTIONS } from "@/lib/accessibility/preferences";
import type { ActivityRow } from "@/app/api/admin/activity/route";

/**
 * Super admin only: who signs in, how and from where, and how much time
 * students and tutors spend where, filterable by university. Click anyone
 * for their full activity profile. Data: /api/admin/activity(/[id]).
 */

type Role = "student" | "tutor";
type University = { id: number; name: string };
type SortKey = "name" | "lastLoginAt" | "activeSeconds" | "activeDays" | "logins" | "primary" | "secondary";

const PERIODS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last year" },
];

function ago(iso: string | null): string {
  if (!iso) return "Never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

export function ActivityPanel({ universities }: { universities: University[] }) {
  const [role, setRole] = useState<Role>("student");
  const [university, setUniversity] = useState("all");
  const [days, setDays] = useState(30);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "activeSeconds", desc: true });
  const [openId, setOpenId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ role, days: String(days), university });
    fetch(`/api/admin/activity/?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Couldn't load activity.");
        return r.json() as Promise<{ people: ActivityRow[] }>;
      })
      .then((d) => setPeople(d.people))
      .catch((e: Error) => { setError(e.message); setPeople([]); })
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [role, university, days]);

  // The two role-specific columns.
  const primary = (p: ActivityRow) => (role === "student" ? p.lessonsCompleted : p.courses);
  const secondary = (p: ActivityRow) => (role === "student" ? p.submissions : p.gradesGiven);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (people ?? []).filter((p) => !q || `${p.name ?? ""} ${p.email} ${p.university ?? ""}`.toLowerCase().includes(q));
    const value = (p: ActivityRow): string | number => {
      switch (sort.key) {
        case "name": return (p.name ?? p.email).toLowerCase();
        case "lastLoginAt": return p.lastLoginAt ? new Date(p.lastLoginAt).getTime() : 0;
        case "primary": return primary(p);
        case "secondary": return secondary(p);
        default: return p[sort.key];
      }
    };
    return [...list].sort((a, b) => {
      const x = value(a), y = value(b);
      const order = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -order : order;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, query, sort, role]);

  const summary = useMemo(() => {
    const list = shown;
    const active = list.filter((p) => p.activeSeconds > 0);
    const seconds = list.reduce((sum, p) => sum + p.activeSeconds, 0);
    return {
      people: list.length,
      active: active.length,
      seconds,
      average: active.length ? seconds / active.length : 0,
      logins: list.reduce((sum, p) => sum + p.logins, 0),
    };
  }, [shown]);

  const header = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <th scope="col" className={cn("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left")} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "name" }))}
        className="focus-ring inline-flex items-center gap-1 rounded hover:text-zinc-900"
      >
        {label}
        {sort.key === key && (sort.desc ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : <ArrowUp className="h-3 w-3" aria-hidden="true" />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Who" className="inline-flex rounded-xl bg-zinc-100 p-1 text-sm">
          {([["student", "Students", GraduationCap], ["tutor", "Tutors", UserRound]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              role="tab"
              aria-selected={role === key}
              onClick={() => { setRole(key); setSort({ key: "activeSeconds", desc: true }); }}
              className={cn("focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium", role === key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <select aria-label="University" value={university} onChange={(e) => setUniversity(e.target.value)} className="focus-ring h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm">
          <option value="all">All universities</option>
          {universities.map((u) => <option key={u.id} value={String(u.id)}>{u.name}</option>)}
          <option value="none">No university</option>
        </select>
        <select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="focus-ring h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm">
          {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
        </select>
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Search by name, email or university</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or university" className="focus-ring h-9 w-full rounded-xl border border-zinc-200 bg-white pl-8 pr-3 text-sm" />
        </label>
        <Button variant="outline" onClick={load} disabled={loading} className="h-9 gap-1.5">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden="true" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["People", String(summary.people), UserRound],
          ["Active in period", `${summary.active}`, Activity],
          ["Total time active", formatDuration(summary.seconds), Clock],
          ["Average per active person", formatDuration(summary.average), Clock],
          ["Sign-ins", String(summary.logins), LogIn],
        ].map(([label, value, Icon]) => {
          const I = Icon as typeof Clock;
          return (
            <Card key={label as string} className="p-4">
              <p className="flex items-center gap-1.5 text-xs text-zinc-500"><I className="h-3.5 w-3.5" aria-hidden="true" /> {label as string}</p>
              <p className="mt-1 text-xl font-bold text-zinc-900">{value as string}</p>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden p-0">
        {error && <p role="alert" className="m-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <caption className="sr-only">{role === "student" ? "Students" : "Tutors"} and their activity</caption>
            <thead className="border-b border-zinc-100 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                {header("name", "Person", "left")}
                <th scope="col" className="px-3 py-2 text-left font-medium">University</th>
                {header("lastLoginAt", "Last sign-in", "left")}
                {header("activeSeconds", "Time active")}
                {header("activeDays", "Active days")}
                {header("logins", "Sign-ins")}
                {header("primary", role === "student" ? "Lessons done" : "Courses")}
                {header("secondary", role === "student" ? "Submissions" : "Grades given")}
                <th scope="col" className="px-3 py-2 text-left font-medium">Most time in</th>
              </tr>
            </thead>
            <tbody>
              {people === null || (loading && !people.length) ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-zinc-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />Loading…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-zinc-500">No {role === "student" ? "students" : "tutors"} match these filters.</td></tr>
              ) : shown.map((p) => (
                <tr key={p.id} className="cursor-pointer border-b border-zinc-50 hover:bg-primary/[0.03]" onClick={() => setOpenId(p.id)}>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenId(p.id); }} className="focus-ring rounded text-left">
                      <span className="block font-medium text-zinc-900">{p.name || "—"}</span>
                      <span className="block text-xs text-zinc-500">{p.email}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600">{p.university ?? <span className="text-zinc-400">None</span>}</td>
                  <td className="px-3 py-2.5">
                    <span className="block text-zinc-800">{ago(p.lastLoginAt)}</span>
                    <span className="block text-xs text-zinc-500">
                      {p.lastLoginMethod ? loginMethodLabel(p.lastLoginMethod) : "No sign-ins recorded"}
                      {p.lastDevice ? ` · ${p.lastDevice}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-zinc-900">{formatDuration(p.activeSeconds)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.activeDays}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.logins}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{primary(p)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{secondary(p)}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{p.topArea ? AREA_LABELS[p.topArea] ?? p.topArea : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-zinc-500">
        Time counts only while the tab is open and in use (or a video is playing). Sign-in locations appear when the hosting provider reports them.
      </p>

      {openId !== null && <ProfileDrawer userId={openId} days={days} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/* ---------------- One person's profile ---------------- */

type Profile = {
  days: number;
  person: {
    id: number; name: string | null; email: string; role: Role; university: string | null; universityStatus: string | null;
    joinedAt: string | null; lastLoginAt: string | null; emailVerified: boolean; signInOptions: string[];
    position: string | null; qualification: string | null; learningGoal: string | null; onboardingDone: boolean;
    xp: number; streak: number; language: string | null; accessibility: string[];
  };
  totals: { activeSeconds: number; pageViews: number; activeDays: number; logins: number };
  logins: { at: string | null; method: string; ip: string | null; browser: string | null; os: string | null; device: string | null; place: string | null }[];
  byDay: { day: string; seconds: number }[];
  byArea: { area: string; seconds: number; views: number }[];
  byCourse: { slug: string; title: string; seconds: number; views: number }[];
  byLesson: { id: string; title: string; course: string | null; seconds: number; views: number; lastSeen: string | null; completed: boolean }[];
  recent: { at: string | null; until: string | null; path: string; area: string; seconds: number; lesson: string | null; course: string | null }[];
  ai: { feature: string; requests: number; tokens: number }[];
  learning: null | {
    courses: { slug: string; title: string; lessons: number; completed: number; lastCompleted: string | null }[];
    submissions: { at: string | null; file: string; lesson: string | null; course: string | null; marks: number | null; gradedAt: string | null }[];
    quizzes: { taken: number; graded: number };
  };
  teaching: null | {
    courses: { slug: string; title: string; published: boolean; lessons: number; learners: number; submissions: number; updatedAt: string | null }[];
    grading: { total: number; recent: number; average: number | null; last: string | null };
  };
};

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <section className="rounded-2xl border border-zinc-100 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-900">{title}</h3>
      {empty ? <p className="text-sm text-zinc-500">Nothing recorded yet.</p> : children}
    </section>
  );
}

function Bars({ rows }: { rows: { label: string; seconds: number; hint?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.seconds));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-xs">
          <div className="mb-0.5 flex justify-between gap-2">
            <span className="truncate text-zinc-700">{r.label}{r.hint && <span className="text-zinc-400"> · {r.hint}</span>}</span>
            <span className="shrink-0 tabular-nums text-zinc-500">{formatDuration(r.seconds)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(r.seconds / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeviceIcon({ device }: { device: string | null }) {
  const Icon = device === "mobile" ? Smartphone : device === "tablet" ? Tablet : Laptop;
  return <Icon className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />;
}

function ProfileDrawer({ userId, days, onClose }: { userId: number; days: number; onClose: () => void }) {
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/admin/activity/${userId}/?days=${days}`)
      .then(async (r) => { if (!r.ok) throw new Error("Couldn't load this profile."); return r.json() as Promise<Profile>; })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [userId, days]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = data?.person;
  const maxDay = Math.max(1, ...(data?.byDay.map((d) => d.seconds) ?? [1]));
  const a11yLabels = (keys: string[]) => keys.map((k) => ACCESSIBILITY_OPTIONS.find((o) => o.key === k)?.label ?? k).join(", ");

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={p ? `Activity profile: ${p.name || p.email}` : "Activity profile"}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-3xl overflow-y-auto bg-zinc-50 shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">{p ? (p.role === "tutor" ? "Tutor profile" : "Student profile") : "Profile"}</p>
            <h2 className="truncate text-lg font-bold text-zinc-900">{p ? p.name || p.email : "Loading…"}</h2>
            {p && <p className="truncate text-sm text-zinc-500">{p.email}{p.university ? ` · ${p.university}` : ""}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close profile" className="focus-ring rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {error && <p role="alert" className="m-5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {!data && !error && <p className="p-10 text-center text-sm text-zinc-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />Loading profile…</p>}

        {data && p && (
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Time active", formatDuration(data.totals.activeSeconds)],
                ["Active days", String(data.totals.activeDays)],
                ["Pages visited", String(data.totals.pageViews)],
                ["Sign-ins", String(data.totals.logins)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-zinc-100 bg-white p-3">
                  <p className="text-xs text-zinc-500">{label}</p>
                  <p className="mt-0.5 text-lg font-bold text-zinc-900">{value}</p>
                </div>
              ))}
            </div>
            <p className="-mt-2 text-xs text-zinc-500">Over the last {data.days} days.</p>

            <Section title="About">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {([
                  ["Joined", when(p.joinedAt)],
                  ["Last sign-in", when(p.lastLoginAt)],
                  ["Can sign in with", p.signInOptions.join(", ") || "—"],
                  ["Email verified", p.emailVerified ? "Yes" : "No"],
                  ["University", p.university ? `${p.university}${p.universityStatus === "pending" ? " (waiting for approval)" : ""}` : "None"],
                  [p.role === "tutor" ? "Teaches" : "Background", (p.role === "tutor" ? p.position : p.qualification) || "—"],
                  [p.role === "tutor" ? "Why Requisor" : "Goal", p.learningGoal || "—"],
                  ["Onboarding", p.onboardingDone ? "Done" : "Not finished"],
                  ...(p.role === "student" ? [["XP · streak", `${p.xp} XP · ${p.streak}-day streak`]] : []),
                  ["Language", p.language || "English"],
                  ["Accessibility", p.accessibility.length ? a11yLabels(p.accessibility) : "None chosen"],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <dt className="w-32 shrink-0 text-zinc-500">{label}</dt>
                    <dd className="min-w-0 text-zinc-800">{value}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section title="Time active per day" empty={data.byDay.every((d) => d.seconds === 0)}>
              <div className="flex h-28 items-end gap-[2px]" role="img" aria-label={`Time active per day over the last ${data.days} days`}>
                {data.byDay.map((d) => (
                  <div key={d.day} className="group relative flex-1" title={`${d.day}: ${formatDuration(d.seconds)}`}>
                    <div className="rounded-t bg-primary/80 group-hover:bg-primary" style={{ height: `${Math.max(d.seconds ? 4 : 0, (d.seconds / maxDay) * 100)}%`, minHeight: d.seconds ? 2 : 0 }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
                <span>{data.byDay[0]?.day}</span><span>{data.byDay.at(-1)?.day}</span>
              </div>
            </Section>

            <div className="grid gap-4 md:grid-cols-2">
              <Section title="Where the time goes" empty={!data.byArea.length}>
                <Bars rows={data.byArea.map((a) => ({ label: AREA_LABELS[a.area] ?? a.area, seconds: a.seconds, hint: `${a.views} visits` }))} />
              </Section>
              <Section title="Time per course" empty={!data.byCourse.length}>
                <Bars rows={data.byCourse.map((c) => ({ label: c.title, seconds: c.seconds, hint: `${c.views} visits` }))} />
              </Section>
            </div>

            <Section title="Time per lesson" empty={!data.byLesson.length}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr><th scope="col" className="py-1 text-left font-medium">Lesson</th><th scope="col" className="py-1 text-right font-medium">Time</th><th scope="col" className="py-1 text-right font-medium">Visits</th><th scope="col" className="py-1 text-right font-medium">Last seen</th><th scope="col" className="py-1 text-right font-medium">Done</th></tr>
                  </thead>
                  <tbody>
                    {data.byLesson.map((l) => (
                      <tr key={l.id} className="border-t border-zinc-50">
                        <td className="py-1.5 pr-2"><span className="block text-zinc-800">{l.title}</span>{l.course && <span className="block text-xs text-zinc-500">{l.course}</span>}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatDuration(l.seconds)}</td>
                        <td className="py-1.5 text-right tabular-nums">{l.views}</td>
                        <td className="py-1.5 text-right text-xs text-zinc-500">{ago(l.lastSeen)}</td>
                        <td className="py-1.5 text-right">{l.completed ? "✓" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {data.learning && (
              <Section title="Learning">
                <p className="mb-3 text-sm text-zinc-600">
                  Quizzes taken: <b>{data.learning.quizzes.taken}</b> ({data.learning.quizzes.graded} graded) · Assignments handed in: <b>{data.learning.submissions.length}</b>
                </p>
                {data.learning.courses.length > 0 && (
                  <ul className="mb-3 space-y-2">
                    {data.learning.courses.map((c) => (
                      <li key={c.slug} className="text-xs">
                        <div className="mb-0.5 flex justify-between"><span className="text-zinc-700"><BookOpen className="mr-1 inline h-3 w-3" aria-hidden="true" />{c.title}</span><span className="text-zinc-500">{c.completed}/{c.lessons} lessons</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.lessons ? (c.completed / c.lessons) * 100 : 0}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                )}
                {data.learning.submissions.length > 0 && (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-zinc-500"><tr><th scope="col" className="py-1 text-left font-medium">Submission</th><th scope="col" className="py-1 text-right font-medium">Handed in</th><th scope="col" className="py-1 text-right font-medium">Grade</th></tr></thead>
                    <tbody>
                      {data.learning.submissions.map((s, i) => (
                        <tr key={i} className="border-t border-zinc-50">
                          <td className="py-1.5 pr-2"><span className="block text-zinc-800">{s.lesson ?? s.file}</span><span className="block text-xs text-zinc-500">{s.course}</span></td>
                          <td className="py-1.5 text-right text-xs text-zinc-500">{when(s.at)}</td>
                          <td className="py-1.5 text-right">{s.marks === null ? <span className="text-xs text-zinc-400">Not graded</span> : `${s.marks}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>
            )}

            {data.teaching && (
              <Section title="Teaching">
                <p className="mb-3 text-sm text-zinc-600">
                  Grades given: <b>{data.teaching.grading.total}</b> ({data.teaching.grading.recent} in this period)
                  {data.teaching.grading.average !== null && <> · average mark <b>{data.teaching.grading.average}%</b></>}
                  {data.teaching.grading.last && <> · last graded {ago(data.teaching.grading.last)}</>}
                </p>
                {data.teaching.courses.length ? (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-zinc-500"><tr><th scope="col" className="py-1 text-left font-medium">Course</th><th scope="col" className="py-1 text-right font-medium">Lessons</th><th scope="col" className="py-1 text-right font-medium">Learners</th><th scope="col" className="py-1 text-right font-medium">Submissions</th><th scope="col" className="py-1 text-right font-medium">Updated</th></tr></thead>
                    <tbody>
                      {data.teaching.courses.map((c) => (
                        <tr key={c.slug} className="border-t border-zinc-50">
                          <td className="py-1.5 pr-2 text-zinc-800">{c.title} {!c.published && <span className="ml-1 rounded bg-amber-50 px-1.5 text-[10px] text-amber-700">Draft</span>}</td>
                          <td className="py-1.5 text-right tabular-nums">{c.lessons}</td>
                          <td className="py-1.5 text-right tabular-nums">{c.learners}</td>
                          <td className="py-1.5 text-right tabular-nums">{c.submissions}</td>
                          <td className="py-1.5 text-right text-xs text-zinc-500">{ago(c.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="text-sm text-zinc-500">No courses yet.</p>}
              </Section>
            )}

            <Section title="AI assistant use" empty={!data.ai.length}>
              <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {data.ai.map((a) => (
                  <li key={a.feature} className="rounded-xl bg-zinc-50 px-3 py-2"><span className="block text-xs text-zinc-500">{a.feature}</span><b>{a.requests}</b> requests</li>
                ))}
              </ul>
            </Section>

            <Section title="Sign-ins" empty={!data.logins.length}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="text-xs text-zinc-500"><tr><th scope="col" className="py-1 text-left font-medium">When</th><th scope="col" className="py-1 text-left font-medium">How</th><th scope="col" className="py-1 text-left font-medium">Device</th><th scope="col" className="py-1 text-left font-medium">Where</th></tr></thead>
                  <tbody>
                    {data.logins.map((l, i) => (
                      <tr key={i} className="border-t border-zinc-50">
                        <td className="py-1.5 pr-2 text-xs text-zinc-600">{when(l.at)}</td>
                        <td className="py-1.5 pr-2">{loginMethodLabel(l.method)}</td>
                        <td className="py-1.5 pr-2"><span className="inline-flex items-center gap-1"><DeviceIcon device={l.device} />{l.browser ?? "?"} on {l.os ?? "?"}</span></td>
                        <td className="py-1.5 text-xs text-zinc-600"><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-zinc-400" aria-hidden="true" />{l.place ?? "Location not reported"}</span>{l.ip && <span className="block text-zinc-400">IP {l.ip}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Recent pages" empty={!data.recent.length}>
              <ol className="space-y-1.5 text-sm">
                {data.recent.map((r, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 border-t border-zinc-50 pt-1.5 first:border-0 first:pt-0">
                    <span className="min-w-0">
                      <span className="block truncate text-zinc-800">{r.lesson ?? r.course ?? AREA_LABELS[r.area] ?? r.path}</span>
                      <span className="block truncate text-xs text-zinc-500">{r.lesson && r.course ? `${r.course} · ` : ""}{AREA_LABELS[r.area] ?? r.area}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-zinc-500"><span className="block">{when(r.at)}</span><span className="block tabular-nums">{formatDuration(r.seconds)} active</span></span>
                  </li>
                ))}
              </ol>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
