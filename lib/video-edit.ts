/**
 * Auto-edit for long-form lesson recordings: the tutor drops in a recording
 * and gets it back with three fixed quality-of-life edits — subtitles,
 * silences cut, audio evened out. No options for the tutor to choose.
 *
 * The real edit is done by Auphonic (lib/auphonic.ts) once AUPHONIC_API_KEY
 * is set. This file defines the job result and the DEMO implementation, which
 * simulates processing and returns sample numbers/subtitles so the flow can be
 * presented without a key. Demo results are flagged `demo: true` and every
 * screen that shows them says so.
 */

import { auphonicConfigured } from "@/lib/auphonic";

export const EDIT_STEPS = ["subtitles", "silences", "audio"] as const;

export type SubtitleCue = { start: number; end: number; text: string };

export type VideoEditResult = {
  /** Sample output from demo mode — not produced from the tutor's recording. */
  demo: boolean;
  // Figures are null when the editing service didn't report them.
  originalSeconds: number | null;
  editedSeconds: number | null;
  silencesRemoved: number | null;
  secondsRemoved: number | null;
  /** Integrated loudness, e.g. "-27 LUFS" → "-16 LUFS". */
  loudnessBefore: string | null;
  loudnessAfter: string | null;
  subtitleLanguage: string;
  subtitleCues: number;
  wordCount: number;
  /** The first few cues, for the on-screen preview. */
  subtitlePreview: SubtitleCue[];
  /** The subtitle file (WebVTT) the tutor can download / attach on YouTube. */
  vtt: string;
  /** Where to download the edited video (a route on this app). Null in demo mode (there is no file). */
  downloadUrl: string | null;
};

/** How long a demo job stays "processing". Matches the UI's stage list. */
export const DEMO_EDIT_SECONDS = 26;

/** Demo is on until a real processing service is configured, unless switched off. */
export function videoEditDemoEnabled(): boolean {
  return !videoEditConfigured() && (process.env.VIDEO_EDIT_DEMO ?? "").toLowerCase() !== "off";
}

/** Real editing runs on Auphonic and only needs its API key. */
export function videoEditConfigured(): boolean {
  return auphonicConfigured();
}

const SAMPLE_LINES = [
  "Welcome back. In this lesson we're going to look at",
  "the one idea that makes everything else easier.",
  "Let's start with a simple example",
  "and build it up step by step.",
  "Notice what happens when we change this one thing.",
  "That's the pattern you'll use again and again.",
  "Before we move on, a quick recap of the key points.",
  "In the next part we'll put this into practice.",
];

function vttTime(seconds: number): string {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

export function cuesToVtt(cues: SubtitleCue[], note?: string): string {
  return [
    "WEBVTT",
    ...(note ? ["", `NOTE ${note}`] : []),
    ...cues.flatMap((cue, i) => ["", String(i + 1), `${vttTime(cue.start)} --> ${vttTime(cue.end)}`, cue.text]),
    "",
  ].join("\n");
}

function vttSeconds(stamp: string): number {
  const parts = stamp.replace(",", ".").split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Reads the cues out of a WebVTT file (cue settings and tags are dropped). */
export function parseVtt(vtt: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const block of vtt.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((line) => line.includes("-->"));
    if (at < 0) continue;
    const match = lines[at].match(/((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/);
    const text = lines.slice(at + 1).join(" ").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (match && text) cues.push({ start: vttSeconds(match[1]), end: vttSeconds(match[2]), text });
  }
  return cues;
}

/** Sample result for a simulated job. `sourceSeconds` is the real length of the
 *  tutor's file when the browser could read it; everything else is illustrative. */
export function buildDemoEditResult(title: string, sourceSeconds: number | null): VideoEditResult {
  const original = Math.min(4 * 3600, Math.max(30, Math.round(sourceSeconds ?? 12 * 60 + 40)));
  const secondsRemoved = Math.max(4, Math.round(original * 0.11));
  const edited = original - secondsRemoved;
  const topic = title.trim().slice(0, 80) || "this topic";
  const lines = [`Welcome back. Today's lesson: ${topic}.`, ...SAMPLE_LINES.slice(1)];
  const cues: SubtitleCue[] = lines.map((text, i) => ({ start: i * 4, end: i * 4 + 3.6, text }));
  return {
    demo: true,
    originalSeconds: original,
    editedSeconds: edited,
    silencesRemoved: Math.max(3, Math.round(original / 38)),
    secondsRemoved,
    loudnessBefore: "-27 LUFS",
    loudnessAfter: "-16 LUFS",
    subtitleLanguage: "English",
    subtitleCues: Math.max(cues.length, Math.round(edited / 4)),
    wordCount: Math.round(edited * 2.4),
    subtitlePreview: cues,
    vtt: cuesToVtt(cues, "SAMPLE subtitles from demo mode - not transcribed from your recording."),
    downloadUrl: null,
  };
}

/** How the finished video reaches learners. "download": the tutor downloads it
 *  and uploads it to YouTube themselves. "youtube": the app posts it to the
 *  tutor's connected channel (needs VIDEO_DELIVERY=youtube + Google OAuth). */
export type VideoDelivery = "download" | "youtube";
