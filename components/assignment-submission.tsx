"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Loader2, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

type SubmissionState =
  | { status: "checking" }
  | { status: "none" }
  | { status: "submitted"; fileName: string; fileSize: number; submittedAt: string }
  | { status: "uploading" }
  | { status: "error"; message: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssignmentSubmission({ lessonId, assignmentBrief }: { lessonId: string; assignmentBrief?: string }) {
  const [state, setState] = useState<SubmissionState>({ status: "checking" });
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Couldn't upload your assignment." });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Card className="border-primary/15 bg-primary/[0.03] p-4 sm:p-5">
      <CardTitle className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-primary" aria-hidden="true" />
        Assignment submission
      </CardTitle>

      {assignmentBrief && (
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">{assignmentBrief}</p>
      )}
      {!assignmentBrief && (
        <p className="mt-1 text-sm leading-relaxed text-zinc-600">Your tutor requires a file submission for this lesson.</p>
      )}
      <p className="mt-1 text-xs text-zinc-500">PDF or Word (.docx), up to 10 MB.</p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
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

      {state.status === "none" && (
        <Button size="sm" className="mt-4 w-full sm:w-auto" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          Upload your submission
        </Button>
      )}

      {state.status === "uploading" && (
        <div role="status" aria-live="polite" className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
          Uploading…
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
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-zinc-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <div>
              <p className="font-medium">{state.fileName} <span className="font-normal text-zinc-500">({formatBytes(state.fileSize)})</span></p>
              <p className="text-xs text-zinc-500">
                Submitted {new Date(state.submittedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
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
              Download
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Re-upload
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
