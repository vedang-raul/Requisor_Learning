"use client";

import { useState } from "react";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { renderMarkdownLite } from "@/components/markdown-lite";
import { Course, LessonProgress } from "@/lib/types";

interface MockUser {
  name: string;
  email: string;
  progress: number;
  lastLogin: string;
  assigned: string[];
}

function buildContext(courses: Course[], progress: Record<string, LessonProgress>, mockUsers: MockUser[]): string {
  const lines: string[] = ["Course completion (by course):"];
  for (const c of courses) {
    const done = c.lessons.filter((l) => progress[l.id]?.completed).length;
    const pct = c.lessons.length ? Math.round((done / c.lessons.length) * 100) : 0;
    lines.push(`- ${c.title}: ${done}/${c.lessons.length} lessons complete (${pct}%)`);
  }
  lines.push("", "Employee roster (demo data):");
  for (const u of mockUsers) {
    lines.push(`- ${u.name}: ${u.progress}% overall progress, assigned to [${u.assigned.join(", ")}], last login ${u.lastLogin}`);
  }
  return lines.join("\n");
}

export function TeamInsights({
  courses,
  progress,
  mockUsers,
}: {
  courses: Course[];
  progress: Record<string, LessonProgress>;
  mockUsers: MockUser[];
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: buildContext(courses, progress, mockUsers) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate insights.");
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate insights right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <CardTitle>AI Team Insights</CardTitle>
        </div>
        <Button size="sm" variant="outline" onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {summary ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {!summary && !loading && !error && (
        <p className="text-sm text-zinc-500">
          Get an AI-written summary of cohort progress — who&apos;s excelling, who might need a nudge, and one suggested action.
        </p>
      )}
      {loading && <p className="text-sm text-zinc-500">Analyzing progress…</p>}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={generate} className="focus-ring shrink-0 font-medium underline hover:no-underline">
            Retry
          </button>
        </div>
      )}
      {summary && !loading && <div className="text-sm font-light leading-relaxed text-zinc-800">{renderMarkdownLite(summary)}</div>}

      <p className="mt-3 text-[11px] text-zinc-600">Based on demo roster/leaderboard data — connect your SSO/HRIS for real team analytics.</p>
    </Card>
  );
}
