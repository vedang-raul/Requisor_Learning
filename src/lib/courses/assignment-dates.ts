/**
 * Assignment due dates are calendar dates (YYYY-MM-DD) with no time of day:
 * an assignment is due by the end of that day, in the learner's own time zone.
 */
const DAY_MS = 86_400_000;

function localDate(date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Thu 29 Oct 2026". */
export function dueDateLabel(date: string): string {
  const d = localDate(date);
  return d ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : date;
}

/** Whole days from today to the due date: 0 today, negative once it has passed. */
export function daysUntil(date: string, now = new Date()): number | null {
  const d = localDate(date);
  if (!d) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / DAY_MS);
}

/** "Due today", "Due in 2 days", "3 days overdue"; soon = today, tomorrow or overdue. */
export function dueInLabel(date: string, now = new Date()): { text: string; soon: boolean; overdue: boolean } | null {
  const days = daysUntil(date, now);
  if (days === null) return null;
  if (days < 0) return { text: days === -1 ? "1 day overdue" : `${-days} days overdue`, soon: true, overdue: true };
  if (days === 0) return { text: "Due today", soon: true, overdue: false };
  if (days === 1) return { text: "Due tomorrow", soon: true, overdue: false };
  return { text: `Due in ${days} days`, soon: false, overdue: false };
}

/** Whether something submitted at this moment is after the end of the due date. */
export function isLate(submittedAt: string | Date, dueDate: string): boolean {
  const d = localDate(dueDate);
  if (!d) return false;
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return new Date(submittedAt).getTime() > end.getTime();
}

/** How long ago, roughly: "today", "yesterday", "3 days ago". */
export function daysAgoLabel(when: string | Date, now = new Date()): string {
  const then = new Date(when);
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((b.getTime() - a.getTime()) / DAY_MS);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
