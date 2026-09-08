"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, FileCheck2, Loader2 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/motion";

interface Submission {
  id: number;
  lessonId: string;
  lessonTitle: string;
  lessonExists: boolean;
  courseSlug: string;
  courseTitle: string;
  fileName: string;
  fileSize: number;
  submittedAt: string;
  checked: boolean;
  marks: number | null;
  gradedAt: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SubmissionsPage() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; submissions: Submission[] } | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/assignment/submissions")
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { submissions?: Submission[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Couldn't load your submissions.");
        if (!cancelled) setState({ status: "ready", submissions: data.submissions ?? [] });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Couldn't load your submissions." });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <PageTransition>
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Submissions</h1>
          <p className="text-sm text-zinc-500">Every assignment you&apos;ve submitted, and whether your tutor has checked it yet.</p>
        </div>

        {state.status === "loading" && (
          <div className="flex items-center gap-2 p-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
        )}
        {state.status === "error" && (
          <Card className="p-6"><p role="alert" className="text-sm text-red-700">{state.message}</p></Card>
        )}
        {state.status === "ready" && state.submissions.length === 0 && (
          <Card className="flex flex-col items-center gap-2 p-10 text-center">
            <FileCheck2 className="h-6 w-6 text-zinc-300" />
            <p className="text-sm text-zinc-500">You haven&apos;t submitted any assignments yet.</p>
          </Card>
        )}
        {state.status === "ready" && state.submissions.length > 0 && (
          <div className="space-y-2">
            {state.submissions.map((s) => (
              <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="truncate">{s.lessonTitle}</CardTitle>
                    {s.checked ? (
                      <Tag tone="success">Checked{s.marks !== null ? ` · ${s.marks}%` : ""}</Tag>
                    ) : (
                      <Tag tone="warning">Not checked yet</Tag>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {s.courseTitle} · {s.fileName} ({formatBytes(s.fileSize)}) · submitted{" "}
                    {new Date(s.submittedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  {s.checked && s.gradedAt && (
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Graded {new Date(s.gradedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.lessonExists && (
                    <Link href={`/app/learn/?course=${encodeURIComponent(s.courseSlug)}&lesson=${encodeURIComponent(s.lessonId)}`}>
                      <Button size="sm" variant="outline">Open lesson</Button>
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/assignment/submission/file?submissionId=${s.id}`, "_blank")}
                    aria-label={`Download your submission for ${s.lessonTitle}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
