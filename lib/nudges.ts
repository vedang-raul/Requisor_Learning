import { AppState } from "./types";
import { todayKey } from "./utils";

export interface Nudge {
  id: string;
  message: string;
}

const SEEN_KEY = "requisor-nudge-seen";
const STALE_MS = 1000 * 60 * 60 * 24 * 3; // 3 days

/**
 * Rule-based (no LLM call) nudge detection: a streak about to lapse, or a
 * course with progress that's gone cold. Returns at most one nudge — the
 * caller is responsible for suppressing repeats via markNudgeSeen.
 */
export function getNudge(state: AppState): Nudge | null {
  const today = todayKey();

  if (state.streak.count > 0 && state.streak.lastDay !== today) {
    const id = `streak-${state.streak.lastDay}`;
    if (!wasSeenToday(id)) {
      return {
        id,
        message: `You're on a **${state.streak.count}-day streak** — don't let it slip! Finish one short lesson today to keep it alive. 🔥`,
      };
    }
  }

  for (const course of state.courses) {
    const started = course.lessons.some((l) => {
      const p = state.progress[l.id];
      return p && !p.completed && p.watchPct > 0;
    });
    const finished = course.lessons.length > 0 && course.lessons.every((l) => state.progress[l.id]?.completed);
    if (!started || finished) continue;

    const lastTouch = state.history.find((h) => h.courseSlug === course.slug);
    if (lastTouch && Date.now() - new Date(lastTouch.at).getTime() > STALE_MS) {
      const id = `stalled-${course.slug}`;
      if (!wasSeenToday(id)) {
        return {
          id,
          message: `You started **${course.title}** a few days ago but haven't been back. Want to pick up where you left off?`,
        };
      }
    }
  }

  return null;
}

function wasSeenToday(id: string): boolean {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
    return seen[id] === todayKey();
  } catch {
    return false;
  }
}

export function markNudgeSeen(id: string): void {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
    seen[id] = todayKey();
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // storage unavailable — non-fatal, nudge may just reappear next load
  }
}
