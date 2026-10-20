/**
 * Accessibility preferences a person chooses during onboarding (and can
 * change later in Settings). Each one switches on a specific adjustment, so
 * nobody has to cope with features they don't need. Stored per account in
 * users.accessibility; applied site-wide by AccessibilityProvider
 * (src/components/layout/accessibility-provider.tsx).
 */

export type AccessibilityPrefs = {
  /** Text and controls about 20% larger. */
  largerText: boolean;
  /** Darker text, stronger borders and focus outlines. */
  highContrast: boolean;
  /** No animations, even if the device doesn't ask for that. */
  reduceMotion: boolean;
  /** The assistant answers in short sentences and everyday words. */
  simpleLanguage: boolean;
  /** "Hey Requisor" is turned on, so the assistant can be used by voice. */
  voiceControl: boolean;
  /** Bold focus outlines, and the assistant's replies appear at once instead of being typed out. */
  screenReader: boolean;
};

export const NO_ACCESSIBILITY_PREFS: AccessibilityPrefs = {
  largerText: false,
  highContrast: false,
  reduceMotion: false,
  simpleLanguage: false,
  voiceControl: false,
  screenReader: false,
};

export const ACCESSIBILITY_OPTIONS: { key: keyof AccessibilityPrefs; label: string; description: string }[] = [
  { key: "largerText", label: "Larger text", description: "Makes text and buttons bigger and easier to read." },
  { key: "highContrast", label: "Higher contrast", description: "Darker text and clearer outlines." },
  { key: "reduceMotion", label: "Less motion", description: "Turns off animations and moving effects." },
  { key: "simpleLanguage", label: "Simpler wording", description: "The assistant explains things in short, plain sentences." },
  { key: "voiceControl", label: "Use my voice", description: "Say “Hey Requisor” to ask the assistant anything, hands-free." },
  { key: "screenReader", label: "Screen reader or keyboard", description: "Bold focus outlines, and replies appear all at once." },
];

/** Keeps only the known switches, as booleans; anything else is dropped. */
export function sanitizeAccessibilityPrefs(value: unknown): AccessibilityPrefs {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const prefs = { ...NO_ACCESSIBILITY_PREFS };
  for (const key of Object.keys(prefs) as (keyof AccessibilityPrefs)[]) prefs[key] = source[key] === true;
  return prefs;
}

/** The classes put on <html> for the preferences that change how the page looks (see globals.css). */
export function accessibilityClasses(prefs: AccessibilityPrefs): string[] {
  return [
    prefs.largerText && "a11y-large-text",
    prefs.highContrast && "a11y-high-contrast",
    prefs.reduceMotion && "a11y-reduce-motion",
    prefs.screenReader && "a11y-focus",
  ].filter((c): c is string => Boolean(c));
}

/** Sent by AccessibilityProvider whenever the preferences are saved, with the new prefs as detail. */
export const ACCESSIBILITY_UPDATED = "requisor:accessibility-updated";
