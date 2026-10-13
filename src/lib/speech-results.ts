/**
 * Turns what the browser's speech recognition reports into text.
 *
 * With interim results on, the browser sends a list of pieces on every update.
 * Each piece is either settled ("final") or a guess still being revised. Two
 * things make this less simple than joining the pieces:
 *  - some browsers (Chrome on Android) repeat everything said so far in each
 *    new settled piece, so joining them would say every word several times;
 *  - recognition can end without ever marking the last piece as settled, in
 *    which case the last guess is all there is and must not be thrown away.
 */
export type SpeechPiece = { transcript: string; isFinal: boolean };

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

export function readSpeechResults(pieces: SpeechPiece[]): { /** Everything heard so far, guesses included. */ live: string; /** The settled wording, once no piece is still a guess. */ final: string | null } {
  let settled = "";
  let guess = "";
  for (const piece of pieces) {
    const text = tidy(piece.transcript);
    if (!text) continue;
    if (!piece.isFinal) { guess = tidy(`${guess} ${text}`); continue; }
    // A piece that repeats what is already there replaces it instead of being added again.
    settled = text.toLowerCase().startsWith(settled.toLowerCase()) ? text : tidy(`${settled} ${text}`);
  }
  const live = tidy(`${settled} ${guess}`);
  return { live, final: settled && !guess ? settled : null };
}

/** What the microphone or the recognition service said went wrong, in plain words. "" when it is nothing to report. */
export function speechErrorMessage(code: unknown): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked for this site. Allow it in the browser's address bar and try again.";
    case "audio-capture":
      return "No microphone was found.";
    case "no-speech":
      return "I didn't hear anything. Tap the microphone and try again.";
    case "network":
      return "Voice input needs an internet connection and couldn't reach the speech service.";
    case "language-not-supported":
      return "Voice input isn't available for this language in this browser.";
    default:
      // "aborted" (the user stopped it) and anything unknown.
      return "";
  }
}
