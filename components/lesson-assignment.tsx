"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

type AssignmentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; assignment: string; cached: boolean }
  | { status: "error"; message: string };

export function LessonAssignment({ lessonId }: { lessonId: string }) {
  const [state, setState] = useState<AssignmentState>({ status: "idle" });

  useEffect(() => {
    const aborter = new AbortController();
    setState({ status: "idle" });

    async function loadSavedAssignment() {
      try {
        const response = await fetch(`/api/assignment?lessonId=${encodeURIComponent(lessonId)}`, {
          signal: aborter.signal,
        });
        if (response.status === 404 || aborter.signal.aborted) return;

        const data = (await response.json().catch(() => ({}))) as {
          assignment?: string;
          cached?: boolean;
          error?: string;
        };
        if (!response.ok || !data.assignment) {
          throw new Error(data.error || "Couldn't load your saved assignment.");
        }
        setState({ status: "ready", assignment: data.assignment, cached: Boolean(data.cached) });
      } catch (error) {
        if (aborter.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Couldn't load your saved assignment.",
        });
      }
    }

    void loadSavedAssignment();
    return () => aborter.abort();
  }, [lessonId]);

  async function loadAssignment() {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The server resolves all lesson content from this identifier.
        body: JSON.stringify({ lessonId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        assignment?: string;
        cached?: boolean;
        error?: string;
      };
      if (!response.ok || !data.assignment) {
        throw new Error(data.error || "Couldn't prepare an assignment right now.");
      }
      setState({ status: "ready", assignment: data.assignment, cached: Boolean(data.cached) });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Couldn't prepare an assignment right now.",
      });
    }
  }

  return (
    <Card className="border-primary/15 bg-primary/[0.03] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Practice assignment
          </CardTitle>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            Turn this lesson into a practical task tailored to your learning profile.
          </p>
        </div>

        {state.status !== "ready" && (
          <Button
            size="sm"
            className="w-full shrink-0 sm:w-auto"
            disabled={state.status === "loading"}
            onClick={loadAssignment}
          >
            {state.status === "loading" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Preparing…
              </>
            ) : (
              <>
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Get assignment
              </>
            )}
          </Button>
        )}
      </div>

      {state.status === "loading" && (
        <div role="status" aria-live="polite" className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
          Creating your practical assignment…
        </div>
      )}

      {state.status === "error" && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="text-sm text-red-700">{state.message}</p>
          <Button size="sm" variant="outline" className="shrink-0" onClick={loadAssignment}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}

      {state.status === "ready" && (
        <div className="mt-4 rounded-xl border border-primary/15 bg-white p-4">
          <p className="text-sm leading-relaxed text-zinc-800">{state.assignment}</p>
          <p className="mt-3 text-xs text-zinc-500">
            {state.cached ? "Your saved assignment for this lesson." : "Saved for your next visit to this lesson."}
          </p>
        </div>
      )}
    </Card>
  );
}