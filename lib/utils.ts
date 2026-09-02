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

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** Extract a YouTube video ID from an ID or a supported YouTube URL. */
export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (YOUTUBE_VIDEO_ID.test(trimmed)) return trimmed;
  if (!trimmed || trimmed.length > 2048) return null;

  try {
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const hostname = url.hostname.toLowerCase();

    let videoId: string | null = null;
    if (hostname === "youtu.be" || hostname === "www.youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (YOUTUBE_HOSTS.has(hostname)) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (url.pathname === "/watch") videoId = url.searchParams.get("v");
      else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) videoId = parts[1] ?? null;
    }

    return videoId && YOUTUBE_VIDEO_ID.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
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
