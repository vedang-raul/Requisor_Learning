/**
 * Recognising short spoken commands for hands-free use of the assistant:
 * answering a confirmation card with "yes"/"no", ending hands-free mode with
 * "stop", and the "Hey Requisor" wake phrase. Plain functions, no browser APIs.
 */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // accents: "sí" -> "si"
    .replace(/[^\p{L}\p{M}\p{N}\s']/gu, " ") // keep marks such as the Hindi "ँ"
    .replace(/\s+/g, " ")
    .trim();
}

// Whole utterances only (short answers), so "no, I meant the other lesson"
// or "yes but change the title" still go to the assistant as a message.
const YES = new Set([
  "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "confirm", "confirmed", "do it", "go ahead", "please do",
  "yes please", "yes do it", "yes go ahead", "that's right", "correct", "sounds good",
  "si", "oui", "ja", "sim", "haan", "ha", "han", "हाँ", "हां", "जी हाँ", "होय", "نعم", "是", "对", "好",
]);
const NO = new Set([
  "no", "nope", "nah", "cancel", "don't", "do not", "no thanks", "no thank you", "never mind", "nevermind", "stop",
  "non", "nein", "nao", "nahi", "nahin", "नहीं", "नही", "नाही", "لا", "不", "不要",
]);

/** A spoken answer to a confirmation card: "yes", "no", or null when it's a real message. */
export function classifySpokenAnswer(text: string): "yes" | "no" | null {
  const said = normalize(text);
  if (!said || said.split(" ").length > 4) return null;
  if (YES.has(said)) return "yes";
  if (NO.has(said)) return "no";
  return null;
}

const STOP = new Set([
  "stop", "stop listening", "stop hands free", "hands free off", "turn off hands free", "goodbye", "bye",
  "that's all", "that's it", "exit", "quit", "end", "be quiet",
]);

/** Ends hands-free mode instead of being sent to the assistant. */
export function isStopCommand(text: string): boolean {
  return STOP.has(normalize(text));
}

/**
 * Phrases the on-device recogniser listens for. "Requisor" isn't in its
 * vocabulary, so these are real-word sound-alikes of "Hey Requisor"; anything
 * else falls into "[unk]". See src/lib/voice/wake-word.ts.
 */
export const WAKE_GRAMMAR = [
  "hey requisite", "hey request sir", "hey require sir", "hey requires her",
  "hi requisite", "okay requisite", "[unk]",
];

/**
 * What the on-device recogniser listens for while the assistant is speaking,
 * so it can be interrupted by voice (the normal voice input is off then, so
 * the assistant doesn't hear itself). All real words, so no sound-alikes needed.
 */
export const STOP_GRAMMAR = ["stop", "stop talking", "stop it", "stop please", "please stop", "be quiet", "quiet", "cancel", "enough", "shut up"];

/**
 * The recogniser heard a stop phrase on its own. Sounds before it ("[unk]",
 * often the assistant's own voice) are ignored; anything else said with it
 * isn't, so "stop" inside a longer sentence doesn't count.
 */
export function isStopUtterance(text: string): boolean {
  const tokens = normalize(text).split(" ").filter(Boolean);
  while (tokens[0] === "unk") tokens.shift();
  return STOP_GRAMMAR.includes(tokens.join(" "));
}

/** Edit distance, for loose matching of what the recogniser heard. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/**
 * A finished recognition (after a pause) that is the wake phrase on its own.
 * "Hey Requisor" then a pause wakes; "hey, request a quiz for me" doesn't,
 * because the recogniser hears more speech ("[unk]") after it. Leading noise
 * before the greeting is ignored. Tested against real recognitions — see
 * tests/unit/voice-commands.test.ts.
 */
export function isWakeUtterance(text: string): boolean {
  const tokens = normalize(text).split(" ").filter(Boolean);
  while (tokens[0] === "unk") tokens.shift();
  if (!tokens.length || tokens.length > 4 || tokens.includes("unk")) return false;
  return isWakePhrase(tokens.join(" "));
}

/**
 * Whether some text contains the wake phrase: a greeting ("hey", "hi",
 * "okay") followed by something that, run together, sounds like "requisor"
 * ("requisite", "request sir", "require sir"…). Plain "hey" or "request" alone
 * doesn't count. isWakeUtterance adds the "on its own" rule used for waking.
 */
export function isWakePhrase(text: string): boolean {
  const words = normalize(text).split(" ").filter((w) => w && w !== "[unk]" && w !== "unk");
  for (let i = 0; i < words.length; i++) {
    if (!["hey", "hi", "hay", "okay", "ok"].includes(words[i])) continue;
    for (let len = 1; len <= 3 && i + len < words.length; len++) {
      const joined = words.slice(i + 1, i + 1 + len).join("");
      if (joined.length < 6 || !/^re[ckq]/.test(joined)) continue;
      if (distance(joined, "requisor") <= 3 || distance(joined, "requisitor") <= 3) return true;
    }
  }
  return false;
}
