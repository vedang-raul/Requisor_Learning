"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, ClipboardCheck, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { AssignmentSubmission, type SubmissionStatus } from "@/components/lesson/assignment-submission";
import { LessonAssignment } from "@/components/lesson/lesson-assignment";
import { dueDateLabel, dueInLabel } from "@/lib/courses/assignment-dates";
import { cn } from "@/lib/utils";
import type { Lesson } from "@/lib/types";

/**
 * Everything a learner is asked to do in a lesson, in one place: what is due
 * and when at the top, then the graded hand-in (one brief for everyone, or
 * one written for each learner) and the optional AI practice task.
 */
export function LessonAssignments({ lesson }: { lesson: Lesson }) {
  const curated = Boolean(lesson.assignmentAi);
  const graded = Boolean(lesson.requiresSubmission);
  const [handIn, setHandIn] = useState<SubmissionStatus>("checking");
  const [practiceMinutes, setPracticeMinutes] = useState<number | null>(null);
  const due = graded && lesson.assignmentDueDate ? lesson.assignmentDueDate : undefined;
  const dueIn = due ? dueInLabel(due) : null;
  const points = graded ? lesson.assignmentMarks : undefined;
  // A curated lesson's own brief replaces the optional practice task.
  const practice = !curated;

  const gradedNote = [
    // Once it's handed in, how long until (or since) the due date no longer matters.
    handIn === "submitted" ? null : dueIn?.text,
    points ? `${points} points` : null,
    handIn === "submitted" ? "Handed in" : handIn === "none" ? "Not handed in yet" : null,
  ].filter(Boolean).join(" · ");

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-zinc-100 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Assignments for this lesson</h3>
            <p className="mt-0.5 text-sm text-zinc-600">
              {graded && practice ? "One graded task to hand in, and a practice task written for you."
                : graded ? "One graded task to hand in."
                  : curated ? "A task written for you." : "A practice task written for you, whenever it suits you."}
            </p>
          </div>
          {graded && <Link href="/app/submissions/" className="text-sm font-semibold text-primary hover:underline">All my submissions</Link>}
        </div>

        {(graded || practice) && (
          <div className={cn("mt-4 grid gap-3", graded && practice && "sm:grid-cols-2")}>
            {graded && (
              <div className={cn(
                "flex gap-3 rounded-xl border p-3.5",
                handIn === "submitted" ? "border-emerald-200 bg-emerald-50/60" : dueIn?.soon ? "border-amber-200 bg-amber-50/70" : "border-primary/20 bg-primary/[0.04]"
              )}>
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white ring-1",
                  handIn === "submitted" ? "text-emerald-600 ring-emerald-200" : dueIn?.soon ? "text-amber-600 ring-amber-200" : "text-primary ring-primary/20")}>
                  {handIn === "submitted" ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <CalendarClock className="h-4 w-4" aria-hidden="true" />}
                </span>
                <div className="min-w-0">
                  <p className={cn("text-[11px] font-bold uppercase tracking-wide", handIn === "submitted" ? "text-emerald-700" : dueIn?.soon ? "text-amber-700" : "text-primary")}>
                    {handIn === "submitted" ? "Done · Graded task" : "To do · Graded"}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-900">
                    {handIn === "submitted" ? "Your file is handed in" : due ? `Hand in your file by ${dueDateLabel(due)}` : "Hand in your file"}
                  </p>
                  {gradedNote && <p className="mt-0.5 text-xs text-zinc-600">{gradedNote}</p>}
                </div>
              </div>
            )}
            {practice && (
              <div className="flex gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary ring-1 ring-zinc-200">
                  <Target className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Optional · Practice</p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-900">
                    {practiceMinutes ? `About ${practiceMinutes} min, whenever suits you` : "A task written for you, whenever suits you"}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600">Ungraded · saved for your next visit</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* The graded task: one brief for everyone… */}
      {graded && !curated && (
        <section className="border-b border-zinc-100 p-4 sm:p-5">
          <h4 className="flex flex-wrap items-center gap-2 text-base font-semibold text-zinc-900">
            <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Graded assignment
            {handIn === "submitted" ? <Tag tone="success">Handed in</Tag> : handIn === "none" ? <Tag>Not handed in</Tag> : null}
          </h4>
          <div className="mt-3">
            <AssignmentSubmission
              lessonId={lesson.id}
              assignmentBrief={lesson.assignment}
              totalMarks={lesson.assignmentMarks}
              dueDate={lesson.assignmentDueDate}
              embedded
              onStatusChange={setHandIn}
            />
          </div>
        </section>
      )}

      {/* …or the learner's own brief, which carries the hand-in. */}
      {curated && (
        <div className="p-4 sm:p-5">
          <LessonAssignment
            lessonId={lesson.id}
            curated
            graded={graded}
            allowSubmission
            totalMarks={graded ? lesson.assignmentMarks : undefined}
            dueDate={graded ? lesson.assignmentDueDate : undefined}
            embedded
            onSubmissionStatus={setHandIn}
          />
        </div>
      )}

      {practice && (
        <div className="p-4 sm:p-5">
          <LessonAssignment
            lessonId={lesson.id}
            // A practice task can carry an optional hand-in only when the lesson has no graded one.
            allowSubmission={!graded}
            embedded
            onMinutes={setPracticeMinutes}
          />
        </div>
      )}
    </Card>
  );
}
