"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Measures time on each app page for the super admin's Activity tab, posting
 * to /api/activity. A second only counts while the tab is visible and the
 * person is actually there: they moved, typed or scrolled in the last two
 * minutes, or a video is playing (including an embedded YouTube player they
 * clicked into). Renders nothing.
 */
const IDLE_AFTER_MS = 2 * 60_000;
const SEND_EVERY_S = 15;

function newViewId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Older browsers: a random version-4 UUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function watchingVideo(): boolean {
  if (document.activeElement?.tagName === "IFRAME") return true;
  return Array.from(document.querySelectorAll("video")).some((v) => !v.paused && !v.ended);
}

export function ActivityTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const view = useRef<{ id: string; path: string; search: string; pending: number } | null>(null);
  const lastInput = useRef(Date.now());

  const send = (useBeacon = false) => {
    const current = view.current;
    if (!current) return;
    const payload = JSON.stringify({ viewId: current.id, path: current.path, search: current.search, seconds: current.pending });
    current.pending = 0;
    try {
      if (useBeacon && navigator.sendBeacon) navigator.sendBeacon("/api/activity/", new Blob([payload], { type: "application/json" }));
      else void fetch("/api/activity/", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
    } catch { /* analytics never breaks the page */ }
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  // A new page: finish the last visit, start counting this one.
  useEffect(() => {
    if (view.current) sendRef.current();
    view.current = { id: newViewId(), path: pathname, search, pending: 0 };
    sendRef.current(); // records the visit right away
  }, [pathname, search]);

  useEffect(() => {
    const onInput = () => { lastInput.current = Date.now(); };
    const events = ["pointermove", "pointerdown", "keydown", "scroll", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    let sinceSend = 0;
    const tick = setInterval(() => {
      const current = view.current;
      if (!current || document.visibilityState !== "visible") return;
      if (Date.now() - lastInput.current < IDLE_AFTER_MS || watchingVideo()) current.pending += 1;
      if (++sinceSend >= SEND_EVERY_S) {
        sinceSend = 0;
        if (current.pending > 0) sendRef.current();
      }
    }, 1000);
    const flush = () => { if (view.current?.pending) sendRef.current(true); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(tick);
      events.forEach((e) => window.removeEventListener(e, onInput));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  return null;
}
