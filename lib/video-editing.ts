/**
 * Pure helpers for the in-browser lesson video editor
 * (components/video-editor.tsx): which parts of a take are kept, and where the
 * quiet stretches are. No DOM here, so it can be tested directly.
 */

export type Span = { start: number; end: number };

const lerp = (from: number, to: number, t: number) => from + (to - from) * Math.min(1, Math.max(0, t));

/**
 * Quiet stretches in a recording, from its loudness envelope (one value per
 * `step` seconds). "Quiet" is judged against how loud this speaker normally
 * is, so a soft voice isn't mistaken for silence. Higher sensitivity cuts
 * shorter and less-quiet pauses. A little of each pause is left in so words
 * don't run into each other.
 */
export function findPauses(envelope: ArrayLike<number>, step: number, sensitivity: number): Span[] {
  const count = envelope.length;
  if (!count || step <= 0) return [];
  const sorted = Array.from(envelope).sort((a, b) => a - b);
  const speechLevel = sorted[Math.min(count - 1, Math.floor(count * 0.9))];
  if (speechLevel <= 0) return [];
  const threshold = speechLevel * lerp(0.05, 0.22, sensitivity);
  const minSeconds = lerp(1.5, 0.45, sensitivity);
  const padding = 0.18;

  const pauses: Span[] = [];
  let quietFrom = -1;
  for (let i = 0; i <= count; i++) {
    const quiet = i < count && envelope[i] < threshold;
    if (quiet && quietFrom < 0) quietFrom = i;
    if (!quiet && quietFrom >= 0) {
      const start = quietFrom * step, end = i * step;
      if (end - start >= minSeconds) pauses.push({ start: start + padding, end: end - padding });
      quietFrom = -1;
    }
  }
  return pauses;
}

/** What is left of [trimStart, trimEnd] once the cuts are taken out, in order. */
export function keptSegments(trimStart: number, trimEnd: number, cuts: Span[]): Span[] {
  const kept: Span[] = [];
  let cursor = trimStart;
  for (const cut of [...cuts].sort((a, b) => a.start - b.start)) {
    if (cut.end <= cursor) continue;
    if (cut.start >= trimEnd) break;
    if (cut.start > cursor) kept.push({ start: cursor, end: Math.min(cut.start, trimEnd) });
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < trimEnd) kept.push({ start: cursor, end: trimEnd });
  // Slivers shorter than a fifth of a second would only be a flicker.
  return kept.filter((span) => span.end - span.start >= 0.2);
}

export const totalSeconds = (spans: Span[]) => spans.reduce((sum, span) => sum + (span.end - span.start), 0);

/** Where a moment of the source lands in the edit (seconds from the edit's start), or null if it was cut. */
export function editTimeOf(segments: Span[], sourceTime: number): number | null {
  let before = 0;
  for (const segment of segments) {
    if (sourceTime < segment.start) return null;
    if (sourceTime <= segment.end) return before + (sourceTime - segment.start);
    before += segment.end - segment.start;
  }
  return null;
}
