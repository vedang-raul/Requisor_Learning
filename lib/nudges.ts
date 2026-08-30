import { AppState } from "./types";
import { todayKey } from "./utils";

export interface Nudge {
  id: string;
  message: string;
}

const SEEN_KEY = "requisor-nudge-seen";
const STALE_MS = 1000 * 60 * 60 * 24 * 3; // 3 days

/**
 * Rule-based (no LLM call) proactive-guide nudge. Checked in priority order —
 * a completed course takes precedence over a stalled one, which takes
 * precedence over a first-time welcome — and only the first unseen match for
 * today is returned. The caller suppresses repeats via markNudgeSeen.
 */
export function getNudge(state: AppState): Nudge | null {
  // 1. Just finished a course — celebrate and point to what's next.
  for (const course of state.courses) {
    if (course.lessons.length === 0) continue;
    const finished = course.lessons.every((l) => state.progress[l.id]?.completed);
    if (!finished) continue;
    const lastTouch = state.history.find((h) => h.courseSlug === course.slug);
    if (!lastTouch || Date.now() - new Date(lastTouch.at).getTime() > STALE_MS) continue;

    const id = `finished-${course.slug}`;
    if (wasSeenToday(id)) continue;
    const next = state.courses.find(
      (c) => c.slug !== course.slug && c.lessons.length > 0 && !c.lessons.every((l) => state.progress[l.id]?.completed)
    );
    return {
      id,
      message: next
        ? `Nice work finishing **${course.title}**! Want a recommendation for what to tackle next — maybe **${next.title}**?`
        : `Nice work finishing **${course.title}**! Ask me anytime if you want a refresher or a new path to explore.`,
    };
  }

  // 2. A course has progress that's gone cold.
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

  // 3. Brand-new user — nothing started anywhere yet. Offer to point them
  // toward the right path instead of waiting for them to ask.
  const hasAnyProgress = state.courses.some((c) => c.lessons.some((l) => state.progress[l.id]?.watchPct));
  if (!hasAnyProgress && state.courses.length > 0) {
    const id = "welcome-new-user";
    if (!wasSeenToday(id)) {
      return {
        id,
        message: `Hi${state.user?.name ? ` ${state.user.name.split(" ")[0]}` : ""} — I'm your Requisor guide. Tell me a bit about your role or what you want to learn, and I'll point you to the best-suited path.`,
      };
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
