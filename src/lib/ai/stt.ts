/**
 * Voice input: the browser records the microphone and the server has
 * ElevenLabs transcribe the recording. The browser's own speech recognition is
 * not used: it varies by browser and accent and gave unreliable text.
 *
 * Everything here is plain logic shared by the recorder and the route.
 */

/** Largest recording accepted. A minute and a half of speech is well under this. */
export const STT_MAX_BYTES = 4 * 1024 * 1024;
/** Longest message the assistant accepts, so a transcript never exceeds it. */
const MAX_TRANSCRIPT_CHARS = 2000;

/** Transcription uses the same ElevenLabs key as the assistant's voice. */
export function sttConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export function sttModel(): string {
  return process.env.ELEVENLABS_STT_MODEL?.trim() || "scribe_v2";
}

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
  "audio/aac": "aac", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
};

/** The type and file name to upload a recording under, or null when it is not a recording we accept. */
export function audioUpload(contentType: unknown): { type: string; name: string } | null {
  if (typeof contentType !== "string") return null;
  // "audio/webm;codecs=opus" -> "audio/webm"
  const type = contentType.split(";")[0].trim().toLowerCase();
  const extension = EXTENSIONS[type];
  return extension ? { type, name: `speech.${extension}` } : null;
}

/** The transcript as a chat message: no sound-effect notes, tidy spacing, within the message limit. */
export function cleanTranscript(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    // Notes the transcriber adds for non-speech sounds, such as "(laughter)" or "[music]".
    .replace(/[([][^()[\]]{0,40}[)\]]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim()
    .slice(0, MAX_TRANSCRIPT_CHARS);
}

/** Why the microphone could not be opened, in plain words. Takes the browser's error name. */
export function micErrorMessage(name: unknown): string {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access is blocked for this site. Allow it from the icon in the address bar, then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No microphone was found on this device.";
    case "NotReadableError":
    case "AbortError":
      return "The microphone is in use by another app. Close it and try again.";
    default:
      return "The microphone couldn't be started. Try again.";
  }
}
