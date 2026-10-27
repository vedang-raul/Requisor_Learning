"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { CheckCircle2, Download, FileText, Loader2, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { dueDateLabel, dueInLabel } from "@/lib/courses/assignment-dates";
import { ASSIGNMENTS_CHANGED_EVENT } from "@/lib/courses/assignment-events";

type SubmissionState =
  | { status: "checking" }
  | { status: "none" }
  | { status: "submitted"; fileName: string; fileSize: number; submittedAt: string }
  | { status: "uploading" }
  | { status: "error"; message: string };

/** What the lesson's assignment overview needs to know about this hand-in. */
export type SubmissionStatus = "checking" | "none" | "submitted";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** A small labelled fact: Due / Worth / Hand in. */
function Fact({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-zinc-900">{value}</p>
      {note && <p className={cn("mt-0.5 text-xs", tone === "warn" ? "font-medium text-amber-700" : "text-zinc-500")}>{note}</p>}
    </div>
  );
}

export function AssignmentSubmission({ lessonId, assignmentBrief, totalMarks, dueDate, embedded = false, briefLabel = "Your brief", onStatusChange }: {
  lessonId: string; assignmentBrief?: string; totalMarks?: number; dueDate?: string;
  /** Inside the lesson's "Assignments" card: no card of its own. */
  embedded?: boolean;
  briefLabel?: string;
  onStatusChange?: (status: SubmissionStatus) => void;
}) {
  const [state, setState] = useState<SubmissionState>({ status: "checking" });
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef(onStatusChange); reportRef.current = onStatusChange;

  useEffect(() => {
    if (state.status === "checking" || state.status === "none" || state.status === "submitted") reportRef.current?.(state.status);
  }, [state.status]);

  useEffect(() => {
    const aborter = new AbortController();
    setState({ status: "checking" });

    fetch(`/api/assignment/submission?lessonId=${encodeURIComponent(lessonId)}`, { signal: aborter.signal })
      .then(async (response) => {
        if (response.status === 404) return setState({ status: "none" });
        const data = (await response.json().catch(() => ({}))) as {
          fileName?: string; fileSize?: number; submittedAt?: string; error?: string;
        };
        if (!response.ok || !data.fileName || data.fileSize === undefined || !data.submittedAt) {
          throw new Error(data.error || "Couldn't check your submission status.");
        }
        setState({ status: "submitted", fileName: data.fileName, fileSize: data.fileSize, submittedAt: data.submittedAt });
      })
      .catch((error) => {
        if (aborter.signal.aborted) return;
        setState({ status: "error", message: error instanceof Error ? error.message : "Couldn't check your submission status." });
      });

    return () => aborter.abort();
  }, [lessonId]);

  async function upload(file: File) {
    setState({ status: "uploading" });
    try {
      const form = new FormData();
      form.set("lessonId", lessonId);
      form.set("file", file);
      const response = await fetch("/api/assignment/submission", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as {
        fileName?: string; fileSize?: number; submittedAt?: string; error?: string;
      };
      if (!response.ok || !data.fileName || data.fileSize === undefined || !data.submittedAt) {
        throw new Error(data.error || "Couldn't upload your assignment.");
      }
      setState({ status: "submitted", fileName: data.fileName, fileSize: data.fileSize, submittedAt: data.submittedAt });
      window.dispatchEvent(new Event(ASSIGNMENTS_CHANGED_EVENT));
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Couldn't upload your assignment." });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Replacing a file clears any grade and comments the tutor has given it.
  function replace() {
    if (!window.confirm("Replace your file? If your tutor has already checked it, their grade and comments are cleared and they check the new one.")) return;
    fileInputRef.current?.click();
  }
  function pick() {
    if (state.status === "submitted") replace();
    else fileInputRef.current?.click();
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (state.status === "submitted" && !window.confirm("Replace your file? If your tutor has already checked it, their grade and comments are cleared and they check the new one.")) return;
    void upload(file);
  }

  const due = dueDate ? dueDateLabel(dueDate) : null;
  const dueIn = dueDate ? dueInLabel(dueDate) : null;

  const body = (
    <>
      {(dueDate || totalMarks) && (
        <div className="grid gap-2 sm:grid-cols-3">
          {due && <Fact label="Due" value={due} note={state.status === "submitted" ? undefined : dueIn?.text} tone={dueIn?.soon ? "warn" : undefined} />}
          {totalMarks && <Fact label="Worth" value={`${totalMarks} points`} />}
          <Fact label="Hand in" value="One file" note="PDF or Word (.docx)" />
        </div>
      )}

      {assignmentBrief ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-zinc-900">{briefLabel}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-zinc-700">{assignmentBrief}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">Your tutor requires a file submission for this lesson.</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {state.status === "checking" && (
        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Checking your submission…
        </div>
      )}

      {(state.status === "none" || state.status === "uploading") && (
        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "mt-4 flex flex-col items-center rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors",
            dragging ? "border-primary bg-primary/[0.06]" : "border-primary/25 bg-primary/[0.02]"
          )}
        >
          {state.status === "uploading" ? (
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-zinc-700">
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />Uploading…
            </p>
          ) : (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Upload className="h-5 w-5" aria-hidden="true" /></span>
              <p className="mt-2 text-sm font-semibold text-zinc-900">Drag your file here, or</p>
              <Button className="mt-2" onClick={pick}>Choose a file</Button>
              <p className="mt-2 text-xs text-zinc-500">PDF or Word (.docx), up to 10 MB. You can replace it until your tutor checks it.</p>
            </>
          )}
        </div>
      )}

      {state.status === "error" && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="text-sm text-red-700">{state.message}</p>
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => fileInputRef.current?.click()}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}

      {state.status === "submitted" && (
        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn("mt-4 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between", dragging ? "border-primary bg-primary/[0.06]" : "border-emerald-500/25 bg-emerald-500/5")}
        >
          <div className="flex min-w-0 items-start gap-2.5 text-sm text-zinc-800">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-emerald-500/20"><FileText className="h-4 w-4 text-emerald-600" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />Handed in</p>
              <p className="truncate text-sm">{state.fileName} <span className="text-zinc-500">· {formatBytes(state.fileSize)}</span></p>
              <p className="text-xs text-zinc-500">
                {new Date(state.submittedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`/api/assignment/submission/file?lessonId=${encodeURIComponent(lessonId)}`, "_blank")}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              View file
            </Button>
            <Button size="sm" variant="outline" onClick={replace}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Replace
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return <div>{body}</div>;
  return (
    <Card className="border-primary/15 bg-primary/[0.03] p-4 sm:p-5">
      <CardTitle className="mb-3 flex items-center gap-2">
        <Upload className="h-4 w-4 text-primary" aria-hidden="true" />
        Assignment submission
      </CardTitle>
      {body}
    </Card>
  );
}
