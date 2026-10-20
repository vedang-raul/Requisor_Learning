"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MotionConfig } from "framer-motion";
import { useSession } from "next-auth/react";
import {
  ACCESSIBILITY_UPDATED,
  accessibilityClasses,
  NO_ACCESSIBILITY_PREFS,
  sanitizeAccessibilityPrefs,
  type AccessibilityPrefs,
} from "@/lib/accessibility/preferences";

/**
 * Applies the signed-in person's accessibility preferences to every page:
 * classes on <html> for text size, contrast, motion and focus (globals.css),
 * and framer-motion's animations. The last-known choice is kept on this
 * device so pages don't flash back to the defaults while it loads.
 */

const CACHE_KEY = "requisor-accessibility";

type AccessibilityContextValue = {
  prefs: AccessibilityPrefs;
  /** Shows these preferences right away without saving them (onboarding preview). */
  preview(prefs: AccessibilityPrefs): void;
  /** Saves them to the account and applies them. */
  save(prefs: AccessibilityPrefs): Promise<void>;
};

const AccessibilityContext = createContext<AccessibilityContextValue>({
  prefs: NO_ACCESSIBILITY_PREFS,
  preview: () => {},
  save: async () => {},
});

export function useAccessibility() {
  return useContext(AccessibilityContext);
}

function readCache(): AccessibilityPrefs {
  try { return sanitizeAccessibilityPrefs(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}")); } catch { return NO_ACCESSIBILITY_PREFS; }
}
function writeCache(prefs: AccessibilityPrefs | null) {
  try {
    if (prefs) localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* private window */ }
}

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(NO_ACCESSIBILITY_PREFS);

  // Signed in: start from this device's copy, then the account's saved choice. Signed out: defaults.
  useEffect(() => {
    if (status === "unauthenticated") { setPrefs(NO_ACCESSIBILITY_PREFS); writeCache(null); return; }
    if (status !== "authenticated") return;
    setPrefs(readCache());
    let cancelled = false;
    fetch("/api/accessibility/")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { prefs?: unknown } | null) => {
        if (cancelled || !data) return;
        const saved = sanitizeAccessibilityPrefs(data.prefs);
        setPrefs(saved);
        writeCache(saved);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [status]);

  useEffect(() => {
    const root = document.documentElement;
    const classes = accessibilityClasses(prefs);
    root.classList.add(...classes);
    return () => root.classList.remove(...classes);
  }, [prefs]);

  const save = useCallback(async (next: AccessibilityPrefs) => {
    const clean = sanitizeAccessibilityPrefs(next);
    setPrefs(clean);
    writeCache(clean);
    const res = await fetch("/api/accessibility/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs: clean }),
    });
    if (!res.ok) throw new Error("Couldn't save your accessibility settings.");
    // The assistant turns its voice features on or off to match.
    window.dispatchEvent(new CustomEvent(ACCESSIBILITY_UPDATED, { detail: clean }));
  }, []);

  const value = useMemo(() => ({ prefs, preview: setPrefs, save }), [prefs, save]);

  return (
    <AccessibilityContext.Provider value={value}>
      {/* The device's "reduce motion" setting always counts; the account's choice can add to it. */}
      <MotionConfig reducedMotion={prefs.reduceMotion ? "always" : "user"}>{children}</MotionConfig>
    </AccessibilityContext.Provider>
  );
}
