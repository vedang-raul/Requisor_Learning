export interface SpeechPreferences { voiceKey: string; muted: boolean }
/** Local-only preference. Legacy shared-browser TTS settings are deliberately not migrated. */
export function speechPreferenceKey(accountId: string) {
  return `requisor-approved-speech:${encodeURIComponent(accountId)}`;
}
export function readSpeechPreferences(storage: Pick<Storage, "getItem">, accountId: string): SpeechPreferences | null {
  try {
    const raw = storage.getItem(speechPreferenceKey(accountId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.voiceKey === "string" && typeof v.muted === "boolean"
      ? { voiceKey: v.voiceKey, muted: v.muted } : null;
  } catch { return null; }
}
export function writeSpeechPreferences(storage: Pick<Storage, "setItem">, accountId: string, value: SpeechPreferences) {
  try { storage.setItem(speechPreferenceKey(accountId), JSON.stringify(value)); } catch { /* Storage may be blocked; playback still works. */ }
}
