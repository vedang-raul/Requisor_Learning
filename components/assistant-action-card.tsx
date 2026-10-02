"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Eye, EyeOff, FileText, GraduationCap, Loader2, Sparkles, X, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AssistantAction } from "@/lib/assistant-actions";
import { INSUFFICIENT_CONTENT_CODE, parseAssignment } from "@/lib/assignment-format";
import type { Course } from "@/lib/types";

/**
 * One confirmation card for an action the chat assistant proposed. Nothing
 * happens until the user clicks Confirm; the card then calls the same API the
 * regular screens use (so every permission and validation check applies).
 */

export type ActionOutcome = { status: "done"; message: string } | { status: "cancelled" };

/** Screens listening for this reload their data after the assistant changes it. */
export const DATA_CHANGED_EVENT = "requisor:data-changed";

type State =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; message: string; href?: string; hrefLabel?: string }
  | { phase: "cancelled" }
  | { phase: "error"; message: string };

const lessonHref = (courseSlug: string, lessonId: string) =>
  `/app/learn/?course=${encodeURIComponent(courseSlug)}&lesson=${encodeURIComponent(lessonId)}`;

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Loads a managed course fresh (current revision) and saves an updated copy. */
async function updateCourse(slug: string, change: (course: Course) => Course): Promise<void> {
  const list = await fetch("/api/tutor/courses");
  const data = await readJson(list);
  if (!list.ok) throw new Error(String(data.error ?? "Couldn't load your courses."));
  const items = (data.courses ?? []) as { course: Course }[];
  const course = items.find((item) => item.course.slug === slug)?.course;
  if (!course) throw new Error("That course is no longer available to you.");
  const res = await fetch(`/api/courses/${encodeURIComponent(slug)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(change(course)),
  });
  const saved = await readJson(res);
  if (!res.ok) throw new Error(String(saved.error ?? "Couldn't save the course."));
}

function describe(action: AssistantAction): { icon: typeof Sparkles; title: string; lines: string[]; confirm: string } {
  switch (action.kind) {
    case "generate_assignment":
      return { icon: Sparkles, title: "Create my practice assignment", lines: [action.lessonTitle], confirm: "Create it" };
    case "open_quiz":
      return { icon: GraduationCap, title: "Take the quiz", lines: [action.lessonTitle], confirm: "Open quiz" };
    case "open_page":
      return { icon: ArrowRight, title: `Go to ${action.label}`, lines: [], confirm: "Go" };
    case "grade_submission":
      return {
        icon: ClipboardCheck, title: "Save this grade",
        lines: [`${action.studentName} · ${action.lessonTitle}`, `${action.points} / ${action.maxPoints} points${action.status && action.status !== "None" ? ` · ${action.status}` : ""}`],
        confirm: "Save grade",
      };
    case "set_course_published":
      return {
        icon: action.published ? Eye : EyeOff,
        title: action.published ? "Publish course" : "Unpublish course",
        lines: [action.courseTitle, action.published ? "It becomes visible to all students." : "Students won't see it until it's published again."],
        confirm: action.published ? "Publish" : "Unpublish",
      };
    case "set_lesson_published":
      return {
        icon: action.published ? Eye : EyeOff,
        title: action.publishAt ? "Schedule lesson" : action.published ? "Publish lesson" : "Move lesson to drafts",
        lines: [
          `${action.lessonTitle} · ${action.courseTitle}`,
          ...(action.publishAt ? [`Goes live ${new Date(action.publishAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} (your time). Hidden from students until then.`] : []),
        ],
        confirm: action.publishAt ? "Schedule" : action.published ? "Publish" : "Move to drafts",
      };
    case "create_lesson": {
      const l = action.lesson;
      const content = l.format === "reading" ? "Text lesson" : l.youtubeId && l.youtubeId !== "REPLACE_ME" ? "YouTube video" : "No video or text yet";
      const assignment = l.requiresSubmission
        ? `Graded submission · ${l.assignmentMarks} points · due ${l.assignmentDueDate}`
        : l.assignment ? "Assignment text (AI practice available)" : "No assignment";
      return {
        icon: BookOpen,
        title: `Add lesson to ${action.courseTitle}`,
        lines: [
          l.title,
          `${content} · ${l.durationMin} min${l.section ? ` · ${l.section}` : ""}`,
          assignment,
          `${l.keyTakeaways.length} takeaway${l.keyTakeaways.length === 1 ? "" : "s"} · ${l.resources.length} resource link${l.resources.length === 1 ? "" : "s"}`,
          l.published === false ? "Saved as a draft (only you can see it)"
            : l.publishAt ? `Scheduled — goes live ${new Date(l.publishAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} (your time)`
            : "Published — visible to students",
        ],
        confirm: l.published === false ? "Save draft" : l.publishAt ? "Add & schedule" : "Add & publish",
      };
    }
  }
}

export function AssistantActionCard({ action, onOutcome }: { action: AssistantAction; onOutcome: (outcome: ActionOutcome) => void }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "idle" });
  const { icon: Icon, title, lines, confirm } = describe(action);

  function finish(message: string, extra: { href?: string; hrefLabel?: string } = {}, changed = false) {
    setState({ phase: "done", message, ...extra });
    onOutcome({ status: "done", message });
    if (changed) window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
  }

  async function run() {
    setState({ phase: "running" });
    try {
      switch (action.kind) {
        case "open_page":
          finish(`Opened ${action.label}.`);
          router.push(action.href);
          return;
        case "open_quiz":
          finish(`Opened the quiz for "${action.lessonTitle}".`);
          router.push(`${lessonHref(action.courseSlug, action.lessonId)}&quiz=1`);
          return;
        case "generate_assignment": {
          const res = await fetch("/api/assignment", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId: action.lessonId }),
          });
          const data = await readJson(res);
          if (data.code === INSUFFICIENT_CONTENT_CODE || !res.ok || typeof data.assignment !== "string") {
            throw new Error(String(data.error ?? "Couldn't create the assignment."));
          }
          const brief = parseAssignment(data.assignment);
          finish(
            brief ? `Your practice assignment "${brief.title}" is ready.` : "Your practice assignment is ready.",
            { href: lessonHref(action.courseSlug, action.lessonId), hrefLabel: "Open it in the lesson" }
          );
          return;
        }
        case "grade_submission": {
          const res = await fetch("/api/tutor/assignment-submissions/grade", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ submissionId: action.submissionId, points: action.points, status: action.status }),
          });
          const data = await readJson(res);
          if (!res.ok) throw new Error(String(data.error ?? "Couldn't save the grade."));
          finish(`Saved ${action.points} / ${action.maxPoints} points${action.status && action.status !== "None" ? ` (${action.status})` : ""} for ${action.studentName}.`, {
            href: `/app/tutor/assignment/?submissionId=${action.submissionId}`, hrefLabel: "Open in grader",
          }, true);
          return;
        }
        case "set_course_published":
          await updateCourse(action.courseSlug, (c) => ({ ...c, published: action.published }));
          finish(action.published ? `"${action.courseTitle}" is live for students.` : `"${action.courseTitle}" is now a private draft.`, {}, true);
          return;
        case "set_lesson_published":
          await updateCourse(action.courseSlug, (c) => {
            if (!c.lessons.some((l) => l.id === action.lessonId)) throw new Error("That lesson no longer exists.");
            return { ...c, lessons: c.lessons.map((l) => (l.id === action.lessonId ? { ...l, published: action.published, publishAt: action.publishAt } : l)) };
          });
          finish(action.publishAt ? `"${action.lessonTitle}" is scheduled.` : action.published ? `"${action.lessonTitle}" is published.` : `"${action.lessonTitle}" is back in drafts.`, {}, true);
          return;
        case "create_lesson":
          await updateCourse(action.courseSlug, (c) => {
            if (c.lessons.some((l) => l.id === action.lesson.id)) throw new Error("This lesson was already added.");
            return { ...c, lessons: [...c.lessons, action.lesson] };
          });
          finish(`Added "${action.lesson.title}" to ${action.courseTitle}${action.lesson.published === false ? " as a draft" : ""}.`, {
            href: "/app/tutor/", hrefLabel: "Open Tutor Workspace",
          }, true);
          return;
      }
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : "Something went wrong." });
    }
  }

  return (
    <div className={cn(
      "rounded-2xl border bg-white p-3 text-sm shadow-soft",
      state.phase === "done" ? "border-emerald-200" : state.phase === "error" ? "border-red-200" : state.phase === "cancelled" ? "border-zinc-200 opacity-70" : "border-primary/30"
    )}>
      <p className="flex items-center gap-2 font-semibold text-zinc-900">
        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{title}
      </p>
      {lines.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 pl-6 text-xs text-zinc-600">
          {lines.map((line, i) => <li key={i} className={i === 0 ? "font-medium text-zinc-800" : undefined}>{line}</li>)}
        </ul>
      )}

      {(state.phase === "idle" || state.phase === "running") && (
        <div className="mt-2.5 flex gap-2 pl-6">
          <Button size="sm" onClick={() => void run()} disabled={state.phase === "running"}>
            {state.phase === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{confirm}
          </Button>
          <Button size="sm" variant="ghost" disabled={state.phase === "running"} onClick={() => { setState({ phase: "cancelled" }); onOutcome({ status: "cancelled" }); }}>
            <X className="h-3.5 w-3.5" />Cancel
          </Button>
        </div>
      )}
      {state.phase === "done" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6 text-xs text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{state.message}
          {state.href && (
            <button type="button" onClick={() => router.push(state.href!)} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              <FileText className="h-3 w-3" />{state.hrefLabel}
            </button>
          )}
        </div>
      )}
      {state.phase === "cancelled" && <p className="mt-2 pl-6 text-xs text-zinc-500">Cancelled — nothing was changed.</p>}
      {state.phase === "error" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6 text-xs text-red-700">
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />{state.message}
          <button type="button" onClick={() => void run()} className="font-semibold text-primary hover:underline">Try again</button>
        </div>
      )}
    </div>
  );
}
