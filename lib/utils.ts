import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Session-only flag Settings sets to replay the onboarding walkthrough on
 *  demand — never touches onboarding_done, so it can't re-trigger itself. */
export const REPLAY_TOUR_KEY = "requisor-replay-onboarding-tour";

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Extract a YouTube video ID from any common YouTube URL format. */
export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }
  return null;
}

export function youTubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export const PLACEHOLDER_VIDEO = "REPLACE_ME";

export function isPlaceholder(id: string): boolean {
  return !id || id === PLACEHOLDER_VIDEO;
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
