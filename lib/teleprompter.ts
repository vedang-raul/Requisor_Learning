/**
 * Script handling for the lesson recorder's teleprompter
 * (components/video-recorder.tsx): parsing the tutor's plain-text script and
 * following along as they speak it.
 */

export type ScriptBlock =
  | { kind: "heading"; text: string; time: string | null; at: number }
  | { kind: "cue"; text: string; at: number }
  | { kind: "say"; words: string[]; at: number };

/** A word as the speech recogniser would hear it: lower case, no punctuation. */
export const normalizeWord = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

/**
 * A script is plain text with two optional marks, so tutors can type it anywhere:
 *   "# Cold open 0:25"  a section heading (the time at the end is optional)
 *   "> Share screen"    a note to self / stage direction, not to be read aloud
 * Everything else is what they say; a blank line starts a new paragraph.
 * at is the index, among all spoken words, of the block's first (or next) word.
 */
export function parseScript(script: string): { blocks: ScriptBlock[]; words: string[] } {
  const blocks: ScriptBlock[] = [];
  const words: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (!paragraph.length) return;
    const said = paragraph.join(" ").split(/\s+/).filter(Boolean);
    blocks.push({ kind: "say", words: said, at: words.length });
    words.push(...said);
    paragraph = [];
  };
  for (const raw of script.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("#")) {
      flush();
      const text = line.replace(/^#+\s*/, "");
      const time = text.match(/\s+(\d{1,2}:\d{2}(?::\d{2})?)$/);
      blocks.push({ kind: "heading", text: time ? text.slice(0, time.index).trim() : text, time: time ? time[1] : null, at: words.length });
    } else if (line.startsWith(">")) {
      flush();
      blocks.push({ kind: "cue", text: line.replace(/^>+\s*/, ""), at: words.length });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return { blocks, words };
}

const NUMBER_WORDS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
  "10": "ten", "11": "eleven", "12": "twelve", "13": "thirteen", "14": "fourteen", "15": "fifteen", "16": "sixteen", "17": "seventeen",
  "18": "eighteen", "19": "nineteen", "20": "twenty", "30": "thirty", "40": "forty", "50": "fifty", "60": "sixty", "70": "seventy",
  "80": "eighty", "90": "ninety", "100": "hundred", "1st": "first", "2nd": "second", "3rd": "third",
};
const canonical = (word: string) => { const plain = word.replace(/'/g, ""); return NUMBER_WORDS[plain] ?? plain; };

function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

/**
 * Roughly how a word sounds: its consonants in order ("colleague" and
 * "college" are both "klg"; "their" and "there" are both "tr"). Recognisers
 * mostly confuse words that sound alike, and since we already know what the
 * script says next, sounding alike is good enough.
 */
function soundKey(word: string): string {
  const s = word.replace(/ph/g, "f").replace(/ck/g, "k").replace(/[cq]/g, "k").replace(/z/g, "s").replace(/gh/g, "");
  const key = s[0] + s.slice(1).replace(/[aeiouhwy]/g, "");
  return [...key].filter((ch, i, all) => ch !== all[i - 1]).join("");
}

/**
 * Whether a heard word is the script word, allowing for what speech
 * recognition gets wrong: "5" for "five", "models" for "model", "its" for
 * "it's", a letter or two off in a longer word, or a sound-alike such as
 * "college" for "colleague".
 */
export function wordsMatch(scriptWord: string, heardWord: string): boolean {
  const a = canonical(scriptWord), b = canonical(heardWord);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter < 4) return false;
  if ((a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 3) return true; // plural, tense
  if (shorter >= 5 && Math.abs(a.length - b.length) <= 3 && soundKey(a) === soundKey(b)) return true; // sound-alike
  return editDistance(a, b, shorter >= 8 ? 2 : 1) <= (shorter >= 8 ? 2 : 1);
}

/**
 * Finds where the speaker has got to. tail is the last few words heard (most
 * recent last); the answer is the position just after them in the script.
 *
 * It anchors on the END of what was heard, so the position lands on the
 * newest word rather than trailing it, and it looks for the longest phrase
 * first: four words in a row can be found well ahead (the speaker skipped a
 * passage, or tracking fell behind and must catch up), while a single word
 * only counts right at the current position, so a stray "the" can't throw it
 * forward. The position never moves backwards.
 *
 * The script is the guide: when the words around a spot fit, one word in the
 * phrase is allowed to be completely wrong (a name or a bit of jargon the
 * recogniser mangled), so a single hard word can't hold everything up.
 */
export function followSpeech(script: string[], position: number, tail: string[]): number {
  const spokenIndexes: number[] = []; // script indexes that hold a real word
  for (let i = 0; i < script.length; i++) if (script[i]) spokenIndexes.push(i);
  let here = spokenIndexes.findIndex((i) => i >= position);
  if (here < 0) return script.length;
  const after = (k: number) => (k + 1 < spokenIndexes.length ? spokenIndexes[k + 1] : script.length);

  /** Looks for the last `size` heard words, up to `reach` words ahead, tolerating `misses` wrong words. */
  const find = (size: number, reach: number, misses: number): number | null => {
    const phrase = tail.slice(-size);
    // The phrase may begin on words already passed, as long as it ends beyond the position.
    const first = Math.max(0, here - (size - 1));
    for (let start = first; start <= here + reach && start + size <= spokenIndexes.length; start++) {
      const end = start + size - 1;
      if (end < here) continue;
      let wrong = 0;
      for (let k = 0; k < size && wrong <= misses; k++) if (!wordsMatch(script[spokenIndexes[start + k]], phrase[k])) wrong++;
      if (wrong <= misses) return after(end);
    }
    return null;
  };

  for (let size = Math.min(4, tail.length); size >= 1; size--) {
    // A two-word phrase made of tiny words ("of the") is too common to trust far ahead.
    const weak = size === 2 && tail.slice(-2).join("").length < 7;
    const exact = find(size, size >= 3 ? 60 : size === 2 ? (weak ? 3 : 16) : 2, 0);
    if (exact !== null) return exact;
    // One word wrong is fine when the rest fits, but only close to where we already are.
    if (size >= 3) {
      const near = find(size, size === 4 ? 6 : 2, 1);
      if (near !== null) return near;
    }
  }
  return spokenIndexes[here];
}

/* ── AI-drafted scripts ────────────────────────────────────────────────── */

/** A comfortable pace for reading aloud to camera. */
export const SCRIPT_WORDS_PER_MINUTE = 140;
/** Lengths a tutor can ask for. Longer scripts are better written (and recorded) in parts. */
export const SCRIPT_MINUTES = [1, 2, 3, 5, 8, 10] as const;

/** What the lesson wizard knows about the lesson when the recorder opens (its step 1). */
export type LessonBrief = { title: string; description: string; courseTitle: string; section: string; lessonMinutes: number | null };
export type ScriptBrief = { title: string; description: string; courseTitle: string; section: string; notes: string; minutes: number };

/** Where the wizard leaves the lesson brief for the recorder tab it opens (same browser, keyed by session id). */
export const lessonBriefKey = (sessionId: string) => "requisor-recorder-brief:" + sessionId;

const briefText = (value: unknown, max: number) =>
  (typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

/** The longest offered length that fits the lesson, and 5 minutes at most unless the tutor picks more. */
export function defaultScriptMinutes(lessonMinutes: number | null | undefined): number {
  const cap = Math.min(5, typeof lessonMinutes === "number" && Number.isFinite(lessonMinutes) && lessonMinutes > 0 ? lessonMinutes : 5);
  return [...SCRIPT_MINUTES].reverse().find((m) => m <= cap) ?? SCRIPT_MINUTES[0];
}

/** Cleans a request for a script. Null when there is no lesson title to write about. */
export function scriptBrief(value: unknown): ScriptBrief | null {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const title = briefText(raw.title, 200);
  if (!title) return null;
  const asked = Number(raw.minutes);
  return {
    title,
    description: briefText(raw.description, 2000),
    courseTitle: briefText(raw.courseTitle, 160),
    section: briefText(raw.section, 200),
    notes: briefText(raw.notes, 500),
    minutes: (SCRIPT_MINUTES as readonly number[]).includes(asked) ? asked : defaultScriptMinutes(Number(raw.lessonMinutes)),
  };
}

/**
 * Tidies what the model returns into the teleprompter's plain format: code
 * fences, bold marks and bullet symbols are removed, "##" headings become "#".
 */
export function cleanGeneratedScript(value: unknown): string {
  if (typeof value !== "string") return "";
  const lines = value.replace(/\r/g, "").replace(/```[a-z]*\n?/gi, "").split("\n").map((line) => {
    let text = line.trim().replace(/\*\*|__/g, "").replace(/^[-*•]\s+/, "");
    if (/^#+/.test(text)) text = "# " + text.replace(/^#+\s*/, "");
    else if (/^>+/.test(text)) text = "> " + text.replace(/^>+\s*/, "");
    return text;
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 12000);
}
