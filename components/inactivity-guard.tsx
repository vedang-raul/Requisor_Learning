"use client";

/**
 * InactivityGuard
 * ───────────────
 * Signs the user out automatically after TIMEOUT_MS of no interaction.
 * Works in tandem with the server-side JWT inactivity check in lib/auth.ts.
 *
 * "Activity" = any mouse move, click, key press, scroll, or touch event.
 */

import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

const TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "visibilitychange",
];

export function InactivityGuard() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        signOut({ callbackUrl: "/" });
      }, TIMEOUT_MS);
    }

    // Start the timer immediately.
    reset();

    // Reset on any user activity.
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset));
    };
  }, []);

  return null;
}
