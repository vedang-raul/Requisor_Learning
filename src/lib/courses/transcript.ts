/**
 * Video transcripts for lessons. A tutor pastes one (YouTube's "Show
 * transcript" text, a .vtt or .srt file, or plain text) or fetches the captions
 * of a video on their own channel. Whatever comes in is reduced to short
 * timestamped passages, which is what the learner's assistant reads:
 *
 *   [0:00] Welcome back. Today we look at what makes an agent different…
 *   [0:32] Automation follows rules that someone wrote down in advance…
 */
export const TRANSCRIPT_MAX_CHARS = 120_000;
/** How much of a transcript the assistant is given for one lesson. */
export const TRANSCRIPT_AI_CHARS = 40_000;
/** Captions arrive a few words at a time; passages this long read better and cost less. */
const PASSAGE_SECONDS = 30;

const CLOCK = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}`;
const CUE_TIMING = new RegExp(String.raw`^(${CLOCK})(?:[.,]\d+)?\s*-->`);
const TIME_ONLY = new RegExp(String.raw`^[\[(]?(${CLOCK})[\])]?$`);
const TIME_THEN_TEXT = new RegExp(String.raw`^[\[(]?(${CLOCK})[\])]?[\s:–-]+(\S.*)$`);

function seconds(clock: string): number {
  return clock.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function plain(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Turns pasted or fetched captions into timestamped passages. Returns "" when nothing usable is left. */
export function cleanTranscript(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cues: { at: number | null; text: string }[] = [];
  let at: number | null = null;
  let inNote = false;
  let last = "";

  for (const rawLine of raw.slice(0, TRANSCRIPT_MAX_CHARS * 4).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) { inNote = false; continue; }
    if (inNote) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(line)) { inNote = true; continue; }
    if (/^WEBVTT\b/.test(line) || /^(Kind|Language):/i.test(line) || /^\d+$/.test(line)) continue;

    const timing = CUE_TIMING.exec(line);
    if (timing) { at = seconds(timing[1]); continue; }
    const timeOnly = TIME_ONLY.exec(line);
    if (timeOnly) { at = seconds(timeOnly[1]); continue; }

    let text = line;
    const timed = TIME_THEN_TEXT.exec(line);
    if (timed) { at = seconds(timed[1]); text = timed[2]; }
    text = plain(text);
    // Automatic captions repeat the previous line as the next one scrolls in.
    if (!text || text === last) continue;
    last = text;
    cues.push({ at, text });
  }
  if (!cues.length) return "";

  const lines: string[] = [];
  if (cues.every((cue) => cue.at === null)) {
    lines.push(...cues.map((cue) => cue.text));
  } else {
    let start: number | null = null;
    let passage: string[] = [];
    const flush = () => {
      if (passage.length) lines.push(`${start === null ? "" : `[${formatClock(start)}] `}${passage.join(" ")}`);
      passage = [];
    };
    for (const cue of cues) {
      if (!passage.length || (cue.at !== null && start !== null && cue.at - start >= PASSAGE_SECONDS)) {
        flush();
        start = cue.at;
      }
      passage.push(cue.text);
    }
    flush();
  }
  return lines.join("\n").slice(0, TRANSCRIPT_MAX_CHARS).trim();
}

/** The part of a transcript handed to the assistant, cut at a line break when it is too long. */
export function transcriptForAi(transcript: string): { text: string; truncated: boolean } {
  if (transcript.length <= TRANSCRIPT_AI_CHARS) return { text: transcript, truncated: false };
  const cut = transcript.lastIndexOf("\n", TRANSCRIPT_AI_CHARS);
  return { text: transcript.slice(0, cut > 0 ? cut : TRANSCRIPT_AI_CHARS), truncated: true };
}
